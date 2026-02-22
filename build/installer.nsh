!macro customInstall
  WriteRegStr SHCTX "Software\Classes\Applications\Simple Manga Viewer.exe" "FriendlyAppName" "Simple Manga Viewer"
  WriteRegStr SHCTX "Software\Classes\Applications\Simple Manga Viewer.exe\shell\open" "FriendlyAppName" "Simple Manga Viewer"
!macroend
