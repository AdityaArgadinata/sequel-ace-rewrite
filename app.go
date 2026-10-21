package main

import (
	"context"
	"errors"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
	"runtime"
	"sequel-rewrite/internal/credentials"
	"sequel-rewrite/internal/database"
	"sequel-rewrite/internal/history"
	"sequel-rewrite/internal/profiles"
	"sequel-rewrite/internal/workspace"
)

type App struct {
	workspace   workspace.Manager
	ctx         context.Context
	profiles    *profiles.Store
	credentials *credentials.Store
	history     history.Store
}

func NewApp() *App                                                      { return &App{profiles: profiles.NewStore(""), credentials: credentials.New()} }
func (a *App) ListProfiles() ([]profiles.Profile, error)                { return a.profiles.List() }
func (a *App) SaveProfile(p profiles.Profile) (profiles.Profile, error) { return a.profiles.Save(p) }
func (a *App) DeleteProfile(id string) error {
	if _, err := a.profiles.Get(id); err != nil {
		return err
	}
	// Do not silently leave a stored credential behind when deleting its profile.
	if err := a.credentials.Delete(id); err != nil {
		return err
	}
	return a.profiles.Delete(id)
}
func (a *App) SaveCredentials(id string, secrets credentials.Secrets) error {
	p, err := a.profiles.Get(id)
	if err != nil {
		return err
	}
	return a.credentials.Save(p, secrets)
}
func (a *App) LoadCredentials(id string) (credentials.Secrets, error) {
	p, err := a.profiles.Get(id)
	if err != nil {
		return credentials.Secrets{}, err
	}
	return a.credentials.Load(p)
}
func (a *App) DeleteCredentials(id string) error {
	if _, err := a.profiles.Get(id); err != nil {
		return err
	}
	return a.credentials.Delete(id)
}
func (a *App) ListHistory() ([]history.Entry, error)         { return a.history.List() }
func (a *App) ClearHistory() error                           { return a.history.Clear() }
func (a *App) Platform() string                              { return runtime.GOOS + "/" + runtime.GOARCH }
func (a *App) startup(ctx context.Context)                   { a.ctx = ctx }
func (a *App) Connect(c database.Connection) (string, error) { return a.workspace.Open(&c) }
func (a *App) NewTab() (string, error)                       { return a.workspace.Open(nil) }
func (a *App) CloseTab(tab string) error                     { return a.workspace.Close(tab) }
func (a *App) Disconnect()                                   { a.workspace.Shutdown() }
func (a *App) Connected(tab string) bool {
	s, err := a.workspace.Session(tab)
	return err == nil && s.Connected()
}
func (a *App) Cancel(tab string) {
	if s, err := a.workspace.Session(tab); err == nil {
		s.Cancel()
	}
}
func (a *App) Query(tab, statement string) (database.Result, error) {
	s, err := a.workspace.Session(tab)
	if err != nil {
		return database.Result{}, err
	}
	return s.Query(statement)
}
func (a *App) Databases(tab string) (database.Result, error) {
	s, err := a.workspace.Session(tab)
	if err != nil {
		return database.Result{}, err
	}
	return s.Databases()
}
func (a *App) Tables(tab, name string) (database.Result, error) {
	s, err := a.workspace.Session(tab)
	if err != nil {
		return database.Result{}, err
	}
	return s.Tables(name)
}
func (a *App) UseDatabase(tab, name string) error {
	s, err := a.workspace.Session(tab)
	if err != nil {
		return err
	}
	return s.UseDatabase(name)
}
func (a *App) Browse(tab string, r database.BrowseRequest) (database.Result, error) {
	s, err := a.workspace.Session(tab)
	if err != nil {
		return database.Result{}, err
	}
	return s.Browse(r)
}
func (a *App) StreamQuery(tab, id, statement string, recordHistory bool) (database.Result, error) {
	if a.ctx == nil || id == "" || len(id) > 128 {
		return database.Result{}, errors.New("query stream requires desktop and request ID")
	}
	s, err := a.workspace.Session(tab)
	if err != nil {
		return database.Result{}, err
	}
	output, err := s.Stream(statement, func(batch database.Batch) {
		wailsruntime.EventsEmit(a.ctx, "query:batch", struct {
			ID    string         `json:"id"`
			Batch database.Batch `json:"batch"`
		}{id, batch})
	})
	if recordHistory {
		if historyErr := a.history.Add(statement, len(output.Rows), output.DurationMS, err == nil); historyErr != nil {
			wailsruntime.EventsEmit(a.ctx, "history:error", "History could not be saved; query outcome is unchanged.")
		}
	}
	return output, err
}
func (a *App) shutdown(context.Context) { a.workspace.Shutdown() }
