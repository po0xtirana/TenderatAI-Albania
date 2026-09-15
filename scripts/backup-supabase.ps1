param(
  [string]$Destination = "$env:USERPROFILE\OneDrive\TenderatAI\backups",
  [string]$EnvFile = (Join-Path (Split-Path -Parent $PSScriptRoot) ".env.local")
)
$ErrorActionPreference = "Stop"
$envPath = $EnvFile
if (-not (Test-Path -LiteralPath $envPath)) { throw "Skedari i konfigurimit nuk u gjet: $envPath" }
function Read-EnvValue([string]$name) {
  $line = Get-Content -LiteralPath $envPath | Where-Object { $_ -match "^$name=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return $line.Substring($name.Length + 1).Trim().Trim('"').Trim("'")
}
$url = Read-EnvValue "NEXT_PUBLIC_SUPABASE_URL"
$key = Read-EnvValue "SUPABASE_SECRET_KEY"
if (-not $key) { $key = Read-EnvValue "SUPABASE_SERVICE_ROLE_KEY" }
$workspace = Read-EnvValue "COMPANY_WORKSPACE_ID"
if (-not $workspace) { $workspace = Read-EnvValue "SUPABASE_IMPORT_USER_ID" }
if (-not $url -or -not $key -or -not $workspace) { throw "Backup-i kërkon URL, çelësin privat ekzistues dhe workspace ID." }
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$target = Join-Path $Destination $stamp
New-Item -ItemType Directory -Path $target -Force | Out-Null
$headers = @{ apikey = $key; Authorization = "Bearer $key" }
$response = Invoke-RestMethod -Uri "$url/rest/v1/workspace_state_snapshots?owner_user_id=eq.$workspace&select=state,schema_version,updated_at" -Headers $headers -Method Get
$response | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath (Join-Path $target "workspace-state.json") -Encoding UTF8
$files = [System.Collections.Generic.List[string]]::new()
$files.Add("workspace-state.json")
foreach ($bucket in @("app-bulletins", "capability-documents")) {
  $listBody = @{ prefix = $workspace; limit = 1000; offset = 0 } | ConvertTo-Json
  $objects = Invoke-RestMethod -Uri "$url/storage/v1/object/list/$bucket" -Headers $headers -Method Post -ContentType "application/json" -Body $listBody
  foreach ($object in @($objects)) {
    if (-not $object.name) { continue }
    $relative = $object.name.Substring($workspace.Length).TrimStart('/')
    $safeRelative = $relative -replace '[^a-zA-Z0-9._\\/-]', '_'
    $destination = Join-Path (Join-Path $target $bucket) $safeRelative
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    Invoke-WebRequest -Uri "$url/storage/v1/object/$bucket/$($object.name)" -Headers $headers -Method Get -OutFile $destination -UseBasicParsing
    $files.Add((Join-Path $bucket $safeRelative))
  }
}
[pscustomobject]@{ createdAt = (Get-Date).ToUniversalTime().ToString("o"); workspaceId = $workspace; files = @($files) } | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $target "manifest.json") -Encoding UTF8
Get-ChildItem -LiteralPath $Destination -Directory | Sort-Object LastWriteTime -Descending | Select-Object -Skip 4 | Remove-Item -Recurse -Force
Write-Output "Backup u krijua: $target"
