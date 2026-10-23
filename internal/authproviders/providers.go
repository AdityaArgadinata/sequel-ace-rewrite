// Package authproviders resolves short-lived secrets only when connecting.
package authproviders

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

type SASettings struct {
	Provider       string `json:"provider,omitempty"`
	Region         string `json:"region,omitempty"`
	AWSProfile     string `json:"awsProfile,omitempty"`
	VaultAddress   string `json:"vaultAddress,omitempty"`
	VaultMount     string `json:"vaultMount,omitempty"`
	VaultRole      string `json:"vaultRole,omitempty"`
	VaultNamespace string `json:"vaultNamespace,omitempty"`
}
type SAOptions struct {
	Settings   SASettings `json:"settings"`
	VaultToken string     `json:"vaultToken,omitempty"`
}

func Validate(s SASettings) error {
	if s.Provider == "" {
		return nil
	}
	if s.Provider == "aws" {
		if s.Region == "" || len(s.Region) > 100 || strings.HasPrefix(s.Region, "-") || len(s.AWSProfile) > 200 || strings.ContainsAny(s.AWSProfile, "\x00\r\n") {
			return errors.New("AWS IAM requires a region and valid CLI profile")
		}
		for _, c := range s.Region {
			if !(c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '-') {
				return errors.New("invalid AWS region")
			}
		}
		return nil
	}
	if s.Provider != "vault" {
		return errors.New("unknown authentication provider")
	}
	if len(s.VaultNamespace) > 500 || strings.ContainsAny(s.VaultNamespace, "\x00\r\n") || len(s.VaultAddress) > 2048 {
		return errors.New("invalid Vault address or namespace")
	}
	u, err := url.Parse(s.VaultAddress)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "" && u.Path != "/" {
		return errors.New("Vault requires an HTTPS server origin without credentials, path or query")
	}
	for _, part := range []string{s.VaultMount, s.VaultRole} {
		if part == "" || len(part) > 200 {
			return errors.New("Vault mount and role are required")
		}
		for _, c := range part {
			if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '_' || c == '-') {
				return errors.New("Vault mount/role must contain letters, numbers, _ or -")
			}
		}
	}
	return nil
}
func Resolve(ctx context.Context, o SAOptions, host string, port int, user string) (string, string, error) {
	if err := Validate(o.Settings); err != nil {
		return "", "", err
	}
	s := o.Settings
	if s.Provider == "aws" {
		args := []string{"rds", "generate-db-auth-token", "--hostname", host, "--port", strconv.Itoa(port), "--username", user, "--region", s.Region}
		if s.AWSProfile != "" {
			args = append(args, "--profile", s.AWSProfile)
		}
		command := exec.CommandContext(ctx, "aws", args...)
		command.Stderr = io.Discard
		output, err := command.StdoutPipe()
		if err != nil {
			return "", "", errors.New("cannot start AWS CLI")
		}
		if err = command.Start(); err != nil {
			return "", "", errors.New("AWS CLI is unavailable; install/configure aws before using IAM")
		}
		data, readErr := io.ReadAll(io.LimitReader(output, 65537))
		if readErr != nil || len(data) > 65536 {
			command.Process.Kill()
		}
		err = command.Wait()
		token := strings.TrimSpace(string(data))
		if err != nil || readErr != nil || len(data) > 65536 || token == "" {
			return "", "", errors.New("AWS token generation failed; check CLI credentials, region and profile")
		}
		return user, token, nil
	}
	if s.Provider != "vault" || o.VaultToken == "" || len(o.VaultToken) > 16384 {
		return "", "", errors.New("Vault token is required")
	}
	return vaultCredentials(ctx, o, &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }})
}
func vaultCredentials(ctx context.Context, o SAOptions, client *http.Client) (string, string, error) {
	s := o.Settings
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(s.VaultAddress, "/")+"/v1/"+s.VaultMount+"/creds/"+s.VaultRole, nil)
	if err != nil {
		return "", "", errors.New("invalid Vault request")
	}
	request.Header.Set("X-Vault-Token", o.VaultToken)
	if s.VaultNamespace != "" {
		request.Header.Set("X-Vault-Namespace", s.VaultNamespace)
	}
	response, err := client.Do(request)
	if err != nil {
		return "", "", errors.New("Vault connection failed; check HTTPS trust and server address")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return "", "", errors.New("Vault denied credential issuance; check token, mount, role and namespace")
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, 65537))
	if err != nil || len(data) > 65536 {
		return "", "", errors.New("invalid Vault response size")
	}
	var result struct {
		Data struct {
			Username string `json:"username"`
			Password string `json:"password"`
		} `json:"data"`
	}
	if json.Unmarshal(data, &result) != nil || result.Data.Username == "" || result.Data.Password == "" {
		return "", "", errors.New("Vault response did not contain database credentials")
	}
	return result.Data.Username, result.Data.Password, nil
}
