$ErrorActionPreference = "Stop"
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  exit
}
$packageRoot = Split-Path -Parent $PSScriptRoot
$installer = Join-Path $packageRoot "Install-TenderatAI.ps1"
if (-not (Test-Path -LiteralPath $installer)) { throw "Install-TenderatAI.ps1 nuk u gjet në paketën e re." }
foreach ($name in @("TenderatAI Tunnel", "TenderatAI Worker", "TenderatAI Web")) {
  Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
}
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "Përditësimi dështoi." }
Write-Output "Tenderat AI u përditësua. Të dhënat në Supabase nuk u prekën."
