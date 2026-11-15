package main

import (
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// singleInstanceID identifies this app's one allowed instance. A second launch
// hands its arguments to the running window and exits, so an update relaunch
// focuses the existing app instead of starting a rival core on the same data
// directory.
const singleInstanceID = "com.lingzhu.app"

// relaunchArg marks a launch that follows an in-place update.
const relaunchArg = "--relaunched"

// focusRunningInstance brings the existing window forward when a second launch
// arrives, so a relaunch after an update never looks like a no-op.
func focusRunningInstance() {
	app := application.Get()
	if app == nil || app.Window == nil {
		return
	}
	windows := app.Window.GetAll()
	if len(windows) == 0 {
		return
	}
	windows[0].Show()
	windows[0].Focus()
}

// onSecondInstance handles a launch that found this instance already running.
func onSecondInstance(data application.SecondInstanceData) {
	focusRunningInstance()
	for _, arg := range data.Args {
		if arg == relaunchArg {
			log.Print("relaunched after update")
			break
		}
	}
}
