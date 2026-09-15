param(
  [string]$LogPath = (Join-Path $env:TEMP "TenderatAI-install.log")
)

$ErrorActionPreference = "Stop"

function Write-InstallLog([string]$Message) {
  $line = "$(Get-Date -Format o) $Message"
  try { Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8 } catch { }
  Write-Output $Message
}

try {
  $logParent = Split-Path -Parent $LogPath
  if ($logParent) { New-Item -ItemType Directory -Path $logParent -Force | Out-Null }
  Write-InstallLog "TenderatAI installer started. Package: $PSScriptRoot"

  $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-InstallLog "Requesting administrator permission."
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -LogPath `"$LogPath`""
    $elevated = Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments -Wait -PassThru
    exit $elevated.ExitCode
  }

  $packageRoot = Split-Path -Parent $PSScriptRoot
  $installRoot = "C:\ProgramData\TenderatAI"
  $runtime = Join-Path $packageRoot "runtime"
  $taskNames = @("TenderatAI Web", "TenderatAI Worker", "TenderatAI Tunnel")

  if (-not (Test-Path -LiteralPath $runtime -PathType Container)) {
    throw "Folderi runtime nuk u gjet. Ekstraktoni të gjithë ZIP-in dhe ekzekutoni Install-TenderatAI.cmd nga folderi i nxjerrë."
  }

  New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
  Write-InstallLog "Stopping any previous TenderatAI tasks."
  foreach ($taskName in $taskNames) {
    $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existing) {
      Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds 500
      Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    }
  }

  Write-InstallLog "Copying runtime to $installRoot."
  Copy-Item -Path (Join-Path $runtime "*") -Destination $installRoot -Recurse -Force
  foreach ($utility in @("Backup-TenderatAI.ps1", "Restore-TenderatAI.ps1", "Update-TenderatAI.ps1", "Uninstall-TenderatAI.ps1", "Backup-TenderatAI.cmd", "Restore-TenderatAI.cmd")) {
    $utilityPath = Join-Path $packageRoot $utility
    if (Test-Path -LiteralPath $utilityPath) { Copy-Item -LiteralPath $utilityPath -Destination $installRoot -Force }
  }

  $node = Join-Path $installRoot "node.exe"
  $server = Join-Path $installRoot "server.js"
  $envFile = Join-Path $installRoot ".env.production"
  $tunnelScript = Join-Path $installRoot "Run-TenderatAITunnel.ps1"
  $workerCli = Join-Path $installRoot "node_modules\tsx\dist\cli.mjs"
  foreach ($required in @($node, $server, $envFile, $tunnelScript, $workerCli)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "File i nevojshëm mungon: $required" }
  }

  $cloudflared = Join-Path $installRoot "cloudflared.exe"
  if (-not (Test-Path -LiteralPath $cloudflared -PathType Leaf)) {
    Write-InstallLog "Po shkarkohet Cloudflare Tunnel."
    Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $cloudflared -UseBasicParsing
  }
  if (-not (Test-Path -LiteralPath $cloudflared -PathType Leaf)) { throw "Cloudflare Tunnel nuk u shkarkua." }

  $tasks = @(
    @{ Name = "TenderatAI Web"; Execute = $node; Arguments = "--env-file=`"$envFile`" `"$server`"" },
    @{ Name = "TenderatAI Worker"; Execute = $node; Arguments = "--env-file=`"$envFile`" `"$workerCli`" `"$installRoot\processing-worker.ts`"" },
    @{ Name = "TenderatAI Tunnel"; Execute = "powershell.exe"; Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$tunnelScript`" -CloudflaredPath `"$cloudflared`"" }
  )
  $settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
  $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
  foreach ($task in $tasks) {
    Write-InstallLog "Registering $($task.Name)."
    $action = New-ScheduledTaskAction -Execute $task.Execute -Argument $task.Arguments -WorkingDirectory $installRoot
    $trigger = New-ScheduledTaskTrigger -AtStartup
    Register-ScheduledTask -TaskName $task.Name -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
    Start-ScheduledTask -TaskName $task.Name
  }

  $localTokenLine = Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^APP_LINK_TOKEN=' } | Select-Object -First 1
  $localToken = if ($localTokenLine) { $localTokenLine.Substring('APP_LINK_TOKEN='.Length) } else { $null }
  $localUrl = if ($localToken) { "http://127.0.0.1:3012/?access=$localToken" } else { "http://127.0.0.1:3012" }
  $ready = $false
  Write-InstallLog "Waiting for the local web server."
  for ($attempt = 1; $attempt -le 30; $attempt++) {
    try {
      $response = Invoke-WebRequest -Uri $localUrl -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -eq 200) { $ready = $true; break }
    } catch { }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw "Web server-i nuk u ngrit. Kontrolloni logun: $LogPath" }

  Start-Process $localUrl
  Write-InstallLog "Tenderat AI u instalua me sukses."
  Write-Output "Tenderat AI u instalua. Faqja u hap në browser. Logu: $LogPath"
  exit 0
} catch {
  $message = if ($_.Exception) { $_.Exception.Message } else { [string]$_ }
  Write-InstallLog "INSTALL FAILED: $message"
  Write-Error $message
  Write-Output "Instalimi dështoi. Logu diagnostik: $LogPath"
  exit 1
}
