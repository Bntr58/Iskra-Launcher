; IskraLauncherSetup.nsi
;
; Builds dist\IskraLauncherSetup.exe out of the already-packaged
; dist\IskraLauncher-win32-x64 folder (run `npm run pack` first).
;
; The dev machine's own config.json / images are deliberately NOT bundled —
; a fresh install always starts from the app's built-in DEFAULT_CONFIG
; (see main.js), which only seeds PORTAL 2.
;
; Run via: npm run installer   (scripts/build-installer.js finds makensis)

Unicode true

!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

; PROJECT_ROOT is passed in by scripts/build-installer.js (/DPROJECT_ROOT=...)
; so paths below don't depend on NSIS's "relative to the .nsi file" rule.
; Falls back to ".." for a manual `makensis scripts\installer.nsi` from repo root.
!ifndef PROJECT_ROOT
  !define PROJECT_ROOT ".."
!endif

!define APP_NAME "IskraLauncher"
!define APP_EXE  "IskraLauncher.exe"
!define SRC_DIR  "${PROJECT_ROOT}\dist\IskraLauncher-win32-x64"

Name "${APP_NAME}"
; APP_VERSION (YY.MM.DD.NN) is passed in by scripts/build-installer.js from version.json
!ifndef APP_VERSION
  !define APP_VERSION "dev"
!endif
OutFile "${PROJECT_ROOT}\dist\IskraLauncherSetup_${APP_VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\${APP_NAME}"
RequestExecutionLevel user
ShowInstDetails show
ShowUninstDetails show
BrandingText "IskraLauncher Setup"

!define MUI_ICON   "${PROJECT_ROOT}\renderer\assets\icon.ico"
!define MUI_UNICON "${PROJECT_ROOT}\renderer\assets\icon.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEFINISHPAGE_BITMAP   "${PROJECT_ROOT}\renderer\assets\MUI_WELCOMEFINISHPAGE_BITMAP.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "${PROJECT_ROOT}\renderer\assets\MUI_WELCOMEFINISHPAGE_BITMAP.bmp"

Var BaseDir
Var DirText

; ---------- installer pages ----------
!insertmacro MUI_PAGE_WELCOME
Page custom PickFolderPageCreate PickFolderPageLeave
!insertmacro MUI_PAGE_INSTFILES

!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Launch IskraLauncher"
!insertmacro MUI_PAGE_FINISH

; ---------- uninstaller pages ----------
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; ---------- pick a base folder; the "IskraLauncher" subfolder is automatic ----------

Function .onInit
  ; $INSTDIR is already set by NSIS at this point (from the InstallDir
  ; directive, or from a /D= command-line override for silent installs) —
  ; only remember it as the Browse dialog's starting folder, don't clobber it.
  StrCpy $BaseDir "$INSTDIR"
FunctionEnd

Function PickFolderPageCreate
  !insertmacro MUI_HEADER_TEXT "Install location" "Choose a folder; an '${APP_NAME}' folder will be created inside it"

  nsDialogs::Create 1018
  Pop $0

  ${NSD_CreateLabel} 0 0 100% 32u "All launcher files will be copied into an '${APP_NAME}' subfolder inside the folder chosen below."
  Pop $0

  ${NSD_CreateText} 0 38u 74% 13u "$INSTDIR"
  Pop $DirText

  ${NSD_CreateButton} 76% 37u 24% 15u "Browse..."
  Pop $0
  ${NSD_OnClick} $0 OnBrowseClick

  nsDialogs::Show
FunctionEnd

Function OnBrowseClick
  nsDialogs::SelectFolderDialog "Select the install folder" "$BaseDir"
  Pop $0
  ${If} $0 != error
    StrCpy $BaseDir "$0"
    StrCpy $INSTDIR "$0\${APP_NAME}"
    ${NSD_SetText} $DirText "$INSTDIR"
  ${EndIf}
FunctionEnd

Function PickFolderPageLeave
  ${NSD_GetText} $DirText $INSTDIR
  ${If} $INSTDIR == ""
    MessageBox MB_ICONEXCLAMATION "Please specify an install folder."
    Abort
  ${EndIf}
FunctionEnd

; ---------- install ----------

Section "Install"
  SetOutPath "$INSTDIR"
  ; config.json / images are the user's own portable data (game list, covers) —
  ; never ship the dev machine's copy, let the app create its own on first run.
  File /r /x "config.json" /x "images" "${SRC_DIR}\*.*"
  CreateDirectory "$INSTDIR\images"

  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"
  CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayIcon" "$INSTDIR\${APP_EXE}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "Publisher" "BnTr58"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "NoRepair" 1
SectionEnd

; ---------- uninstall ----------
; Removes only the app's own files. config.json / images / localization
; (the user's games, covers and any translations they added or edited)
; are left in place on purpose — see the finish message below.

Section "Uninstall"
  Delete "$INSTDIR\${APP_EXE}"
  Delete "$INSTDIR\LICENSE"
  Delete "$INSTDIR\LICENSES.chromium.html"
  Delete "$INSTDIR\chrome_100_percent.pak"
  Delete "$INSTDIR\chrome_200_percent.pak"
  Delete "$INSTDIR\d3dcompiler_47.dll"
  Delete "$INSTDIR\ffmpeg.dll"
  Delete "$INSTDIR\icudtl.dat"
  Delete "$INSTDIR\libEGL.dll"
  Delete "$INSTDIR\libGLESv2.dll"
  Delete "$INSTDIR\resources.pak"
  Delete "$INSTDIR\snapshot_blob.bin"
  Delete "$INSTDIR\v8_context_snapshot.bin"
  Delete "$INSTDIR\version"
  Delete "$INSTDIR\vk_swiftshader.dll"
  Delete "$INSTDIR\vk_swiftshader_icd.json"
  Delete "$INSTDIR\vulkan-1.dll"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir /r "$INSTDIR\locales"
  RMDir /r "$INSTDIR\resources"

  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  RMDir "$SMPROGRAMS\${APP_NAME}"
  Delete "$DESKTOP\${APP_NAME}.lnk"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"

  RMDir "$INSTDIR" ; only actually removes it if nothing user-owned is left
  IfFileExists "$INSTDIR" 0 uninstDone
    MessageBox MB_ICONINFORMATION|MB_OK "Your games, images and language files were kept here:$\n$INSTDIR$\n$\nDelete this folder manually if you no longer need it." /SD IDOK
    Goto uninstEnd
  uninstDone:
    MessageBox MB_ICONINFORMATION|MB_OK "IskraLauncher has been removed." /SD IDOK
  uninstEnd:
SectionEnd
