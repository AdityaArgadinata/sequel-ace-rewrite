package main

import (
	"errors"
	"path/filepath"
	"sequel-rewrite/internal/cellfiles"
	"sequel-rewrite/internal/database"

	runtime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type SACellFile struct {
	Value     database.Cell `json:"value"`
	Name      string        `json:"name"`
	Cancelled bool          `json:"cancelled"`
}

func (a *App) OpenCellFile(binary bool) (SACellFile, error) {
	if a.ctx == nil {
		return SACellFile{}, errors.New("cell file import requires the desktop app")
	}
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{Title: "Import cell contents"})
	if err != nil {
		return SACellFile{}, err
	}
	if path == "" {
		return SACellFile{Cancelled: true}, nil
	}
	value, err := cellfiles.Read(path, binary)
	if err != nil {
		return SACellFile{}, err
	}
	return SACellFile{Value: value, Name: filepath.Base(path)}, nil
}
func (a *App) SaveCellFile(value database.Cell) (bool, error) {
	if a.ctx == nil {
		return false, errors.New("cell file export requires the desktop app")
	}
	if _, err := cellfiles.Bytes(value); err != nil {
		return false, err
	}
	name := "cell.txt"
	if value.Binary {
		name = "cell.bin"
	}
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{Title: "Export cell contents — choose a new filename", DefaultFilename: name})
	if err != nil || path == "" {
		return false, err
	}
	err = cellfiles.Write(path, value)
	return err == nil, err
}
