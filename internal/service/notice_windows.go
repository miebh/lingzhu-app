//go:build windows

package service

import (
	"runtime"

	"github.com/wailsapp/wails/v3/pkg/services/notifications"
)

// pushNotice sends one toast from the worker goroutine that owns the toast
// thread. The toast library initialises the COM apartment on the calling
// thread, so it must be a thread this app controls and keeps alive: the UI
// thread already owns an apartment the library cannot change, and a fresh
// goroutine per push would take its apartment down with it.
func (s *CoreService) pushNotice(options notifications.NotificationOptions) error {
	s.noticeOnce.Do(func() {
		s.noticeQueue = make(chan noticeJob, 16)
		go s.runToastWorker()
	})
	job := noticeJob{options: options, result: make(chan error, 1)}
	select {
	case s.noticeQueue <- job:
		err := <-job.result
		if err != nil {
			logNotice("send %q: %v", options.ID, err)
		}
		return err
	default:
		logNotice("queue full, dropped %q", options.ID)
		return errToastQueueFull
	}
}

// runToastWorker owns the thread every toast is pushed from.
func (s *CoreService) runToastWorker() {
	// The apartment belongs to this thread, so it must not migrate and must
	// stay alive for as long as the queue does.
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	for job := range s.noticeQueue {
		job.result <- s.notifier.SendNotification(job.options)
	}
}
