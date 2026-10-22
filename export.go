package main

import (
	"errors"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
	"io"
	"sequel-rewrite/internal/exportfile"
)

type CSVExport struct {
	Rows      int64 `json:"rows"`
	Cancelled bool  `json:"cancelled"`
}

func (a *App) ExportTableCSV(tab, db, table string) (CSVExport, error) {
	if a.ctx == nil {
		return CSVExport{}, errors.New("export requires a running desktop")
	}
	s, err := a.workspace.Session(tab)
	if err != nil {
		return CSVExport{}, err
	}
	switch s.TransactionStatus() {
	case "disconnected":
		return CSVExport{}, errors.New("connect first")
	case "unverified":
		return CSVExport{}, errors.New("resolve unverified session state with Commit/Rollback before exporting")
	}
	path, err := wailsruntime.SaveFileDialog(a.ctx, wailsruntime.SaveDialogOptions{Title: "Export entire table — Sequel CSV v1 (new filename)", DefaultFilename: "table-export.csv", Filters: []wailsruntime.FileFilter{{DisplayName: "CSV (*.csv)", Pattern: "*.csv"}}})
	if err != nil {
		return CSVExport{}, err
	}
	if path == "" {
		return CSVExport{Cancelled: true}, nil
	}
	n, err := exportfile.WriteNew(path, func(w io.Writer) (int64, error) { return s.ExportCSV(db, table, w) })
	if err != nil {
		return CSVExport{}, err
	}
	return CSVExport{Rows: n}, nil
}
