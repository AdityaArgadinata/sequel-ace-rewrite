package main

import (
	"errors"
	"path/filepath"
	"sequel-rewrite/internal/database"
	"sequel-rewrite/internal/queryfavorites"
	"sequel-rewrite/internal/sqlfiles"
	"sequel-rewrite/internal/sqlscript"
	"strings"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type SAQueryPlan struct {
	Statements []sqlscript.SAStatement `json:"statements"`
	SQLMode    string                  `json:"sqlMode"`
}

func (a *App) PrepareSQL(tab, source, scope string, from, to, head int) (SAQueryPlan, error) {
	s, err := a.workspace.Session(tab)
	if err != nil {
		return SAQueryPlan{}, err
	}
	mode, err := s.SQLMode()
	if err != nil {
		return SAQueryPlan{}, err
	}
	return prepareSQL(source, scope, from, to, head, mode)
}
func prepareSQL(source, scope string, from, to, head int, sqlMode string) (SAQueryPlan, error) {
	if err := sqlfiles.Validate(source); err != nil {
		return SAQueryPlan{}, err
	}
	if scope != "all" && scope != "current" && scope != "selection" {
		return SAQueryPlan{}, errors.New("unknown SQL execution scope")
	}
	lineOffset := 0
	if scope == "selection" {
		a, err := sqlscript.ByteOffset(source, from)
		if err != nil {
			return SAQueryPlan{}, err
		}
		b, err := sqlscript.ByteOffset(source, to)
		if err != nil || b <= a {
			return SAQueryPlan{}, errors.New("select SQL text before running the selection")
		}
		lineOffset = strings.Count(source[:a], "\n")
		source = source[a:b]
	}
	list, err := sqlscript.Parse(source, sqlMode)
	if err != nil && !(scope == "current" && len(list) > 0 && head <= list[len(list)-1].To) {
		return SAQueryPlan{}, err
	}
	if len(list) == 0 {
		return SAQueryPlan{}, errors.New("no SQL statement to execute")
	}
	if scope == "selection" {
		for i := range list {
			list[i].From += from
			list[i].To += from
			list[i].Line += lineOffset
		}
	}
	if scope == "current" {
		if _, err := sqlscript.ByteOffset(source, head); err != nil {
			return SAQueryPlan{}, err
		}
		chosen := len(list) - 1
		for i, statement := range list {
			if head >= statement.From && head <= statement.To {
				chosen = i
				break
			}
			if head < statement.From {
				chosen = max(0, i-1)
				break
			}
		}
		list = []sqlscript.SAStatement{list[chosen]}
	}
	return SAQueryPlan{Statements: list, SQLMode: sqlMode}, nil
}
func (a *App) StreamPreparedQuery(tab, id, statement, privacy, expectedMode string) (database.Result, error) {
	if privacy != "off" && privacy != "metadata" && privacy != "sql" {
		return database.Result{}, errors.New("invalid history privacy mode")
	}
	s, err := a.workspace.Session(tab)
	if err != nil {
		return database.Result{}, err
	}
	mode, err := s.SQLMode()
	if err != nil {
		return database.Result{}, err
	}
	if mode != expectedMode {
		return database.Result{}, errors.New("SQL mode changed during the script; execution stopped before the next statement. Review and prepare the remaining SQL again")
	}
	return a.streamQuery(tab, id, statement, privacy)
}
func (a *App) CompletionSchema(tab, db string) (database.Result, error) {
	s, err := a.workspace.Session(tab)
	if err != nil {
		return database.Result{}, err
	}
	return s.CompletionSchema(db)
}
func (a *App) ListQueryFavorites() ([]queryfavorites.SAQueryFavorite, error) {
	return a.queryFavorites.List()
}
func (a *App) SaveQueryFavorite(entry queryfavorites.SAQueryFavorite) (queryfavorites.SAQueryFavorite, error) {
	return a.queryFavorites.Save(entry)
}
func (a *App) DeleteQueryFavorite(id string) error { return a.queryFavorites.Delete(id) }
func (a *App) ClearHistorySQL() error              { return a.history.ClearSQL() }

type SASQLFile struct {
	SQL       string `json:"sql"`
	Name      string `json:"name"`
	Cancelled bool   `json:"cancelled"`
}

func (a *App) OpenSQLFile() (SASQLFile, error) {
	if a.ctx == nil {
		return SASQLFile{}, errors.New("opening SQL files requires the desktop")
	}
	path, err := wailsruntime.OpenFileDialog(a.ctx, wailsruntime.OpenDialogOptions{Title: "Open SQL file", Filters: []wailsruntime.FileFilter{{DisplayName: "SQL files (*.sql, *.txt)", Pattern: "*.sql;*.txt"}}})
	if err != nil {
		return SASQLFile{}, err
	}
	if path == "" {
		return SASQLFile{Cancelled: true}, nil
	}
	sql, err := sqlfiles.Read(path)
	if err != nil {
		return SASQLFile{}, err
	}
	return SASQLFile{SQL: sql, Name: filepath.Base(path)}, nil
}
func (a *App) SaveSQLFile(sql, name string) (SASQLFile, error) {
	if a.ctx == nil {
		return SASQLFile{}, errors.New("saving SQL files requires the desktop")
	}
	if err := sqlfiles.Validate(sql); err != nil {
		return SASQLFile{}, err
	}
	if name == "" || strings.TrimSpace(name) == "" {
		name = "query.sql"
	}
	path, err := wailsruntime.SaveFileDialog(a.ctx, wailsruntime.SaveDialogOptions{Title: "Save SQL file", DefaultFilename: filepath.Base(name), Filters: []wailsruntime.FileFilter{{DisplayName: "SQL files (*.sql)", Pattern: "*.sql"}}})
	if err != nil {
		return SASQLFile{}, err
	}
	if path == "" {
		return SASQLFile{Cancelled: true}, nil
	}
	if err := sqlfiles.Save(path, sql); err != nil {
		return SASQLFile{}, err
	}
	return SASQLFile{Name: filepath.Base(path)}, nil
}
