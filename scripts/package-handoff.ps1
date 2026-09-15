param(
  [string]$Output = (Join-Path (Split-Path -Parent $PSScriptRoot) "TenderatAI-Company-Ready.zip"),
  [switch]$SkipMigration
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$stage = Join-Path $env:TEMP ("TenderatAI-handoff-stage-" + [DateTime]::UtcNow.ToString("yyyyMMddHHmmssfff"))
function Read-EnvValue([string]$name) {
  $line = Get-Content -LiteralPath (Join-Path $root ".env.local") | Where-Object { $_ -match "^$name=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return $line.Substring($name.Length + 1).Trim().Trim('"').Trim("'")
}
$supabaseUrl = Read-EnvValue "NEXT_PUBLIC_SUPABASE_URL"
$anon = Read-EnvValue "NEXT_PUBLIC_SUPABASE_ANON_KEY"
$secret = Read-EnvValue "SUPABASE_SECRET_KEY"
if (-not $secret) { $secret = Read-EnvValue "SUPABASE_SERVICE_ROLE_KEY" }
$workspace = Read-EnvValue "COMPANY_WORKSPACE_ID"
if (-not $workspace) { $workspace = Read-EnvValue "SUPABASE_IMPORT_USER_ID" }
$openRouter = Read-EnvValue "OPENROUTER_API_KEY"
if (-not $supabaseUrl -or -not $anon -or -not $secret -or -not $openRouter) { throw "Paketa kërkon çelësat ekzistues Supabase/OpenRouter dhe URL-në. Asnjë çelës i ri nuk krijohet automatikisht." }
if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null
Push-Location $root
try {
  $env:NEXT_PUBLIC_SUPABASE_URL = $supabaseUrl
  $env:NEXT_PUBLIC_SUPABASE_ANON_KEY = $anon
  $env:SUPABASE_SECRET_KEY = $secret
  $env:SUPABASE_SERVICE_ROLE_KEY = $secret
  $env:OPENROUTER_API_KEY = $openRouter
  if (-not $workspace) {
    $provisioned = npm run provision:workspace --silent | ConvertFrom-Json
    $workspace = $provisioned.workspaceId
    if (-not $workspace) { throw "Workspace ID nuk u krijua." }
  }
  $env:COMPANY_WORKSPACE_ID = $workspace
  $env:SUPABASE_IMPORT_USER_ID = $workspace
  if (-not $SkipMigration) {
    npm run migrate:supabase
    if ($LASTEXITCODE -ne 0) { throw "Importimi i Supabase dështoi." }
  }
  $env:NEXT_PUBLIC_PASSWORDLESS_MODE = "1"
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Build-i dështoi." }
  $runtime = Join-Path $stage "runtime"
  New-Item -ItemType Directory -Path $runtime | Out-Null
  $standalone = Join-Path $root ".next-build\standalone"
  Get-ChildItem -LiteralPath $standalone -File -Force | Copy-Item -Destination $runtime -Force
  $runtimeNext = Join-Path $runtime ".next-build"
  New-Item -ItemType Directory -Path $runtimeNext -Force | Out-Null
  $buildOutput = Join-Path $root ".next-build"
  Get-ChildItem -LiteralPath $buildOutput -File -Force | Copy-Item -Destination $runtimeNext -Force
  Copy-Item -LiteralPath (Join-Path $buildOutput "server") -Destination $runtimeNext -Recurse -Force
  New-Item -ItemType Directory -Path (Join-Path $runtimeNext "static") -Force | Out-Null
  Copy-Item -Path (Join-Path $buildOutput "static\*") -Destination (Join-Path $runtimeNext "static") -Recurse -Force
  if (Test-Path -LiteralPath (Join-Path $root "public")) { Copy-Item -LiteralPath (Join-Path $root "public") -Destination $runtime -Recurse -Force }
  Copy-Item -LiteralPath (Join-Path $root "lib") -Destination $runtime -Recurse -Force
  Copy-Item -LiteralPath (Join-Path $root "tsconfig.json") -Destination $runtime -Force
  Copy-Item -LiteralPath (Join-Path $root "scripts\processing-worker.ts") -Destination (Join-Path $runtime "processing-worker.ts") -Force
  Copy-Item -LiteralPath (Join-Path $root "package.json") -Destination (Join-Path $runtime "package.json") -Force
  Copy-Item -LiteralPath (Join-Path $root "package-lock.json") -Destination (Join-Path $runtime "package-lock.json") -Force
  Push-Location $runtime
  try {
    npm ci --omit=dev --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw "Varësitë e prodhimit nuk u instaluan në paketë." }
  } finally { Pop-Location }
  $node = (Get-Command node -ErrorAction Stop).Source
  Copy-Item -LiteralPath $node -Destination (Join-Path $runtime "node.exe") -Force
  $cloudflared = Join-Path $runtime "cloudflared.exe"
  if (-not (Test-Path -LiteralPath $cloudflared)) {
    $existingTunnel = Get-ChildItem -LiteralPath $root -Directory -Filter ".handoff-stage-*" -Force | Sort-Object LastWriteTime -Descending | ForEach-Object { Join-Path $_.FullName "runtime\cloudflared.exe" } | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if ($existingTunnel) {
      Copy-Item -LiteralPath $existingTunnel -Destination $cloudflared -Force
    } else {
      Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $cloudflared -UseBasicParsing
    }
  }
  $linkToken = Read-EnvValue "APP_LINK_TOKEN"
  if (-not $linkToken) {
    $bytes = New-Object byte[] 24
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $linkToken = ([BitConverter]::ToString($bytes) -replace '-', '').ToLowerInvariant()
  }
  @"
DATA_BACKEND=supabase
PASSWORDLESS_MODE=1
NEXT_PUBLIC_PASSWORDLESS_MODE=1
PORT=3012
HOSTNAME=127.0.0.1
NEXT_PUBLIC_SUPABASE_URL=$supabaseUrl
NEXT_PUBLIC_SUPABASE_ANON_KEY=$anon
SUPABASE_SECRET_KEY=$secret
SUPABASE_SERVICE_ROLE_KEY=$secret
COMPANY_WORKSPACE_ID=$workspace
SUPABASE_IMPORT_USER_ID=$workspace
OPENROUTER_API_KEY=$openRouter
OPENROUTER_MODEL=$(Read-EnvValue "OPENROUTER_MODEL")
OPENROUTER_SITE_URL=$(Read-EnvValue "OPENROUTER_SITE_URL")
OPENROUTER_SITE_NAME=$(Read-EnvValue "OPENROUTER_SITE_NAME")
APP_LINK_TOKEN=$linkToken
WORKER_POLL_MS=10000
MAX_UPLOAD_MB=50
"@ | Set-Content -LiteralPath (Join-Path $runtime ".env.production") -Encoding UTF8
  Copy-Item -LiteralPath (Join-Path $root "scripts\Install-TenderatAI.ps1") -Destination $stage -Force
  Copy-Item -LiteralPath (Join-Path $root "scripts\Install-TenderatAI.cmd") -Destination $stage -Force
  Copy-Item -LiteralPath (Join-Path $root "scripts\backup-supabase.ps1") -Destination (Join-Path $stage "Backup-TenderatAI.ps1") -Force
  Copy-Item -LiteralPath (Join-Path $root "scripts\restore-supabase.ps1") -Destination (Join-Path $stage "Restore-TenderatAI.ps1") -Force
  Copy-Item -LiteralPath (Join-Path $root "scripts\Update-TenderatAI.ps1") -Destination $stage -Force
  Copy-Item -LiteralPath (Join-Path $root "scripts\Uninstall-TenderatAI.ps1") -Destination $stage -Force
  Copy-Item -LiteralPath (Join-Path $root "scripts\Backup-TenderatAI.cmd") -Destination $stage -Force
  Copy-Item -LiteralPath (Join-Path $root "scripts\Restore-TenderatAI.cmd") -Destination $stage -Force
  Copy-Item -LiteralPath (Join-Path $root "scripts\Run-TenderatAITunnel.ps1") -Destination (Join-Path $runtime "Run-TenderatAITunnel.ps1") -Force
  Copy-Item -LiteralPath (Join-Path $root "HANDOFF-ALBANIAN.md") -Destination $stage -Force
  if (Test-Path -LiteralPath $Output) { Remove-Item -LiteralPath $Output -Force }
  $tar = Get-Command tar.exe -ErrorAction SilentlyContinue
  if ($tar) {
    & $tar.Source -a -c -f $Output -C $stage .
    if ($LASTEXITCODE -ne 0) { throw "Kompresimi i ZIP-it dështoi." }
  } else {
    Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $Output -CompressionLevel Optimal
  }
  Write-Output "Paketa u krijua: $Output"
  try { Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction Stop } catch { Write-Warning "Staging folder nuk u fshi automatikisht: $stage" }
} finally { Pop-Location }
