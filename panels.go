package main

import (
	"errors"
	runtime "github.com/wailsapp/wails/v2/pkg/runtime"
	"io"
	"sequel-rewrite/internal/database"
	"sequel-rewrite/internal/exportfile"
)

func (a *App) Panel(tab, kind, db, table, user, host string) (database.Result, error) {
	s, err := a.workspace.Session(tab)
	if err != nil {
		return database.Result{}, err
	}
	return s.Panel(kind, db, table, user, host)
}
func (a *App) PrepareAdmin(tab string, r database.SAAdminRequest) (database.SASchemaPlan, error) {
	s, err := a.workspace.Session(tab)
	if err != nil {
		return database.SASchemaPlan{}, err
	}
	return s.PrepareAdmin(r)
}
func (a *App) ApplyAdmin(tab, token string) (string, error) {
	s, err := a.workspace.Session(tab)
	if err != nil {
		return "", err
	}
	return s.ApplyAdmin(token)
}
func (a *App) Activity(tab string, clear bool) ([]database.SAActivity, error) {
	s, err := a.workspace.Session(tab)
	if err != nil {
		return nil, err
	}
	return s.Activity(clear), nil
}

func (a *App) SavePrintView(result database.Result) (bool, error) {
	if a.ctx == nil {
		return false, errors.New("printing requires the desktop app")
	}
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{Title: "Save printable results — open HTML in a browser to print", DefaultFilename: "results-print.html"})
	if err != nil || path == "" {
		return false, err
	}
	_, err = exportfile.WriteNew(path, func(w io.Writer) (int64, error) { return int64(len(result.Rows)), database.WritePrintView(w, result) })
	return err == nil, err
}
