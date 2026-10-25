package main

import (
	"errors"
	"regexp"
	"runtime"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

func (a *App) applicationMenu() *menu.Menu {
	root := menu.NewMenu()
	if runtime.GOOS == "darwin" {
		root.Append(menu.AppMenu())
	}
	file := root.AddSubmenu("File")
	file.AddText("New Connection Tab", keys.CmdOrCtrl("t"), func(*menu.CallbackData) {
		if a.ctx != nil {
			wailsruntime.EventsEmit(a.ctx, "sequelx:new-connection-tab")
		}
	})
	settings := root.AddSubmenu("Settings")
	a.nativeMu.Lock()
	binding := "Mod+,"
	if a.preferenceShortcut != nil {
		binding = *a.preferenceShortcut
	}
	a.nativeMu.Unlock()
	accelerator, _ := preferencesAccelerator(binding)
	settings.AddText("Preferences…", accelerator, func(*menu.CallbackData) {
		if a.ctx != nil {
			wailsruntime.EventsEmit(a.ctx, "sequelx:preferences")
		}
	})
	if runtime.GOOS == "darwin" {
		root.Append(menu.EditMenu())
		root.Append(menu.WindowMenu())
	}
	return root
}

var preferenceBinding = regexp.MustCompile(`^Mod(\+Shift)?(\+Alt)?\+([A-Za-z0-9,]|Enter)$`)

func preferencesAccelerator(binding string) (*keys.Accelerator, error) {
	if binding == "" {
		return nil, nil
	}
	if !preferenceBinding.MatchString(binding) {
		return nil, errors.New("invalid preferences shortcut")
	}
	parts := strings.Split(binding, "+")
	key := strings.ToLower(parts[len(parts)-1])
	if len(key) == 1 && strings.Contains("acvxzyqwnosptlhm", key) {
		return nil, errors.New("preferences shortcut is reserved")
	}
	return keys.Parse(strings.Replace(binding, "Mod+", "CmdOrCtrl+", 1))
}
func (a *App) SetPreferencesShortcut(binding string) error {
	if _, err := preferencesAccelerator(binding); err != nil {
		return err
	}
	a.nativeMu.Lock()
	a.preferenceShortcut = &binding
	a.nativeMu.Unlock()
	if a.ctx != nil {
		wailsruntime.MenuSetApplicationMenu(a.ctx, a.applicationMenu())
	}
	return nil
}
