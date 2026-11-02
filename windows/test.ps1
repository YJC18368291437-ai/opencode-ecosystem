# Local Windows checks: PowerShell parse, JSON parse, JS syntax, unit tests.
# Usage: powershell -ExecutionPolicy Bypass -File .\windows\test.ps1
param(
    [switch]$SkipNode
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$failed = $false

function Check([string]$Name, [scriptblock]$Action) {
    try {
        & $Action
        Write-Output "PASS  $Name"
    } catch {
        Write-Output "FAIL  $Name : $_"
        $script:failed = $true
    }
}

Write-Output "==> PowerShell syntax"
foreach ($file in Get-ChildItem -LiteralPath (Join-Path $Root "windows") -Filter "*.ps1") {
    Check $file.Name {
        $tokens = $null
        $errors = $null
        [System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$errors) | Out-Null
        if ($errors -and $errors.Count -gt 0) {
            throw ($errors | ForEach-Object { $_.Message }) -join "; "
        }
    }
}

if ($SkipNode) {
    if ($failed) { exit 1 }
    exit 0
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Output "SKIP  Node.js checks (node not found)"
    if ($failed) { exit 1 }
    exit 0
}

Check "JSON files" {
    foreach ($file in @("config\opencode.json", "config\tui.json", "config\handoff.json", "config\package.json")) {
        $path = Join-Path $Root $file
        Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json | Out-Null
    }
}

Check "JavaScript syntax" {
    $files = @()
    $files += Get-ChildItem -LiteralPath (Join-Path $Root "config\scripts") -Filter "*.mjs"
    $files += Get-ChildItem -LiteralPath (Join-Path $Root "config\plugins") -Filter "*.js"
    foreach ($file in $files) {
        & node --check $file.FullName
        if ($LASTEXITCODE -ne 0) { throw "node --check failed: $($file.Name)" }
    }
}

Check "Unit tests" {
    & node --test (Join-Path $Root "config\scripts\tag-core.test.mjs")
    if ($LASTEXITCODE -ne 0) { throw "unit tests failed" }
}

if ($failed) { exit 1 }
Write-Output ""
Write-Output "All Windows checks passed."
