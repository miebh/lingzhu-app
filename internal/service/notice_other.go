//go:build !windows

package service

import "github.com/wailsapp/wails/v3/pkg/services/notifications"

// pushNotice sends one toast directly. macOS and Linux notifiers are safe to
// call from any goroutine, so only Windows needs the dedicated apartment.
func (s *CoreService) pushNotice(options notifications.NotificationOptions) error {
	return s.notifier.SendNotification(options)
}
