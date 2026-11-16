Unicode true

####
## Please note: Template replacements don't work in this file. They are provided with default defines like
## mentioned underneath.
## If the keyword is not defined, "wails_tools.nsh" will populate them.
## If they are defined here, "wails_tools.nsh" will not touch them. This allows you to use this project.nsi manually
## from outside of Wails for debugging and development of the installer.
## 
## For development first make a wails nsis build to populate the "wails_tools.nsh":
## > wails build --target windows/amd64 --nsis
## Then you can call makensis on this file with specifying the path to your binary:
## For a AMD64 only installer:
## > makensis -DARG_WAILS_AMD64_BINARY=..\..\bin\app.exe
## For a ARM64 only installer:
## > makensis -DARG_WAILS_ARM64_BINARY=..\..\bin\app.exe
## For a installer with both architectures:
## > makensis -DARG_WAILS_AMD64_BINARY=..\..\bin\app-amd64.exe -DARG_WAILS_ARM64_BINARY=..\..\bin\app-arm64.exe
####
## The following information is taken from the wails_tools.nsh file, but they can be overwritten here.
####
## !define INFO_PROJECTNAME    "my-project" # Default "lingzhu-app"
## !define INFO_COMPANYNAME    "My Company" # Default "Lingzhu"
## !define INFO_PRODUCTNAME    "My Product Name" # Default "Lingzhu"
## !define INFO_PRODUCTVERSION "1.0.0"     # Default "0.1.0"
## !define INFO_COPYRIGHT      "(c) Now, Lingzhu contributors" # Default "© 2026, Lingzhu contributors"
###
## !define PRODUCT_EXECUTABLE  "Application.exe"      # Default "${INFO_PROJECTNAME}.exe"
## !define UNINST_KEY_NAME     "UninstKeyInRegistry"  # Default "${INFO_COMPANYNAME}${INFO_PRODUCTNAME}"
####
## !define REQUEST_EXECUTION_LEVEL "admin"            # Default "admin"  see also https://nsis.sourceforge.io/Docs/Chapter4.html
## !define WAILS_INSTALL_SCOPE     "user"             # Default "machine" - set to "user" for per-user install ($LOCALAPPDATA) without UAC prompt
####
## Include the wails tools
####
!include "wails_tools.nsh"
!include "LogicLib.nsh"

# The version information for this two must consist of 4 parts
VIProductVersion "${INFO_PRODUCTVERSION}.0"
VIFileVersion    "${INFO_PRODUCTVERSION}.0"

VIAddVersionKey "CompanyName"     "${INFO_COMPANYNAME}"
VIAddVersionKey "FileDescription" "${INFO_PRODUCTNAME} Installer"
VIAddVersionKey "ProductVersion"  "${INFO_PRODUCTVERSION}"
VIAddVersionKey "FileVersion"     "${INFO_PRODUCTVERSION}"
VIAddVersionKey "LegalCopyright"  "${INFO_COPYRIGHT}"
VIAddVersionKey "ProductName"     "${INFO_PRODUCTNAME}"

# Enable HiDPI support. https://nsis.sourceforge.io/Reference/ManifestDPIAware
ManifestDPIAware true

!include "MUI.nsh"

!define MUI_ICON "..\icon.ico"
!define MUI_UNICON "..\icon.ico"
# !define MUI_WELCOMEFINISHPAGE_BITMAP "resources\leftimage.bmp" #Include this to add a bitmap on the left side of the Welcome Page. Must be a size of 164x314
!define MUI_FINISHPAGE_NOAUTOCLOSE # Wait on the INSTFILES page so the user can take a look into the details of the installation steps
!define MUI_ABORTWARNING # This will warn the user if they exit from the installer.
# Offer to start the app after an interactive install. A silent install used by
# the self-updater is followed by the updater's own relaunch instead.
!define MUI_FINISHPAGE_RUN "$INSTDIR\${PRODUCT_EXECUTABLE}"
!define MUI_FINISHPAGE_RUN_TEXT "Start ${INFO_PRODUCTNAME}"

!insertmacro MUI_PAGE_WELCOME # Welcome to the installer page.
# !insertmacro MUI_PAGE_LICENSE "resources\eula.txt" # Adds a EULA page to the installer
!insertmacro MUI_PAGE_DIRECTORY # In which folder install page.
!insertmacro MUI_PAGE_INSTFILES # Installing page.
!insertmacro MUI_PAGE_FINISH # Finished installation page.

!insertmacro MUI_UNPAGE_INSTFILES # Uninstalling page

!insertmacro MUI_LANGUAGE "English" # Set the Language of the installer

