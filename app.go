package main

import (
	"context"
	"errors"
	"runtime"
	"sequel-rewrite/internal/database"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// App exposes desktop operations. Database logic belongs in internal/database.
type App struct {
	session database.Session
	ctx     context.Context
}

func NewApp() *App { return &App{} }

// Platform verifies the UI can reach the Go backend in the packaged application.
func (a *App) Platform() string { return runtime.GOOS + "/" + runtime.GOARCH }

func (a *App) startup(ctx context.Context) { a.ctx = ctx }

func (a *App) StreamQuery(id string, statement string) (database.Result, error) {
	if a.ctx == nil || id == "" || len(id) > 128 {
		return database.Result{}, errors.New("query stream requires a running desktop and request ID")
	}
	return a.session.Stream(statement, func(batch database.Batch) {
		wailsruntime.EventsEmit(a.ctx, "query:batch", struct {
			ID    string         `json:"id"`
			Batch database.Batch `json:"batch"`
		}{id, batch})
	})
}

func (a *App) Connect(c database.Connection) error             { return a.session.Connect(c) }
func (a *App) Disconnect() error                               { return a.session.Disconnect() }
func (a *App) Connected() bool                                 { return a.session.Connected() }
func (a *App) Cancel()                                         { a.session.Cancel() }
func (a *App) Query(statement string) (database.Result, error) { return a.session.Query(statement) }
func (a *App) Databases() (database.Result, error)             { return a.session.Databases() }
func (a *App) Tables(name string) (database.Result, error)     { return a.session.Tables(name) }
func (a *App) UseDatabase(name string) error                   { return a.session.UseDatabase(name) }
func (a *App) shutdown(context.Context)                        { a.session.Shutdown() }
