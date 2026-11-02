<#
.SYNOPSIS
    Install this workspace into OpenCode's global config and skill directories on Windows.

.DESCRIPTION
    Default mode copies files. Use -Mode link for development.
    Existing config entries are backed up before being replaced.
    An existing memory directory is NEVER overwritten.

.PARAMETER Mode
    copy (default) or link. Link uses junctions for directories and symlinks for files.

.PARAMETER DryRun
    Print what would happen, change nothing.

.PARAMETER NoNpm
    Skip npm install.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\windows\install.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\windows\install.ps1 -Mode link -DryRun
#>
param(
    [ValidateSet("copy", "link")]
    [string]$Mode = "copy",
    [switch]$DryRun,
    [switch]$NoNpm
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$Root = Split-Path -Parent $PSScriptRoot
$ConfigDir = if ($env:OPENCODE_CONFIG_HOME) { $env:OPENCODE_CONFIG_HOME } else { Join-Path $HOME ".config\opencode" }
$SkillsDir = if ($env:OPENCODE_SKILLS_HOME) { $env:OPENCODE_SKILLS_HOME } else { Join-Path $HOME ".agents\skills" }
$Backup = "$ConfigDir.bak-" + (Get-Date -Format "yyyyMMdd-HHmmss")

function Say([string]$Message) { Write-Output $Message }

function Run([scriptblock]$Action) {
    if ($DryRun) {
        Write-Output "+ $Action"
        return
    }
    & $Action
}

function Backup-Target([string]$Target) {
    if (-not (Test-Path -LiteralPath $Target)) { return }
    $relative = $Target.Substring($ConfigDir.Length).TrimStart('\', '/')
    $dest = Join-Path $Backup $relative
    Run { New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null }
    Run { Copy-Item -LiteralPath $Target -Destination $dest -Recurse -Force }
}

function Install-Entry([string]$Source, [string]$Target) {
    if (Test-Path -LiteralPath $Target) {
        Backup-Target $Target
    }

    if ($Mode -eq "link") {
        Run { Remove-Item -LiteralPath $Target -Recurse -Force -ErrorAction SilentlyContinue }
        try {
            if (-not $DryRun) {
                if ((Get-Item -LiteralPath $Source).PSIsContainer) {
                    New-Item -ItemType Junction -Path $Target -Target $Source | Out-Null
                } else {
                    New-Item -ItemType SymbolicLink -Path $Target -Target $Source | Out-Null
                }
            } else {
                Write-Output "+ link $Target -> $Source"
            }
            return
        } catch {
            Write-Warning "Link failed for $Target, falling back to copy: $_"
        }
    }

    if ((Get-Item -LiteralPath $Source).PSIsContainer) {
        Run { New-Item -ItemType Directory -Force -Path $Target | Out-Null }
        Run { Copy-Item -Path (Join-Path $Source "*") -Destination $Target -Recurse -Force }
    } else {
        Run { New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Target) | Out-Null }
        Run { Copy-Item -LiteralPath $Source -Destination $Target -Force }
    }
}

Say "Workspace:  $Root"
Say "Config:     $ConfigDir"
Say "Skills:     $SkillsDir"
Say "Mode:       $Mode"
if ($DryRun) { Say "Dry run:    yes" }
Say ""

Say "==> Installing config"
Run { New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null }
foreach ($entry in Get-ChildItem -LiteralPath (Join-Path $Root "config") -Force) {
    Install-Entry $entry.FullName (Join-Path $ConfigDir $entry.Name)
}

Say ""
$MemoryDir = Join-Path $ConfigDir "memory"
if (Test-Path -LiteralPath $MemoryDir) {
    Say "==> Memory exists, keeping it untouched: $MemoryDir"
} else {
    Say "==> Installing memory template"
    Run { Copy-Item -LiteralPath (Join-Path $Root "memory.template") -Destination $MemoryDir -Recurse -Force }
}

Say ""
Say "==> Installing Windows scripts"
$ScriptsDir = Join-Path $ConfigDir "scripts"
Run { New-Item -ItemType Directory -Force -Path $ScriptsDir | Out-Null }
foreach ($name in @("capture.ps1", "capture-shortcut.ps1")) {
    $source = Join-Path $PSScriptRoot $name
    if (Test-Path -LiteralPath $source) {
        Install-Entry $source (Join-Path $ScriptsDir $name)
    }
}

Say ""
Say "==> Installing skills"
Run { New-Item -ItemType Directory -Force -Path $SkillsDir | Out-Null }
foreach ($entry in Get-ChildItem -LiteralPath (Join-Path $Root "skills") -Force) {
    $target = Join-Path $SkillsDir $entry.Name
    if (Test-Path -LiteralPath $target) {
        Run { New-Item -ItemType Directory -Force -Path (Join-Path $Backup "skills") | Out-Null }
        Run { Copy-Item -LiteralPath $target -Destination (Join-Path $Backup "skills") -Recurse -Force }
    }
    Install-Entry $entry.FullName $target
}

$packageJson = Join-Path $ConfigDir "package.json"
if (-not $NoNpm -and (Get-Command npm -ErrorAction SilentlyContinue) -and (Test-Path -LiteralPath $packageJson)) {
    Say ""
    Say "==> Installing plugin dependency"
    if ($DryRun) {
        Say "+ (cd `"$ConfigDir`" ; npm install --no-save --no-package-lock)"
    } else {
        Push-Location $ConfigDir
        try {
            & npm install --no-save --no-package-lock
        } finally {
            Pop-Location
        }
    }
}

if (-not $DryRun -and (Test-Path -LiteralPath $Backup)) {
    Say ""
    Say "Backup:     $Backup"
}

Say ""
Say "Next steps:"
Say "  1. `$env:DEEPSEEK_API_KEY = 'sk-...'   # or edit config\opencode.json"
Say "  2. opencode debug config               # verify the config parses"
Say "  3. opencode                            # start the TUI"
Say ""
Say "Optional: tvly login (search plugin), and the capture hotkey in windows/README.md."
