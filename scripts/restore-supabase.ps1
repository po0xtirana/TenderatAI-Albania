param(
  [Parameter(Mandatory = $true)][string]$BackupDirectory,
  [string]$EnvFile = (Join-Path (Split-Path -Parent $PSScriptRoot) ".env.local")
)
$ErrorActionPreference = "Stop"
$envPath = $EnvFile
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
$statePath = Join-Path $BackupDirectory "workspace-state.json"
if (-not $url -or -not $key -or -not $workspace -or -not (Test-Path -LiteralPath $statePath)) { throw "Restore-i kërkon URL, çelësin privat, workspace ID dhe workspace-state.json." }
$headers = @{ apikey = $key; Authorization = "Bearer $key"; "Content-Type" = "application/json"; Prefer = "resolution=merge-duplicates,return=minimal" }
$snapshot = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json | Select-Object -First 1
if (-not $snapshot.state) { throw "Backup-i nuk përmban një state të vlefshëm." }
$body = @{ owner_user_id = $workspace; schema_version = [int]($snapshot.schema_version ?? 1); state = $snapshot.state } | ConvertTo-Json -Depth 100
Invoke-RestMethod -Uri "$url/rest/v1/workspace_state_snapshots?on_conflict=owner_user_id" -Headers $headers -Method Post -Body $body | Out-Null
Write-Output "Snapshot-i u rikthye. Rinisni aplikacionin për të lexuar gjendjen e rikthyer."
