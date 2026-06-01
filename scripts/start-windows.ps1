$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "== BeeProdeXa POC backend (Windows) ==" -ForegroundColor Cyan
Write-Host "Project: $Root"

if (!(Test-Path ".env")) {
  Write-Host "ERROR: .env file not found in $Root" -ForegroundColor Red
  exit 1
}

if (!(Test-Path "node_modules")) {
  Write-Host "Installing dependencies..." -ForegroundColor Yellow
  npm install
}

Write-Host "Checking port 8080..." -ForegroundColor Yellow
$portInUse = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue
if ($portInUse) {
  $pids = $portInUse | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($pid in $pids) {
    try {
      $proc = Get-Process -Id $pid -ErrorAction Stop
      Write-Host ("Port 8080 is used by PID {0} ({1}) -> stopping..." -f $pid, $proc.ProcessName) -ForegroundColor Yellow
      Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    } catch {
      Write-Host ("Port 8080 is used by PID {0} -> stopping..." -f $pid) -ForegroundColor Yellow
      Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    }
  }
  Start-Sleep -Milliseconds 400
}

Write-Host "Ensuring Windows firewall allows TCP 8080..." -ForegroundColor Yellow
try {
  $existingRule = Get-NetFirewallRule -DisplayName "BeeProdeXa POC 8080" -ErrorAction SilentlyContinue
  if (-not $existingRule) {
    netsh advfirewall firewall add rule name="BeeProdeXa POC 8080" dir=in action=allow protocol=TCP localport=8080 | Out-Null
  }
} catch {
  Write-Host "Firewall rule could not be set automatically (run as Administrator once if needed)." -ForegroundColor DarkYellow
}

Write-Host "Rebuilding better-sqlite3 for this machine..." -ForegroundColor Yellow
npm rebuild better-sqlite3 | Out-Null

Write-Host "Detecting LAN IPv4 addresses..." -ForegroundColor Yellow
$ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -match '^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)' -and $_.IPAddress -ne "127.0.0.1" } |
  Select-Object -ExpandProperty IPAddress -Unique
if ($ips) {
  foreach ($ip in $ips) {
    Write-Host ("LAN URL: http://{0}:8080" -f $ip) -ForegroundColor Green
  }
}

Write-Host "Starting server..." -ForegroundColor Green
Write-Host "Health: http://localhost:8080/health"
Write-Host "Sync:   http://localhost:8080/sync/status"
Write-Host "Route:  http://localhost:8080/network/preferred"
Write-Host ""

node src/index.js
