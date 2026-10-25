package main

import (
	"context"
	"errors"
	"net/http"
	"sequel-rewrite/internal/updates"
	"time"
)

// CI injects the complete release tag; local builds stay explicitly development.
var buildVersion = "dev"

func (a *App) CheckForUpdates(preview bool) (updates.Result, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	client := &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error {
		return errors.New("release metadata redirects are not followed")
	}}
	return updates.Check(ctx, client, updates.Endpoint, buildVersion, preview)
}
