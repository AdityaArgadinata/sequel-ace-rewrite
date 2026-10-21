// Package credentials keeps secrets in the OS vault, never in profile files.
package credentials

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"sequel-rewrite/internal/profiles"

	"github.com/zalando/go-keyring"
)

const service = "SequelRewrite"

type Secrets struct {
	Password      string `json:"password"`
	SSHPassword   string `json:"sshPassword"`
	KeyPassphrase string `json:"keyPassphrase"`
}
type envelope struct {
	Fingerprint string  `json:"fingerprint"`
	Secrets     Secrets `json:"secrets"`
}
type Store struct {
	get    func(string, string) (string, error)
	set    func(string, string, string) error
	remove func(string, string) error
}

func New() *Store { return &Store{keyring.Get, keyring.Set, keyring.Delete} }
func fingerprint(p profiles.Profile) string {
	b, _ := json.Marshal(p)
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}
func (s *Store) Save(p profiles.Profile, secret Secrets) error {
	if p.ID == "" {
		return errors.New("save the connection profile before storing passwords")
	}
	b, err := json.Marshal(envelope{fingerprint(p), secret})
	if err != nil {
		return err
	}
	if len(b) > 2000 {
		return errors.New("password bundle exceeds credential store limit")
	}
	if err = s.set(service, p.ID, string(b)); err != nil {
		return errors.New("credential store unavailable or denied; passwords were not saved, enter them when connecting")
	}
	return nil
}
func (s *Store) Load(p profiles.Profile) (Secrets, error) {
	raw, err := s.get(service, p.ID)
	if errors.Is(err, keyring.ErrNotFound) {
		return Secrets{}, errors.New("no saved passwords for this profile")
	}
	if err != nil {
		return Secrets{}, errors.New("credential store unavailable or denied; enter passwords manually")
	}
	var e envelope
	if len(raw) > 2000 || json.Unmarshal([]byte(raw), &e) != nil || e.Fingerprint != fingerprint(p) {
		return Secrets{}, errors.New("saved passwords no longer match this profile; enter and save them again")
	}
	return e.Secrets, nil
}
func (s *Store) Delete(id string) error {
	err := s.remove(service, id)
	if err != nil && !errors.Is(err, keyring.ErrNotFound) {
		return errors.New("credential store unavailable or denied; saved passwords could not be removed")
	}
	return nil
}
