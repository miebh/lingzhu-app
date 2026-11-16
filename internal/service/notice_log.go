package service

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"lingzhu-app/internal/global"
)

// noticeLog records notification problems in the app cache directory. The
// desktop binary is built as a GUI process, so its stderr goes nowhere and a
// failed toast would otherwise be silent.
var noticeLog struct {
	once sync.Once
	file *os.File
}

func logNotice(format string, args ...any) {
	noticeLog.once.Do(func() {
		dir := filepath.Join(global.Cache(), "log")
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return
		}
		file, err := os.OpenFile(filepath.Join(dir, "notice.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
		if err != nil {
			return
		}
		noticeLog.file = file
	})
	if noticeLog.file == nil {
		return
	}
	_, _ = fmt.Fprintf(noticeLog.file, "%s %s\n", time.Now().Format(time.RFC3339), fmt.Sprintf(format, args...))
}
