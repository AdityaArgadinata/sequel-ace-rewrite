package main

import (
	"errors"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"io"
	"sequel-rewrite/internal/database"
	"sequel-rewrite/internal/exportfile"
)

func (a *App) InspectDatabase(tab, db string) (database.SADatabaseInventory, error) {
	s, err := a.workspace.Session(tab)
	if err != nil {
		return database.SADatabaseInventory{}, err
	}
	return s.InspectDatabase(db)
}
func (a *App) ExportDatabaseFile(tab, db, fingerprint string, includeData bool) (CSVExport, error) {
	if a.ctx == nil {
		return CSVExport{}, errors.New("database export requires the desktop app")
	}
	s, err := a.workspace.Session(tab)
	if err != nil {
		return CSVExport{}, err
	}
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{Title: "Export database SQL — choose a new filename", DefaultFilename: "database.sql", Filters: []runtime.FileFilter{{DisplayName: "SQL (*.sql)", Pattern: "*.sql"}}})
	if err != nil {
		return CSVExport{}, err
	}
	if path == "" {
		return CSVExport{Cancelled: true}, nil
	}
	count, err := exportfile.WriteNew(path, func(w io.Writer) (int64, error) { return s.ExportDatabase(w, db, fingerprint, includeData) })
	return CSVExport{Rows: count}, err
}
