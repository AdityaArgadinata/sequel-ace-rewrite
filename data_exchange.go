package main

import (
	"errors"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"io"
	"os"
	"path/filepath"
	"sequel-rewrite/internal/database"
	"sequel-rewrite/internal/exportfile"
	"sequel-rewrite/internal/nativefiles"
	"strings"
	"time"
)

func readChosen(path string, max int) ([]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Size() > int64(max) {
		return nil, errors.New("selected file is not regular or exceeds its size limit")
	}
	data, err := io.ReadAll(io.LimitReader(file, int64(max)+1))
	if err != nil {
		return nil, err
	}
	if len(data) > max {
		return nil, errors.New("selected file exceeds its size limit")
	}
	return data, nil
}
func (a *App) PrepareObjectChange(tab string, r database.SAObjectRequest) (database.SAObjectPlan, error) {
	s, err := a.workspace.Session(tab)
	if err != nil {
		return database.SAObjectPlan{}, err
	}
	return s.PrepareObjectChange(r)
}
func (a *App) ApplyObjectChange(tab, token string) (database.SABatchOutcome, error) {
	s, err := a.workspace.Session(tab)
	if err != nil {
		return database.SABatchOutcome{}, err
	}
	return s.ApplyObjectChange(token), nil
}
func (a *App) OpenCSV(tab, db, table, separator string, header bool) (database.SACSVPreview, error) {
	if a.ctx == nil {
		return database.SACSVPreview{}, errors.New("CSV import requires the desktop")
	}
	s, err := a.workspace.Session(tab)
	if err != nil {
		return database.SACSVPreview{}, err
	}
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{Title: "Import CSV — preview only", Filters: []runtime.FileFilter{{DisplayName: "CSV/TSV (*.csv, *.tsv)", Pattern: "*.csv;*.tsv"}}})
	if err != nil {
		return database.SACSVPreview{}, err
	}
	if path == "" {
		return database.SACSVPreview{Cancelled: true}, nil
	}
	data, err := readChosen(path, 8*1024*1024)
	if err != nil {
		return database.SACSVPreview{}, err
	}
	return s.PreviewCSV(db, table, filepath.Base(path), data, separator, header)
}
func (a *App) PrepareCSVImport(tab, token string, mapping []database.SACSVMapping, format string) (database.SACSVPlan, error) {
	s, err := a.workspace.Session(tab)
	if err != nil {
		return database.SACSVPlan{}, err
	}
	return s.PrepareCSVImport(token, mapping, format)
}
func (a *App) ApplyCSVImport(tab, token string) (database.SABatchOutcome, error) {
	s, err := a.workspace.Session(tab)
	if err != nil {
		return database.SABatchOutcome{}, err
	}
	return s.ApplyCSVImportProgress(token, a.importProgress(tab, "csv")), nil
}
func (a *App) ExportDataFile(tab string, spec database.SAExportSpec, snapshot database.Result) (CSVExport, error) {
	if a.ctx == nil {
		return CSVExport{}, errors.New("export requires the desktop")
	}
	if spec.Format != "csv" && spec.Format != "sql" && spec.Format != "xml" {
		return CSVExport{}, errors.New("choose CSV, SQL or XML")
	}
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{Title: "Export data — choose a new filename", DefaultFilename: "export." + spec.Format})
	if err != nil {
		return CSVExport{}, err
	}
	if path == "" {
		return CSVExport{Cancelled: true}, nil
	}
	rows, err := exportfile.WriteNew(path, func(w io.Writer) (int64, error) {
		if spec.Scope == "loaded" || spec.Scope == "selection" {
			return database.WriteResultExport(w, spec, snapshot)
		}
		s, err := a.workspace.Session(tab)
		if err != nil {
			return 0, err
		}
		return s.ExportData(w, spec)
	})
	if err != nil {
		return CSVExport{}, err
	}
	return CSVExport{Rows: rows}, nil
}

type SAFavoritesPreview struct {
	Token      string                    `json:"token"`
	Candidates []nativefiles.SACandidate `json:"candidates"`
	Cancelled  bool                      `json:"cancelled"`
}

