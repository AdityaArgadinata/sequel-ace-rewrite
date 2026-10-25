package main

import (
	"context"
	"errors"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
	"runtime"
	"sequel-rewrite/internal/credentials"
	"sequel-rewrite/internal/database"
	"sequel-rewrite/internal/history"
	"sequel-rewrite/internal/nativefiles"
	"sequel-rewrite/internal/profiles"
	"sequel-rewrite/internal/queryfavorites"
	"sequel-rewrite/internal/workspace"
	"sync"
)

type App struct {
	workspace          workspace.Manager
	ctx                context.Context
	profiles           *profiles.Store
	credentials        *credentials.Store
	history            history.Store
	queryFavorites     queryfavorites.Store
	nativeMu           sync.Mutex
	preferenceShortcut *string
	nativeToken        string
	nativeCandidates   []nativefiles.SACandidate
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
	privacy := "off"
	if recordHistory {
		privacy = "metadata"
	}
	return a.streamQuery(tab, id, statement, privacy)
}
func (a *App) streamQuery(tab, id, statement, privacy string) (database.Result, error) {
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
	if privacy != "off" {
		if historyErr := a.history.AddWithSQL(statement, len(output.Rows), output.DurationMS, err == nil, privacy == "sql"); historyErr != nil {
			wailsruntime.EventsEmit(a.ctx, "history:error", "History could not be saved; query outcome is unchanged.")
		}
	}
	return output, err
}
func (a *App) shutdown(context.Context) { a.workspace.Shutdown() }

func (a *App) TableDetails(tab, db, table string) (database.TableDetails, error) {
	s, err := a.workspace.Session(tab)
	if err != nil {
		return database.TableDetails{}, err
	}
	return s.TableDetails(db, table)
}
func (a *App) Mutate(tab string, r database.Mutation) (int64, error) {
	s, err := a.workspace.Session(tab)
	if err != nil {
		return 0, err
	}
	return s.Mutate(r)
}

func (a *App) TransactionStatus(tab string) string {
	s, err := a.workspace.Session(tab)
	if err != nil {
		return "disconnected"
	}
	return s.TransactionStatus()
}
func (a *App) Transaction(tab, action string) error {
	s, err := a.workspace.Session(tab)
	if err != nil {
		return err
	}
	return s.Transaction(action)
}

func (a *App) Structure(tab, db, table string) (database.Structure, error) {
	s, err := a.workspace.Session(tab)
	if err != nil {
		return database.Structure{}, err
	}
	return s.Structure(db, table)
}

func (a *App) WorkspaceInfo(tab string) (database.Result, error) {
	s, err := a.workspace.Session(tab)
	if err != nil {
		return database.Result{}, err
	}
	return s.WorkspaceInfo()
}

func (a *App) PrepareSchemaChange(tab string, change database.SASchemaChange) (database.SASchemaPlan, error) {
	s, err := a.workspace.Session(tab)
	if err != nil {
		return database.SASchemaPlan{}, err
	}
	return s.PrepareSchemaChange(change)
}
func (a *App) ApplySchemaChange(tab, token string) (string, error) {
	s, err := a.workspace.Session(tab)
	if err != nil {
		return "", err
	}
	return s.ApplySchemaChange(token)
}
