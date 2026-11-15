# Exercises the self-update watchdog end to end against a throwaway install
# directory, without touching the real install.
#
# Run from the repository root:
#   powershell -NoProfile -File lingzhu-app/build/windows/nsis/watchdog-check.ps1
#
# It builds two fake binaries (a "good" one that exits immediately and a "bad"
# one that never confirms), packs them into a scratch installer, and asserts
# both outcomes: a confirmed build is kept, an unconfirmed build is rolled back.

$ErrorActionPreference = 'Stop'

$nsisDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$makensis = Join-Path ${env:ProgramFiles(x86)} 'NSIS\makensis.exe'
if (-not (Test-Path $makensis)) {
    throw "makensis not found at $makensis"
}

$work = Join-Path $env:TEMP ('lingzhu-watchdog-' + [Guid]::NewGuid().ToString('N'))
$installDir = Join-Path $work 'install'
$updateDir = Join-Path $work 'update'
New-Item -ItemType Directory -Force -Path $work, $installDir | Out-Null

function Copy-InstallerSources([string]$target) {
    Copy-Item (Join-Path $nsisDir 'wails_tools.nsh') $target
    Copy-Item (Join-Path $nsisDir 'rollback.ps1') $target
    Copy-Item (Join-Path $nsisDir '..\icon.ico') $target
    Copy-Item (Join-Path $nsisDir 'MicrosoftEdgeWebview2Setup.exe') $target
}

# A stand-in for the real binaries. The "old" build has to stay alive so the
# installer treats the run as a self-update; ping does that without a window.
$oldApp = Join-Path $work 'old-app.exe'
$oldCore = Join-Path $work 'old-core.exe'
$newApp = Join-Path $work 'new-app.exe'
$newCore = Join-Path $work 'new-core.exe'
Copy-Item (Join-Path $env:SystemRoot 'System32\PING.EXE') $oldApp
Copy-Item (Join-Path $env:SystemRoot 'System32\PING.EXE') $oldCore
Copy-Item (Join-Path $env:SystemRoot 'System32\NOTEPAD.EXE') $newApp
Copy-Item (Join-Path $env:SystemRoot 'System32\NOTEPAD.EXE') $newCore

function New-ScratchInstaller([string]$outName) {
    Copy-InstallerSources $work
    $script = Get-Content (Join-Path $nsisDir 'project.nsi') -Raw
    $script = $script -replace 'OutFile ".*"', ('OutFile "' + $outName + '"')
    $script = $script -replace '\.\.\\icon\.ico', 'icon.ico'
    $script = $script -replace 'InstallDir "\$LOCALAPPDATA\\Programs\\\$\{INFO_PRODUCTNAME\}"', ('InstallDir "' + $installDir + '"')
    $script = $script -replace 'StrCpy \$UpdateDir ".*"', ('StrCpy $UpdateDir "' + $updateDir + '"')
    $path = Join-Path $work 'project.nsi'
    Set-Content -Path $path -Value $script
    Push-Location $work
    try {
        & $makensis /V2 `
            /DWAILS_INSTALL_SCOPE=user /DREQUEST_EXECUTION_LEVEL=user `
            /DWATCHDOG_TIMEOUT=5 `
            ('/DARG_WAILS_AMD64_BINARY=' + $newApp) `
            ('/DARG_WAILS_CORE_BINARY=' + $newCore) `
            project.nsi | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'makensis failed' }
    } finally {
        Pop-Location
    }
    return (Join-Path $work $outName)
}

function Reset-Install {
    Remove-Item -Recurse -Force $updateDir -ErrorAction SilentlyContinue
    Copy-Item $oldApp (Join-Path $installDir 'lingzhu-app.exe') -Force
    Copy-Item $oldCore (Join-Path $installDir 'lingzhu.exe') -Force
    # The installer only treats an install as a self-update when the app is
    # already running, so the check has to reproduce that. ping keeps running
    # without a window.
    Start-Process -FilePath (Join-Path $installDir 'lingzhu-app.exe') -ArgumentList '-n', '600', '127.0.0.1' -WindowStyle Hidden -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

$oldSize = (Get-Item $oldApp).Length
$newSize = (Get-Item $newApp).Length
$failures = @()

# Case 1: the new build never confirms, so the watchdog must restore the old one.
Reset-Install
$installer = New-ScratchInstaller 'bad.exe'
$proc = Start-Process -FilePath $installer -ArgumentList '/S' -Wait -PassThru
# The watchdog waits 5s in this build; leave room for the installer itself.
Start-Sleep -Seconds 12
$afterSize = (Get-Item (Join-Path $installDir 'lingzhu-app.exe')).Length
if ($afterSize -ne $oldSize) {
    $failures += "rollback: expected the previous binary ($oldSize bytes), found $afterSize"
}
if (-not (Test-Path (Join-Path $updateDir 'update.log'))) {
    $failures += 'rollback: the watchdog never wrote a log'
}

# Case 2: the app confirms in time, so the watchdog must keep the new build.
# The confirmation has to land after the installer clears old markers but before
# the watchdog decides, which is the window a healthy app confirms in. The
# watchdog sleeps 2s before its first check, so a fast waiter always wins.
Reset-Install
$installer = New-ScratchInstaller 'good.exe'
$proc = Start-Process -FilePath $installer -ArgumentList '/S' -PassThru
$deadline = (Get-Date).AddSeconds(20)
while ((Get-Date) -lt $deadline) {
    if (Test-Path (Join-Path $updateDir 'pending.txt')) {
        Set-Content -Path (Join-Path $updateDir 'confirmed.txt') -Value 'ok'
        break
    }
    Start-Sleep -Milliseconds 50
}
$proc.WaitForExit()
Start-Sleep -Seconds 10
$afterSize = (Get-Item (Join-Path $installDir 'lingzhu-app.exe')).Length
if ($afterSize -ne $newSize) {
    $failures += "confirm: expected the new binary ($newSize bytes), found $afterSize"
}
$log = Join-Path $updateDir 'update.log'
if (-not (Test-Path $log) -or -not (Select-String -Path $log -Pattern 'confirmed' -Quiet)) {
    $failures += 'confirm: the watchdog did not log the confirmation'
}

Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue

if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Error $_ }
    exit 1
}
Write-Host 'watchdog check: rollback and confirm both behave'
exit 0
