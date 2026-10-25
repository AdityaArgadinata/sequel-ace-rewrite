package main

import "sequel-rewrite/internal/profiles"

func (a *App) ListFavoriteFolders() ([]string, error) { return a.profiles.ListFolders() }
func (a *App) ChangeFavoriteFolder(r profiles.FolderChange) profiles.FolderOutcome {
	return a.profiles.ChangeFolder(r)
}
