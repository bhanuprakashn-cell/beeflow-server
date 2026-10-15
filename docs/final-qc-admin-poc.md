# Final QC Admin POC (Development Only)

This is a **development-only proof of concept** for BeeFlow's proposed QR-based Final QC (Main Office QC) workflow.

## Git branch

- Feature branch: `dev/final-qc-admin-poc`
- Base: `main`, because this connected repository did not contain a `dev` branch when inspected.
- No changes were pushed to `main`.
- This repository currently exposes the backend POC; it is not the full BeeFlow ERP web/mobile frontend. The added HTML is an isolated admin demonstration served by this backend.

## Open the page

1. Check out `dev/final-qc-admin-poc`.
2. Use the existing project's Node.js version and install dependencies with `npm install`.
3. Configure the server using its **development-only** environment setup. The existing server requires `FIREBASE_PROJECT_ID` and `FIREBASE_COLLECTION_PREFIX`; the prefix must start with `poc_`. Use the project's existing non-production Firebase credentials and make sure the production project ID is included in `PRODUCTION_FIREBASE_PROJECT_IDS`.
4. Start using the repository's normal development command: `npm run dev`.
5. Open `http://localhost:8080/admin/final-qc-poc` (or use the configured local port).

The server entry point validates Firebase isolation before listening, so do not use production Firebase credentials or project IDs for this POC.

## Safety boundary

- The route returns 404 in `NODE_ENV=production`.
- It is loopback-only by default. Requests from another machine are rejected unless `FINAL_QC_POC_ALLOW_LAN=true` is explicitly enabled. Only use that override on an isolated development network.
- The page and endpoints use isolated SQLite tables with the `final_qc_poc_` prefix.
- Seeded assets and all reports are demonstration records, not BeeFlow production material data.
- All run records are marked `SIMULATION`; no Arduino, serial port or camera is controlled.
- The simulated results must never be used as genuine QA evidence or as a production inventory-release decision.
- This POC has no production authentication/authorization integration yet; keep its default local-only access boundary.

## What is included

- Admin-style Final QC page matching a navy/white BeeFlow style.
- Two seeded demo assets: ACS Hub-Board (Final QC enabled by default) and a generic connector material (Final QC disabled by default).
- A camera QR scanner where `BarcodeDetector` is available, plus manual Asset ID / QR payload lookup.
- A persisted Requires Final QC toggle and local audit trail.
- Eligibility checks for the demo GRN → existing QC → Stores flow.
- Three deterministic scenarios: mixed results with illustrative failures, all channels passing in simulation, and an interrupted/incomplete run.
- A 120-channel illustrative map, channel-level failure detail, run history and JSON/CSV downloads.
- Local SQLite persistence so refreshing the page does not erase the demo's run history.

## Demo scenarios

- **Mixed result:** simulates a missing input at channel 17, an extra input at channel 42, and low brightness at channel 103.
- **All pass:** simulates all 120 channel records passing. This is not a real pass.
- **Incomplete:** simulates stopping after 73 channels and must remain INCOMPLETE.

The generated values are deterministic UI fixtures, not measurements from the supplied ACS jig.

## API endpoints

All paths are under `/admin/final-qc-poc` and are local-only in the default development configuration.

- `GET /` — admin POC page
- `GET /api/assets` — seeded local POC assets
- `GET /api/assets/:assetId` — one demo asset
- `PATCH /api/assets/:assetId/require-final-qc` — save simulated requirement setting and audit
- `GET /api/assets/:assetId/runs` — run history
- `GET /api/runs/:runId` — saved run plus channel detail
- `POST /api/runs` — create and persist a simulation run
- `GET /api/audit/:assetId` — requirement change audit

## Known limits / next implementation step

This is a demo in the connected Node backend repository, not a completed integration with the actual BeeFlow Admin frontend or its existing QC form. The current ERP frontend repository was not available among the connected repositories during this task.

Before production use, integrate the saved material setting into the real material master and QC Parameters form; link the requirement snapshot to the actual GRN, QC, Stores, DM-code/serial and inventory records; add BeeFlow authentication and role permissions; implement the real Edge Agent and hardware job protocol; support real QR registration/decoding; securely upload the actual Python engine's JSON/CSV/images; and validate the workflow on a physical test station. Never allow simulation results to change production inventory or release status.
