$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Update-EnvValue {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string]$Key,
    [Parameter(Mandatory = $true)][string]$Value
  )
  $lines = Get-Content $FilePath -ErrorAction SilentlyContinue
  if (-not $lines) { $lines = @() }
  $found = $false
  $updated = foreach ($line in $lines) {
    if ($line -match "^$Key=") {
      $found = $true
      "$Key=$Value"
    } else {
      $line
    }
  }
  if (-not $found) {
    $updated += "$Key=$Value"
  }
  Set-Content -Path $FilePath -Value $updated
}

Write-Host "== BeeProdeXa POC FULL AUTO (Windows) ==" -ForegroundColor Cyan
Write-Host "Project: $Root"

# Start backend in current window
Write-Host "Starting backend..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit","-ExecutionPolicy","Bypass","-File","$Root\scripts\start-windows.ps1"

Start-Sleep -Seconds 2

# Start ngrok in separate window (optional public mode)
Write-Host "Starting ngrok tunnel..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit","-Command","ngrok http 8080"

Start-Sleep -Seconds 4

try {
  $tunnels = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -Method Get -ErrorAction Stop
  $public = $tunnels.tunnels | Where-Object { $_.public_url -like "https://*" } | Select-Object -First 1
  if ($public -and $public.public_url) {
    Update-EnvValue -FilePath "$Root\.env" -Key "NGROK_PUBLIC_URL" -Value $public.public_url
    Write-Host ("NGROK_PUBLIC_URL updated in .env: {0}" -f $public.public_url) -ForegroundColor Green
  } else {
    Write-Host "Ngrok started, but public URL not found yet." -ForegroundColor Yellow
  }
} catch {
  Write-Host "Could not read ngrok API on 127.0.0.1:4040. Check ngrok installation/login." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done. Windows backend + ngrok started." -ForegroundColor Cyan
Write-Host "Use LAN for primary testing: http://192.168.0.179:8080" -ForegroundColor Cyan

