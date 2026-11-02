param(
  [string]$Hotkey = "CTRL+ALT+S",
  [string]$Name = "OpenCode Capture",
  [string]$Script = (Join-Path $PSScriptRoot "capture.ps1")
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Script)) { throw "找不到脚本：$Script" }

$desktop = [Environment]::GetFolderPath("Desktop")
$lnkPath = Join-Path $desktop "$Name.lnk"
$powershell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"

$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut($lnkPath)
$lnk.TargetPath = $powershell
$lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Script`" -Clipboard"
$lnk.WorkingDirectory = $HOME
$lnk.Hotkey = $Hotkey
$lnk.WindowStyle = 7
$lnk.Description = "Capture clipboard text/image into opencode capture agent"
$lnk.IconLocation = "$env:SystemRoot\System32\SnippingTool.exe,0"
$lnk.Save()

$check = $ws.CreateShortcut($lnkPath)
Write-Output ("快捷方式: " + $lnkPath)
Write-Output ("热键:     " + $check.Hotkey)
Write-Output ("目标:     " + $check.TargetPath + " " + $check.Arguments)
