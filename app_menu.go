package main

import (
	"runtime"

	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

func (a *App) applicationMenu() *menu.Menu {
	root := menu.NewMenu()
	if runtime.GOOS == "darwin" {
		root.Append(menu.AppMenu())
	}
	settings := root.AddSubmenu("Settings")
	settings.AddText("Preferences…", keys.CmdOrCtrl(","), func(*menu.CallbackData) {
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
