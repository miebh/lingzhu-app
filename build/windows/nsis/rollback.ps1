# Waits for the freshly installed build to prove it works, and rolls back when
# it does not.
#
# The installer starts this script after replacing both binaries. The new build
# writes `confirmed.txt` once its core answers /healthz; if that file never
# appears the previous binaries are put back and the app is started again.
#
# The rollback has to run here, outside the app: a build that crashes on start
# can never undo itself.

param(
    [Parameter(Mandatory = $true)][string]$InstallDir,
    [Parameter(Mandatory = $true)][string]$AppExe,
    [Parameter(Mandatory = $true)][string]$CoreExe,
    [Parameter(Mandatory = $true)][string]$BackupDir,
    [Parameter(Mandatory = $true)][string]$UpdateDir,
    [int]$TimeoutSec = 120
)

$ErrorActionPreference = 'SilentlyContinue'

$marker = Join-Path $UpdateDir 'pending.txt'
$confirmed = Join-Path $UpdateDir 'confirmed.txt'
$log = Join-Path $UpdateDir 'update.log'
$appPath = Join-Path $InstallDir $AppExe
$corePath = Join-Path $InstallDir $CoreExe
$appName = [System.IO.Path]::GetFileNameWithoutExtension($AppExe)
$coreName = [System.IO.Path]::GetFileNameWithoutExtension($CoreExe)

function Write-Log([string]$message) {
    Add-Content -Path $log -Value ('{0} {1}' -f (Get-Date -Format 'o'), $message)
}

function Stop-App {
    Get-Process -Name $appName -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Get-Process -Name $coreName -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 800
}

Write-Log "watchdog: waiting up to ${TimeoutSec}s for confirmation"

# Let the installer finish and the relaunched app start before polling, so the
# first read is not a guaranteed miss.
Start-Sleep -Seconds 2

$deadline = (Get-Date).AddSeconds($TimeoutSec)
while ((Get-Date) -lt $deadline) {
    if (Test-Path $confirmed) {
        Write-Log 'watchdog: new build confirmed, keeping it'
        Remove-Item -Path $confirmed -Force -ErrorAction SilentlyContinue
        Remove-Item -Path $marker -Force -ErrorAction SilentlyContinue
        exit 0
    }
    Start-Sleep -Milliseconds 500
}

Write-Log 'watchdog: new build did not confirm, rolling back'

Stop-App

# Restore one binary at a time so a partial copy is visible in the log rather
# than silently leaving a mixed install.
foreach ($pair in @(@($AppExe, $appPath), @($CoreExe, $corePath))) {
    $source = Join-Path $BackupDir $pair[0]
    $target = $pair[1]
    if (-not (Test-Path $source)) {
        Write-Log "watchdog: no backup for $($pair[0])"
        continue
    }
    try {
        Copy-Item -Path $source -Destination $target -Force -ErrorAction Stop
    } catch {
        Write-Log "watchdog: could not restore $($pair[0]): $($_.Exception.Message)"
    }
}

Remove-Item -Path $marker -Force -ErrorAction SilentlyContinue
Write-Log 'watchdog: rolled back, starting the previous build'

if (Test-Path $appPath) {
    Start-Process -FilePath $appPath
}
exit 2
