# Windows

The workspace is local-first and mostly OS-agnostic: memory, handoffs, cost
tracking, the study coach, and session tagging all run on Node.js. This folder
adds the Windows-specific pieces so the same `config/` and `skills/` work on
Windows without WSL.

## Requirements

- Windows 10/11
- PowerShell **5.1** (the built-in one) or PowerShell 7+
- Node.js **22+** (`scripts/ocs.mjs` uses `node:sqlite`)
- OpenCode **1.19.x**
- `npm`

## Install

```powershell
git clone <your-fork-url> opencode-ecosystem
Set-Location opencode-ecosystem

# Copy config and skills into place (backs up conflicts)
powershell -ExecutionPolicy Bypass -File .\windows\install.ps1

# Development mode: link instead of copy
powershell -ExecutionPolicy Bypass -File .\windows\install.ps1 -Mode link

# Preview only
powershell -ExecutionPolicy Bypass -File .\windows\install.ps1 -DryRun
```

The installer mirrors `install.sh`:

- copies `config\` to `%USERPROFILE%\.config\opencode\`
- copies `skills\` to `%USERPROFILE%\.agents\skills\`
- copies `memory.template\` to `~\.config\opencode\memory\` **only if memory does not already exist**
- copies `windows\capture.ps1` and `windows\capture-shortcut.ps1` into `~\.config\opencode\scripts\`
- never overwrites an existing memory directory
- runs `npm install` inside `~\.config\opencode` for the TUI plugin dependency
- puts backups in `~\.config\opencode.bak-<timestamp>`

Set the provider key in the environment (the repo config reads it from
`DEEPSEEK_API_KEY`):

```powershell
$env:DEEPSEEK_API_KEY = "sk-..."
opencode debug config
opencode
```

To persist it for your user:

```powershell
[Environment]::SetEnvironmentVariable("DEEPSEEK_API_KEY", "sk-...", "User")
```

If `opencode debug config` reports the injected instruction files as missing,
set `HOME` for your user (the config uses `{env:HOME}`):

```powershell
[Environment]::SetEnvironmentVariable("HOME", $env:USERPROFILE, "User")
```

## Capture hotkey

`capture.ps1` mirrors `capture-tutor.sh`: it takes text or a clipboard image and
opens a new `capture` session with the text prefilled.

```powershell
# Inline text
powershell -ExecutionPolicy Bypass -File ~\.config\opencode\scripts\capture.ps1 "要解释的文字"

# Clipboard text or image
powershell -ExecutionPolicy Bypass -File ~\.config\opencode\scripts\capture.ps1 -Clipboard
powershell -ExecutionPolicy Bypass -File ~\.config\opencode\scripts\capture.ps1 -Image
```

Create a desktop hotkey shortcut (default `CTRL+ALT+S`):

```powershell
powershell -ExecutionPolicy Bypass -File ~\.config\opencode\scripts\capture-shortcut.ps1
```

The shortcut launches `capture.ps1 -Clipboard` hidden. Images are stored under
`~\.cache\opencode\captures\` and older than one day are cleaned up on each run.

## Differences from macOS

| Feature | macOS | Windows |
|---|---|---|
| Installer | `install.sh` | `windows\install.ps1` |
| Capture shortcut | Automator service (`macos\`) | Desktop `.lnk` hotkey (`capture-shortcut.ps1`) |
| Terminal launch | Terminal.app | Windows Terminal (`wt.exe`) with PowerShell fallback |
| File links | symlink | junction / symlink, falls back to copy |

The `tagger.tsx`, `token-tracker.tsx`, and `study-panel.tsx` TUI plugins are
plain Node/TypeScript and run unchanged.

## CI

The GitHub Actions workflow runs the unit tests on `ubuntu-latest` and a Windows
syntax/JSON/test job on `windows-latest`. Run the Windows checks locally with:

```powershell
powershell -ExecutionPolicy Bypass -File .\windows\test.ps1
```
