param(
  [Parameter(Position = 0, ValueFromRemainingArguments = $true)]
  [string[]]$Text,
  [switch]$Clipboard,
  [switch]$Image,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8

if ([System.Threading.Thread]::CurrentThread.GetApartmentState() -ne "STA") {
  $argList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"")
  if ($Text) { $argList += $Text }
  if ($Clipboard) { $argList += "-Clipboard" }
  if ($Image) { $argList += "-Image" }
  if ($DryRun) { $argList += "-DryRun" }
  $p = Start-Process -FilePath "powershell.exe" -ArgumentList $argList -PassThru -NoNewWindow -Wait
  exit $p.ExitCode
}

$max = if ($env:CAPTURE_MAX) { [int]$env:CAPTURE_MAX } else { 500 }
$imgDir = Join-Path $HOME ".cache\opencode\captures"
$homeDir = $HOME

function Fail([string]$msg) {
  Write-Error "捕获失败：$msg"
  exit 2
}

function Read-ClipboardText {
  try { Get-Clipboard -Raw -ErrorAction Stop } catch { "" }
}

function Save-ClipboardImage {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $img = [System.Windows.Forms.Clipboard]::GetImage()
  if ($null -eq $img) { return $null }
  New-Item -ItemType Directory -Force -Path $imgDir | Out-Null
  Get-ChildItem $imgDir -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-1) } |
    Remove-Item -Force -ErrorAction SilentlyContinue
  $file = Join-Path $imgDir ((Get-Date -Format "yyyyMMdd-HHmmss") + "-$PID.png")
  if ($img.Width -gt 1600) {
    $h = [int]($img.Height * 1600 / $img.Width)
    $bmp = New-Object System.Drawing.Bitmap 1600, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($img, 0, 0, 1600, $h)
    $g.Dispose()
    $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
  } else {
    $img.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  $img.Dispose()
  return $file
}

function Get-FreePort {
  $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
  $listener.Start()
  $port = $listener.LocalEndpoint.Port
  $listener.Stop()
  return $port
}

$captured = ""
if (-not $Image) {
  if ($Text -and $Text.Count -gt 0) { $captured = ($Text -join " ") }
  elseif ($Clipboard -or -not $Text) { $captured = Read-ClipboardText }
}

$imgPath = $null
$prompt = $null

if (-not [string]::IsNullOrWhiteSpace($captured)) {
  $flat = ($captured -replace "\s+", " ").Trim()
  if ($flat.Length -gt $max) { $flat = $flat.Substring(0, $max) + "…" }
  $prompt = "解释一下：$flat"
} else {
  if (-not $Clipboard -and -not $Image) { Fail "没有文字输入。用法：capture.ps1 `"文字`" | -Clipboard | -Image" }
  $imgPath = Save-ClipboardImage
  if (-not $imgPath) { Fail "剪贴板里没有文字，也没有图片" }
  $prompt = "解释一下这张图：$imgPath"
}

if ($DryRun) {
  Write-Output $prompt
  if ($imgPath -and $env:CAPTURE_KEEP_IMAGE -ne "1") { Remove-Item -Force $imgPath -ErrorAction SilentlyContinue }
  exit 0
}

$port = Get-FreePort
$password = [guid]::NewGuid().ToString("N")
$tmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ("capture-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
$launcher = Join-Path $tmpDir "launch.ps1"

$launcherBody = @"
`$env:OPENCODE_SERVER_PASSWORD = '$password'
Set-Location -LiteralPath '$homeDir'
opencode --agent capture --port $port
"@
[System.IO.File]::WriteAllText($launcher, $launcherBody, (New-Object System.Text.UTF8Encoding($false)))

$wt = Get-Command wt.exe -ErrorAction SilentlyContinue
if ($wt) {
  Start-Process -FilePath $wt.Source -ArgumentList "-d `"$homeDir`" powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$launcher`""
} else {
  Start-Process -FilePath "powershell.exe" -ArgumentList "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$launcher`""
}

$auth = "Basic " + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("opencode:$password"))
$body = [Text.Encoding]::UTF8.GetBytes((@{ text = $prompt } | ConvertTo-Json -Compress))
$filled = $false

for ($i = 0; $i -lt 90; $i++) {
  Start-Sleep -Milliseconds 700
  try {
    $res = Invoke-WebRequest -Uri "http://127.0.0.1:$port/tui/append-prompt" -Method Post `
      -Headers @{ Authorization = $auth } -ContentType "application/json; charset=utf-8" `
      -Body $body -UseBasicParsing -TimeoutSec 3
    if ($res.StatusCode -eq 200) { $filled = $true; break }
  } catch { }
}

Remove-Item -Recurse -Force -LiteralPath $tmpDir -ErrorAction SilentlyContinue

if ($filled) {
  Write-Output ("已填入输入框（未发送），改完按回车：" + $prompt.Substring(0, [Math]::Min(40, $prompt.Length)) + "…")
  exit 0
}

Set-Clipboard -Value $prompt
Write-Warning "没能自动填入输入框，提示已复制到剪贴板，到窗口里 Ctrl+V 即可"
exit 0
