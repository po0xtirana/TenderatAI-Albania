param([Parameter(Mandatory = $true)][string]$CloudflaredPath)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$envFile = Join-Path $root ".env.production"
$log = Join-Path $root "tunnel.log"
$linkFile = Join-Path $root "company-link.txt"
$token = (Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^APP_LINK_TOKEN=' } | Select-Object -First 1) -replace '^APP_LINK_TOKEN=', ''
if (-not $token) { throw "APP_LINK_TOKEN mungon." }
& $CloudflaredPath tunnel --url http://127.0.0.1:3012 --no-autoupdate 2>&1 | ForEach-Object {
  $line = $_.ToString()
  Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) $line"
  if ($line -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
    "$($matches[0])/?access=$token" | Set-Content -LiteralPath $linkFile -Encoding UTF8
  }
}
