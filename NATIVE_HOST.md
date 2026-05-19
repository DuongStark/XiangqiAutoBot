# Native host setup

This is the dev setup for the Chrome Native Messaging companion.

## Install

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Load this folder as an unpacked extension.
4. Copy the extension ID.
5. Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\install_native_host.ps1 -ExtensionId YOUR_EXTENSION_ID
```

After that, the popup `Start Bot` button can ask the native host to start
`server.py` and then enable auto mode.

## Uninstall

```powershell
powershell -ExecutionPolicy Bypass -File .\uninstall_native_host.ps1
```

## Distribution note

For public distribution, replace this dev PowerShell setup with a signed
installer. The installer should write the same Native Messaging registry key and
ship a real `native_host.exe` companion instead of the dev `.cmd` launcher.
