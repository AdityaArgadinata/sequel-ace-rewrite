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

func TestPreferencesMenuRemapping(t *testing.T) {
	app := NewApp()
	for _, bad := range []string{"Enter", "Mod+Q", "Mod+A", "Mod+H", "Mod+M", "Mod+Shift+Shift+7"} {
		if err := app.SetPreferencesShortcut(bad); err == nil {
			t.Fatal("invalid binding accepted", bad)
		}
	}
	for _, binding := range []string{"Mod+9", "Mod+Shift+7", ""} {
		if err := app.SetPreferencesShortcut(binding); err != nil {
			t.Fatal(err)
		}
		root := app.applicationMenu()
		for _, item := range root.Items {
			if item.Label == "Settings" {
				for _, child := range item.SubMenu.Items {
					if child.Label == "Preferences…" {
						if binding == "" && child.Accelerator != nil {
							t.Fatal("disabled native accelerator remains")
						}
						if binding != "" && (child.Accelerator == nil || child.Accelerator.Key == ",") {
							t.Fatal(child.Accelerator)
						}
					}
				}
			}
		}
	}
}
