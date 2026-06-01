# BeeProdeXa POC - Windows Primary LAN Setup

This POC is now designed to run with **Windows as the main backend server** on your router LAN.

Architecture:

App (Mac/Mobile) -> `http://192.168.0.179:8080` -> Windows Backend -> SQLite Queue -> Firebase Sync Worker

## 1) Windows server config (`C:\beeprodexa-poc\.env`)

Set these values:

```env
HOST=0.0.0.0
PORT=8080
DB_PATH=./data/poc.db
NODE_ENV=development
SYNC_INTERVAL_MS=5000
MAX_RETRY=8
SYNC_BATCH_SIZE=20
AUTO_RECOVER_FAILED=true
FAILED_RECOVER_COOLDOWN_SEC=300
SERVER_INSTANCE_ID=windows-primary

FIREBASE_PROJECT_ID=beeprodexa-poc-personal
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="..."
FIREBASE_COLLECTION_PREFIX=poc_
PRODUCTION_FIREBASE_PROJECT_IDS=YOUR_REAL_PROD_PROJECT_ID

NGROK_PUBLIC_URL=
```

## 2) Start backend on Windows

```powershell
cd C:\beeprodexa-poc
npm run start:win
```

Full automation (backend + ngrok + auto update `NGROK_PUBLIC_URL` in `.env`):

```powershell
cd C:\beeprodexa-poc
npm run start:win:full
```

The script checks if port `8080` is already occupied and stops with clear message if needed.

## 3) Firewall (one-time)

```powershell
netsh advfirewall firewall add rule name="BeeProdeXa POC 8080" dir=in action=allow protocol=TCP localport=8080
```

## 4) Verify APIs

On Windows:

```powershell
curl http://localhost:8080/health
curl http://localhost:8080/sync/status
curl http://localhost:8080/network/preferred
```

On Mac:

```bash
curl http://192.168.0.179:8080/health
curl http://192.168.0.179:8080/sync/status
```

## 5) Flutter app run (LAN primary)

```bash
flutter run --dart-define=BACKEND_BASE_URL=http://192.168.0.179:8080
```

## 6) Offline-first behavior

- App writes to Windows backend first.
- Backend writes to SQLite + queue first.
- Sync worker pushes to Firebase asynchronously.
- If WAN/internet is down but LAN is alive:
  - App still reaches backend via LAN IP
  - Data still stores in SQLite/queue
  - Firebase sync retries later automatically

Queue lifecycle:

`pending -> processing -> retry -> synced`

Failed auto-recovery automation:

- Worker automatically moves non-test `failed` jobs back to `retry` after cooldown.
- This helps recover from temporary internet/cloud outages without manual SQL commands.
- Manual recovery endpoint is also available:

```powershell
curl -X POST http://localhost:8080/sync/recover-failed
```

Enterprise sync envelope (auto-added by backend):

- operation_id
- entity_id
- operation_type
- operation_timestamp_utc
- source_mode
- server_instance_id
- revision
- idempotency_key
- operation_hash

These fields are used for replay safety, conflict-safe sync, and duplicate prevention.

## 7) Important note

If Windows loses all network or devices are not on reachable LAN, clients cannot connect to Windows server until network returns.
