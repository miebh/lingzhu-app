package main

import (
	"embed"
	"log"
	"os"
	"runtime"

	"github.com/wailsapp/wails/v3/pkg/application"

	"lingzhu-app/internal/service"
)

// The frontend build output is embedded into the binary.
//
//go:embed all:frontend/dist
var assets embed.FS

func main() {
	windows := application.WindowsOptions{}
	if os.Getenv("LINGZHU_DEBUG") != "" {
		// LINGZHU_DEBUG exposes the WebView2 DevTools endpoint on 9222.
		windows.AdditionalBrowserArgs = []string{"--remote-debugging-port=9222"}
	}

	app := application.New(application.Options{
		Name:        "Lingzhu",
		Description: "Desktop client for the lingzhu agent",
		// One instance owns the data directory. A second launch forwards its
		// arguments to the running window and exits, so a relaunch after an
		// in-place update focuses the app instead of failing on the core's
		// data-directory lock.
		SingleInstance: &application.SingleInstanceOptions{
			UniqueID:               singleInstanceID,
			OnSecondInstanceLaunch: onSecondInstance,
		},
		Services: []application.Service{
			application.NewService(service.NewCoreService()),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Windows: windows,
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:  "Lingzhu",
		Width:  1180,
		Height: 760,
		// Windows and Linux draw their own title bar; macOS keeps the native
		// hidden-inset title bar so the traffic lights stay in place.
		Frameless: runtime.GOOS != "darwin",
		// The floor only has to hold the narrow layout: below 768px the shell
		// folds the rail into a drawer and the transcript takes the whole row.
		MinWidth:  640,
		MinHeight: 600,
		// The client has no zoom control; keep WebView2 from adding its own.
		ZoomControlEnabled: false,
		BackgroundColour:   application.NewRGB(8, 8, 8),
		URL:                "/",
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 40,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
	})

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
