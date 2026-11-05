// Package version carries the build version. The build task links the value
// from ../lingzhu/VERSION through -ldflags, so the app and the core always
// report the same number.
package version

// Version is the release version, injected with
// -X lingzhu-app/internal/version.Version=<version>.
var Version = "0.1.0-dev"
