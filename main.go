package main

import (
	"embed"
	"log"
	"os"
	"runtime"

	"github.com/wailsapp/wails/v3/pkg/application"
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
		Services: []application.Service{
			application.NewService(NewCoreService()),
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
		Title: "Lingzhu",
		Width: 1180,
		Height: 760,
		// Windows and Linux draw their own title bar; macOS keeps the native
		// hidden-inset title bar so the traffic lights stay in place.
		Frameless:        runtime.GOOS != "darwin",
		MinWidth:         900,
		MinHeight:        600,
		BackgroundColour: application.NewRGB(14, 15, 18),
		URL:              "/",
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
