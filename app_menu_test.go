package main

import (
	"github.com/wailsapp/wails/v2/pkg/menu"
	"testing"
)

func TestPreferencesNativeMenu(t *testing.T) {
	app := NewApp()
	root := app.applicationMenu()
	var preferences *menu.MenuItem
	for _, item := range root.Items {
		if item.Label == "Settings" && item.SubMenu != nil {
			for _, child := range item.SubMenu.Items {
				if child.Label == "Preferences…" {
					preferences = child
				}
			}
		}
	}
	if preferences == nil || preferences.Accelerator == nil || preferences.Accelerator.Key != "," || preferences.Click == nil {
		t.Fatal("native Preferences menu missing")
	}
	preferences.Click(nil) // A menu click before desktop startup must be harmless.
}
