package main

import (
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"

	"lingzhu-app/internal/service"
)

// singleInstanceID identifies this app's one allowed instance. A second launch
// hands its arguments to the running window and exits, so an update relaunch
// focuses the existing app instead of starting a rival core on the same data
// directory.
const singleInstanceID = "com.lingzhu.app"

// relaunchArg marks a launch that follows an in-place update.
const relaunchArg = "--relaunched"

// onSecondInstance handles a launch that found this instance already running.
// A clicked toast relaunches the executable with its payload, so this is also
// where a notification click returns to its session.
func onSecondInstance(data application.SecondInstanceData) {
	service.FocusMainWindow()
	if target, ok := service.NoticeFromArgs(data.Args); ok {
		service.EmitNotice(target)
		return
	}
	for _, arg := range data.Args {
		if arg == relaunchArg {
			log.Print("relaunched after update")
			break
		}
	}
}