## The following two statements can be used to sign the installer and the uninstaller. The path to the binaries are provided in %1
#!uninstfinalize 'signtool --file "%1"'
#!finalize 'signtool --file "%1"'

Name "${INFO_PRODUCTNAME}"
OutFile "..\..\..\bin\${INFO_PROJECTNAME}-${ARCH}-installer.exe" # Name of the installer's file.
!if "${WAILS_INSTALL_SCOPE}" == "user"
    InstallDir "$LOCALAPPDATA\Programs\${INFO_PRODUCTNAME}"
!else
    InstallDir "$PROGRAMFILES64\${INFO_COMPANYNAME}\${INFO_PRODUCTNAME}"
!endif
ShowInstDetails show # This will always show the installation details.

Var WasRunning
Var UpdateDir

Function .onInit
   !insertmacro wails.checkArchitecture

   # Remember whether the app was running before this install. A silent install
   # that replaced a running app is a self-update, and the app has to come back
   # without the user finding it. An ordinary silent install on a fresh machine
   # must not open a window. findstr exits 0 only when the image is listed,
   # because tasklist prints a message instead of an empty result.
   StrCpy $WasRunning "0"
   nsExec::Exec 'cmd /c tasklist /FI "IMAGENAME eq ${PRODUCT_EXECUTABLE}" /NH | findstr /I /C:"${PRODUCT_EXECUTABLE}"'
   Pop $0
   ${If} $0 == "0"
       StrCpy $WasRunning "1"
   ${EndIf}

   # Update bookkeeping lives beside the install, not inside it, so a rollback
   # never has to touch a directory it is restoring.
   StrCpy $UpdateDir "$LOCALAPPDATA\lingzhu\update"
   CreateDirectory "$UpdateDir"
FunctionEnd

# How long the watchdog waits for the new build to confirm before rolling back.
# The app normally confirms within seconds; the default leaves room for a slow
# first start on a cold machine. A build can override it for testing.
!ifndef WATCHDOG_TIMEOUT
    !define WATCHDOG_TIMEOUT 120
!endif

# Bring the app back after a self-update. The relaunch flag lets the new build
# report that it came from an update.
Function RelaunchAfterUpdate
    ${If} $WasRunning == "1"
        ${If} ${Silent}
            Exec '"$INSTDIR\${PRODUCT_EXECUTABLE}" --relaunched'
        ${EndIf}
    ${EndIf}
FunctionEnd

# Keep the binaries this install is about to replace, so a build that cannot
# start can be undone. A silent install that was not replacing a running app has
# nothing to fall back to and no window to recover, so it skips the backup.
Function BackupCurrent
    ${If} $WasRunning != "1"
        Return
    ${EndIf}
    RMDir /r "$UpdateDir\backup"
    CreateDirectory "$UpdateDir\backup"
    ${If} ${FileExists} "$INSTDIR\${PRODUCT_EXECUTABLE}"
        CopyFiles /SILENT "$INSTDIR\${PRODUCT_EXECUTABLE}" "$UpdateDir\backup\${PRODUCT_EXECUTABLE}"
    ${EndIf}
    ${If} ${FileExists} "$INSTDIR\lingzhu.exe"
        CopyFiles /SILENT "$INSTDIR\lingzhu.exe" "$UpdateDir\backup\lingzhu.exe"
    ${EndIf}
    # The marker is what tells the watchdog this run was an update it must
    # verify. Writing it before the files change means a crash mid-install
    # still rolls back.
    FileOpen $0 "$UpdateDir\pending.txt" w
    FileWrite $0 "1"
    FileClose $0
    Delete "$UpdateDir\confirmed.txt"
FunctionEnd

# Start the watchdog that waits for the new build to confirm it works. It runs
# outside this installer and outside the app, because neither can undo a build
# that fails to start.
Function StartWatchdog
    ${If} $WasRunning != "1"
        Return
    ${EndIf}
    ${If} ${FileExists} "$UpdateDir\backup\${PRODUCT_EXECUTABLE}"
        Exec 'powershell -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$UpdateDir\rollback.ps1" -InstallDir "$INSTDIR" -AppExe "${PRODUCT_EXECUTABLE}" -CoreExe "lingzhu.exe" -BackupDir "$UpdateDir\backup" -UpdateDir "$UpdateDir" -TimeoutSec ${WATCHDOG_TIMEOUT}'
    ${EndIf}
FunctionEnd