func (a *App) OpenNativeFavorites() (SAFavoritesPreview, error) {
	if a.ctx == nil {
		return SAFavoritesPreview{}, errors.New("favorites import requires the desktop")
	}
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{Title: "Import Sequel Ace favorites — preview", Filters: []runtime.FileFilter{{DisplayName: "Native favorites (*.plist, *.spf)", Pattern: "*.plist;*.spf"}}})
	if err != nil {
		return SAFavoritesPreview{}, err
	}
	if path == "" {
		return SAFavoritesPreview{Cancelled: true}, nil
	}
	data, err := readChosen(path, nativefiles.MaxBytes)
	if err != nil {
		return SAFavoritesPreview{}, err
	}
	candidates, err := nativefiles.ReadFavorites(data)
	if err != nil {
		return SAFavoritesPreview{}, err
	}
	token, err := database.NewFileToken()
	if err != nil {
		return SAFavoritesPreview{}, err
	}
	a.nativeMu.Lock()
	a.nativeToken = token
	a.nativeCandidates = candidates
	a.nativeMu.Unlock()
	return SAFavoritesPreview{Token: token, Candidates: candidates}, nil
}
func (a *App) ImportNativeFavorites(token string, indexes []int) (database.SABatchOutcome, error) {
	a.nativeMu.Lock()
	defer a.nativeMu.Unlock()
	if token == "" || token != a.nativeToken {
		return database.SABatchOutcome{}, errors.New("favorites preview expired")
	}
	list := a.nativeCandidates
	a.nativeToken = ""
	a.nativeCandidates = nil
	out := database.SABatchOutcome{Total: len(indexes)}
	seen := map[int]bool{}
	for _, i := range indexes {
		if i < 0 || i >= len(list) || seen[i] || list[i].Issue != "" {
			return out, errors.New("select only distinct supported favorites")
		}
		seen[i] = true
	}
	for _, i := range indexes {
		p := list[i].Profile
		p.ID = ""
		p.InitialDatabase = list[i].Database
		if _, err := a.profiles.Save(p); err != nil {
			out.Error = err.Error()
			return out, nil
		}
		out.Completed++
	}
	return out, nil
}
func (a *App) OpenSPF() (nativefiles.SASession, error) {
	if a.ctx == nil {
		return nativefiles.SASession{}, errors.New("SPF requires the desktop")
	}
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{Title: "Open password-free Sequel Ace session", Filters: []runtime.FileFilter{{DisplayName: "Session (*.spf)", Pattern: "*.spf"}}})
	if err != nil {
		return nativefiles.SASession{}, err
	}
	if path == "" {
		return nativefiles.SASession{Cancelled: true}, nil
	}
	data, err := readChosen(path, nativefiles.MaxBytes)
	if err != nil {
		return nativefiles.SASession{}, err
	}
	return nativefiles.ReadSPF(data)
}
func (a *App) SaveSPF(tab string, state nativefiles.SASession) (bool, error) {
	if a.ctx == nil {
		return false, errors.New("SPF requires the desktop")
	}
	if _, err := a.workspace.Session(tab); err != nil {
		return false, err
	}
	p, err := a.workspace.Profile()
	if err != nil {
		return false, err
	}
	state.Profile = p
	data, err := nativefiles.WriteSPF(state)
	if err != nil {
		return false, err
	}
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{Title: "Save password-free SPF — choose a new filename", DefaultFilename: "session.spf"})
	if err != nil {
		return false, err
	}
	if path == "" {
		return false, nil
	}
	_, err = exportfile.WriteNew(path, func(w io.Writer) (int64, error) { _, err := w.Write(data); return 1, err })
	return err == nil, err
}

func (a *App) OpenSQLImport(tab string) (database.SASQLImportPreview, error) {
	if a.ctx == nil {
		return database.SASQLImportPreview{}, errors.New("SQL import requires the desktop")
	}
	s, err := a.workspace.Session(tab)
	if err != nil {
		return database.SASQLImportPreview{}, err
	}
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{Title: "Import SQL dump — preview", Filters: []runtime.FileFilter{{DisplayName: "SQL (*.sql)", Pattern: "*.sql"}}})
	if err != nil {
		return database.SASQLImportPreview{}, err
	}
	if path == "" {
		return database.SASQLImportPreview{Cancelled: true}, nil
	}
	data, err := readChosen(path, 64*1024*1024)
	if err != nil {
		return database.SASQLImportPreview{}, err
	}
	return s.PreviewSQLImport(filepath.Base(path), string(data))
}
func (a *App) ApplySQLImport(tab, token string) (database.SABatchOutcome, error) {
	s, err := a.workspace.Session(tab)
	if err != nil {
		return database.SABatchOutcome{}, err
	}
	return s.ApplySQLImportProgress(token, a.importProgress(tab, "sql")), nil
}

type SAImportFile struct {
	Format    string                       `json:"format"`
	SQL       *database.SASQLImportPreview `json:"sql,omitempty"`
	CSV       *database.SACSVPreview       `json:"csv,omitempty"`
	Cancelled bool                         `json:"cancelled"`
}

func (a *App) OpenImportFile(tab, db, table string) (SAImportFile, error) {
	if a.ctx == nil {
		return SAImportFile{}, errors.New("import requires the desktop app")
	}
	s, err := a.workspace.Session(tab)
	if err != nil {
		return SAImportFile{}, err
	}
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{Title: "Import", Filters: []runtime.FileFilter{{DisplayName: "SQL or CSV", Pattern: "*.sql;*.csv;*.tsv"}, {DisplayName: "SQL", Pattern: "*.sql"}, {DisplayName: "CSV / TSV", Pattern: "*.csv;*.tsv"}}})
	if err != nil {
		return SAImportFile{}, err
	}
	if path == "" {
		return SAImportFile{Cancelled: true}, nil
	}
	if strings.EqualFold(filepath.Ext(path), ".sql") {
		data, err := readChosen(path, 64*1024*1024)
		if err != nil {
			return SAImportFile{}, err
		}
		out, err := s.PreviewSQLImport(filepath.Base(path), string(data))
		return SAImportFile{Format: "sql", SQL: &out}, err
	}
	if !strings.EqualFold(filepath.Ext(path), ".csv") && !strings.EqualFold(filepath.Ext(path), ".tsv") {
		return SAImportFile{}, errors.New("choose a SQL, CSV or TSV file")
	}
	if table == "" {
		return SAImportFile{}, errors.New("select a destination table before importing CSV")
	}
	separator := ","
	if strings.EqualFold(filepath.Ext(path), ".tsv") {
		separator = "\t"
	}
	data, err := readChosen(path, 8*1024*1024)
	if err != nil {
		return SAImportFile{}, err
	}
	out, err := s.PreviewCSV(db, table, filepath.Base(path), data, separator, true)
	return SAImportFile{Format: "csv", CSV: &out}, err
}

func (a *App) importProgress(tab, format string) func(int, int) {
	last := time.Time{}
	return func(completed, total int) {
		if a.ctx == nil {
			return
		}
		if completed == 0 || completed == total || time.Since(last) >= 100*time.Millisecond {
			last = time.Now()
			runtime.EventsEmit(a.ctx, "transfer:progress", map[string]interface{}{"tab": tab, "format": format, "completed": completed, "total": total})
		}
	}
}