# Stop every running copy before any file is written. A running executable keeps
# its image locked, and NSIS then skips that single File instruction without
# failing the install, which would leave the old binary in place while reporting
# success.
#
# Neither taskkill uses /T: a detached updater is a child of the process it is
# replacing, so a tree kill would take down the installer itself. The core's own
# children live in job objects that die with it, so the tree does not need to be
# walked.
Function StopRunningInstances
    DetailPrint "Stopping running ${INFO_PRODUCTNAME}"
    nsExec::ExecToLog 'taskkill /IM "${PRODUCT_EXECUTABLE}"'
    Pop $0
    nsExec::ExecToLog 'taskkill /IM "lingzhu.exe"'
    Pop $0
    Sleep 1500
    nsExec::ExecToLog 'taskkill /F /IM "${PRODUCT_EXECUTABLE}"'
    Pop $0
    nsExec::ExecToLog 'taskkill /F /IM "lingzhu.exe"'
    Pop $0
    Sleep 500
FunctionEnd

# Fail loudly when a binary could not be replaced. A silent skip is the one
# failure mode a self-update cannot recover from: the installer exits 0 and the
# old build keeps running.
!macro WriteBinary CHECKED_SOURCE TARGET_NAME
    ClearErrors
    File "/oname=${TARGET_NAME}" "${CHECKED_SOURCE}"
    ${If} ${Errors}
        SetErrorLevel 3
        DetailPrint "Could not replace ${TARGET_NAME}"
        Abort "Could not replace ${TARGET_NAME}. Close ${INFO_PRODUCTNAME} and run the installer again."
    ${EndIf}
!macroend

Section
    !insertmacro wails.setShellContext

    !insertmacro wails.webview2runtime

    # The rollback helper is unpacked beside the update bookkeeping, not into
    # $PLUGINSDIR: that directory is deleted when the installer exits, and the
    # watchdog has to outlive the installer.
    SetOutPath "$UpdateDir"
    File "rollback.ps1"

    Call StopRunningInstances

    # The previous binaries are kept before anything is replaced: a build that
    # cannot start has to be undoable from outside itself.
    Call BackupCurrent

    SetOutPath $INSTDIR

    # The license ships beside the binaries: a per-user install has no other
    # copy of it, and the About page points at this file.
    !ifdef ARG_WAILS_LICENSE
        File "/oname=LICENSE.txt" "${ARG_WAILS_LICENSE}"
    !endif
    !ifdef ARG_WAILS_NOTICES
        File "/oname=THIRD_PARTY_NOTICES.txt" "${ARG_WAILS_NOTICES}"
    !endif

    !ifdef SUPPORTS_AMD64
        ${if} ${IsNativeAMD64}
            !insertmacro WriteBinary "${ARG_WAILS_AMD64_BINARY}" "${PRODUCT_EXECUTABLE}"
        ${EndIf}
    !endif

    !ifdef SUPPORTS_ARM64
        ${if} ${IsNativeARM64}
            !insertmacro WriteBinary "${ARG_WAILS_ARM64_BINARY}" "${PRODUCT_EXECUTABLE}"
        ${EndIf}
    !endif

    # The core runs as a sidecar: the app finds it in its own directory, so both
    # binaries ship together and no environment variable is needed.
    !ifdef ARG_WAILS_CORE_BINARY
        !insertmacro WriteBinary "${ARG_WAILS_CORE_BINARY}" "lingzhu.exe"
    !endif

    CreateShortcut "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"
    CreateShortCut "$DESKTOP\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"

    !insertmacro wails.associateFiles
    !insertmacro wails.associateCustomProtocols
    
    !insertmacro wails.writeUninstaller
SectionEnd

# The relaunch runs after every file is in place, so it can never start a binary
# the installer is still writing.
Function .onInstSuccess
    Call StartWatchdog
    Call RelaunchAfterUpdate
FunctionEnd

Section "uninstall" 
    !insertmacro wails.setShellContext

    # An uninstall while the app runs would leave locked files behind.
    Call un.StopRunningInstances

    RMDir /r "$AppData\${PRODUCT_EXECUTABLE}" # Remove the WebView2 DataPath

    RMDir /r $INSTDIR

    Delete "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk"
    Delete "$DESKTOP\${INFO_PRODUCTNAME}.lnk"

    !insertmacro wails.unassociateFiles
    !insertmacro wails.unassociateCustomProtocols

    !insertmacro wails.deleteUninstaller
SectionEnd

Function un.StopRunningInstances
    nsExec::ExecToLog 'taskkill /IM "${PRODUCT_EXECUTABLE}"'
    Pop $0
    nsExec::ExecToLog 'taskkill /IM "lingzhu.exe"'
    Pop $0
    Sleep 1500
    nsExec::ExecToLog 'taskkill /F /IM "${PRODUCT_EXECUTABLE}"'
    Pop $0
    nsExec::ExecToLog 'taskkill /F /IM "lingzhu.exe"'
    Pop $0
    Sleep 500
FunctionEnd
