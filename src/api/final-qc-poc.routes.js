import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db } from '../db/sqlite.js';
import { config } from '../config.js';

const router = Router();
let schemaReady = false;
const htmlPath = fileURLToPath(new URL('../../public/final-qc-admin-poc.html', import.meta.url));

function isLoopback(address = '') {
  const value = address.toLowerCase().replace(/^::ffff:/, '');
  return value === '::1' || value === 'localhost' || value.startsWith('127.');
}

function ensureSchema() {
  if (schemaReady) return;

  db.exec([
    "CREATE TABLE IF NOT EXISTS final_qc_poc_assets (",
    "  asset_id TEXT PRIMARY KEY, qr_payload TEXT NOT NULL UNIQUE,",
    "  material_code TEXT NOT NULL, material_name TEXT NOT NULL, serial_number TEXT NOT NULL,",
    "  grn_status TEXT NOT NULL, qc_status TEXT NOT NULL, stores_status TEXT NOT NULL,",
    "  requires_final_qc INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL",
    ");",
    "CREATE TABLE IF NOT EXISTS final_qc_poc_runs (",
    "  run_id TEXT PRIMARY KEY, asset_id TEXT NOT NULL, mode TEXT NOT NULL, profile TEXT NOT NULL,",
    "  status TEXT NOT NULL, summary_json TEXT NOT NULL, created_at TEXT NOT NULL, completed_at TEXT NOT NULL,",
    "  FOREIGN KEY(asset_id) REFERENCES final_qc_poc_assets(asset_id)",
    ");",
    "CREATE INDEX IF NOT EXISTS idx_final_qc_poc_runs_asset_date",
    "  ON final_qc_poc_runs(asset_id, created_at DESC);",
    "CREATE TABLE IF NOT EXISTS final_qc_poc_channels (",
    "  run_id TEXT NOT NULL, channel_no INTEGER NOT NULL, channel_label TEXT NOT NULL,",
    "  bin_no INTEGER NOT NULL, slot_no INTEGER NOT NULL, status TEXT NOT NULL,",
    "  failure_code TEXT, failure_reason TEXT, expected_input INTEGER NOT NULL,",
    "  detected_inputs_json TEXT NOT NULL, brightness_delta REAL, brightness_threshold REAL NOT NULL,",
    "  PRIMARY KEY(run_id, channel_no),",
    "  FOREIGN KEY(run_id) REFERENCES final_qc_poc_runs(run_id) ON DELETE CASCADE",
    ");",
    "CREATE TABLE IF NOT EXISTS final_qc_poc_audit (",
    "  audit_id TEXT PRIMARY KEY, asset_id TEXT NOT NULL, action TEXT NOT NULL,",
    "  previous_value INTEGER, new_value INTEGER NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL",
    ");"
  ].join('\n'));

  const now = new Date().toISOString();
  const insertAsset = db.prepare(
    "INSERT OR IGNORE INTO final_qc_poc_assets " +
    "(asset_id, qr_payload, material_code, material_name, serial_number, grn_status, qc_status, stores_status, requires_final_qc, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );

  insertAsset.run(
    'ACS-HUB-00125', 'BEEFLOW-ASSET:ACS-HUB-00125', 'ACS-HUB', 'ACS Hub-Board',
    'ACS-HB-2026-00125', 'COMPLETED', 'PASSED', 'RECEIVED', 1, now, now
  );
  insertAsset.run(
    'MAT-DEMO-0042', 'BEEFLOW-ASSET:MAT-DEMO-0042', 'MAT-GENERIC', 'Industrial Connector Set',
    'CONN-DEMO-0042', 'COMPLETED', 'PASSED', 'RECEIVED', 0, now, now
  );

  schemaReady = true;
}

function decodeAsset(row) {
  if (!row) return null;
  return {
    assetId: row.asset_id,
    qrPayload: row.qr_payload,
    materialCode: row.material_code,
    materialName: row.material_name,
    serialNumber: row.serial_number,
    grnStatus: row.grn_status,
    qcStatus: row.qc_status,
    storesStatus: row.stores_status,
    requiresFinalQC: Boolean(row.requires_final_qc),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    latestRunId: row.latest_run_id || null,
    latestStatus: row.latest_status || 'NOT_TESTED',
    latestSummary: row.latest_summary_json ? JSON.parse(row.latest_summary_json) : null,
    latestRunAt: row.latest_run_at || null
  };
}

const assetSelect = [
  "SELECT a.*, r.run_id AS latest_run_id, r.status AS latest_status,",
  "r.summary_json AS latest_summary_json, r.completed_at AS latest_run_at",
  "FROM final_qc_poc_assets a",
  "LEFT JOIN final_qc_poc_runs r ON r.run_id = (",
  "  SELECT rr.run_id FROM final_qc_poc_runs rr WHERE rr.asset_id = a.asset_id",
  "  ORDER BY rr.created_at DESC LIMIT 1",
  ")"
].join(' ');

function getAsset(assetId) {
  const row = db.prepare(assetSelect + " WHERE a.asset_id = ?").get(assetId);
  return decodeAsset(row);
}

function createChannel(runId, channelNo, profile) {
  const binNo = Math.ceil(channelNo / 6);
  const slotNo = ((channelNo - 1) % 6) + 1;
  const channelLabel = 'B' + binNo + 'S' + slotNo;
  const completedChannels = profile === 'incomplete' ? 73 : 120;

  if (channelNo > completedChannels) {
    return {
      runId, channelNo, channelLabel, binNo, slotNo, status: 'NOT_TESTED',
      failureCode: null, failureReason: null, expectedInput: channelNo,
      detectedInputs: [], brightnessDelta: null, brightnessThreshold: 25
    };
  }

  let status = 'PASS';
  let failureCode = null;
  let failureReason = null;
  let detectedInputs = [channelNo];
  let brightnessDelta = 36 + (channelNo % 17);

  if (profile === 'mixed' && channelNo === 17) {
    status = 'FAIL';
    failureCode = 'MISSING_EXPECTED_INPUT';
    failureReason = 'Expected electrical input 17 was not detected.';
    detectedInputs = [];
  } else if (profile === 'mixed' && channelNo === 42) {
    status = 'FAIL';
    failureCode = 'UNEXPECTED_EXTRA_INPUT';
    failureReason = 'Expected input 42 was detected together with unexpected input 43.';
    detectedInputs = [42, 43];
  } else if (profile === 'mixed' && channelNo === 103) {
    status = 'FAIL';
    failureCode = 'LOW_LED_BRIGHTNESS';
    failureReason = 'Optical brightness increase was below the configured threshold.';
    brightnessDelta = 14.6;
  } else if (profile === 'incomplete' && channelNo === 17) {
    status = 'FAIL';
    failureCode = 'MISSING_EXPECTED_INPUT';
    failureReason = 'Expected electrical input 17 was not detected before the demo run was interrupted.';
    detectedInputs = [];
  }

  return {
    runId, channelNo, channelLabel, binNo, slotNo, status, failureCode, failureReason,
    expectedInput: channelNo, detectedInputs, brightnessDelta, brightnessThreshold: 25
  };
}

function getRun(runId) {
  const run = db.prepare(
    "SELECT run_id, asset_id, mode, profile, status, summary_json, created_at, completed_at " +
    "FROM final_qc_poc_runs WHERE run_id = ?"
  ).get(runId);

  if (!run) return null;
  const channels = db.prepare(
    "SELECT channel_no, channel_label, bin_no, slot_no, status, failure_code, failure_reason, " +
    "expected_input, detected_inputs_json, brightness_delta, brightness_threshold " +
    "FROM final_qc_poc_channels WHERE run_id = ? ORDER BY channel_no"
  ).all(runId).map((row) => ({
    channelNo: row.channel_no,
    channelLabel: row.channel_label,
    binNo: row.bin_no,
    slotNo: row.slot_no,
    status: row.status,
    failureCode: row.failure_code,
    failureReason: row.failure_reason,
    expectedInput: row.expected_input,
    detectedInputs: JSON.parse(row.detected_inputs_json),
    brightnessDelta: row.brightness_delta,
    brightnessThreshold: row.brightness_threshold
  }));

  return {
    runId: run.run_id,
    assetId: run.asset_id,
    mode: run.mode,
    profile: run.profile,
    status: run.status,
    summary: JSON.parse(run.summary_json),
    createdAt: run.created_at,
    completedAt: run.completed_at,
    channels
  };
}

router.use((req, res, next) => {
  if (config.nodeEnv === 'production') {
    return res.status(404).json({ ok: false, message: 'Final QC POC is disabled in production.' });
  }

  const allowLan = (process.env.FINAL_QC_POC_ALLOW_LAN || 'false').toLowerCase() === 'true';
  if (!allowLan && !isLoopback(req.socket.remoteAddress)) {
    return res.status(403).json({
      ok: false,
      message: 'Final QC POC is local-only by default. Enable LAN access explicitly on an isolated dev network.'
    });
  }

  try {
    ensureSchema();
    next();
  } catch (error) {
    next(error);
  }
});

router.get('/', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(htmlPath);
});

router.get('/api/assets', (_req, res) => {
  const assets = db.prepare(assetSelect + " ORDER BY a.material_name").all().map(decodeAsset);
  res.json({ ok: true, mode: 'SIMULATION', data: assets });
});

router.get('/api/assets/:assetId', (req, res) => {
  const asset = getAsset(req.params.assetId);
  if (!asset) return res.status(404).json({ ok: false, message: 'Board/material was not found.' });
  res.json({ ok: true, mode: 'SIMULATION', data: asset });
});

router.patch('/api/assets/:assetId/require-final-qc', (req, res) => {
  const { requireFinalQC } = req.body || {};
  if (typeof requireFinalQC !== 'boolean') {
    return res.status(400).json({ ok: false, message: 'requireFinalQC must be true or false.' });
  }

  const asset = getAsset(req.params.assetId);
  if (!asset) return res.status(404).json({ ok: false, message: 'Board/material was not found.' });

  const now = new Date().toISOString();
  const update = db.transaction(() => {
    db.prepare(
      "UPDATE final_qc_poc_assets SET requires_final_qc = ?, updated_at = ? WHERE asset_id = ?"
    ).run(requireFinalQC ? 1 : 0, now, req.params.assetId);
    db.prepare(
      "INSERT INTO final_qc_poc_audit (audit_id, asset_id, action, previous_value, new_value, actor, created_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(
      randomUUID(), req.params.assetId, 'REQUIRES_FINAL_QC_CHANGED',
      asset.requiresFinalQC ? 1 : 0, requireFinalQC ? 1 : 0,
      String((req.body && req.body.actor) || 'Development POC Admin').slice(0, 100), now
    );
  });
  update();

  res.json({ ok: true, mode: 'SIMULATION', data: getAsset(req.params.assetId), message: 'Final QC requirement saved.' });
});

router.get('/api/assets/:assetId/runs', (req, res) => {
  const asset = getAsset(req.params.assetId);
  if (!asset) return res.status(404).json({ ok: false, message: 'Board/material was not found.' });

  const runs = db.prepare(
    "SELECT run_id, asset_id, mode, profile, status, summary_json, created_at, completed_at " +
    "FROM final_qc_poc_runs WHERE asset_id = ? ORDER BY created_at DESC LIMIT 50"
  ).all(req.params.assetId).map((row) => ({
    runId: row.run_id,
    assetId: row.asset_id,
    mode: row.mode,
    profile: row.profile,
    status: row.status,
    summary: JSON.parse(row.summary_json),
    createdAt: row.created_at,
    completedAt: row.completed_at
  }));

  res.json({ ok: true, mode: 'SIMULATION', data: runs });
});

router.get('/api/runs/:runId', (req, res) => {
  const run = getRun(req.params.runId);
  if (!run) return res.status(404).json({ ok: false, message: 'Test run was not found.' });
  res.json({ ok: true, mode: 'SIMULATION', data: run });
});

router.post('/api/runs', (req, res) => {
  const body = req.body || {};
  const assetId = typeof body.assetId === 'string' ? body.assetId : '';
  const profile = ['mixed', 'all-pass', 'incomplete'].includes(body.profile) ? body.profile : 'mixed';
  const asset = getAsset(assetId);

  if (!asset) return res.status(404).json({ ok: false, message: 'Scan or select a registered demo board first.' });
  if (!asset.requiresFinalQC) {
    return res.status(409).json({
      ok: false,
      code: 'FINAL_QC_NOT_REQUIRED',
      message: 'Requires Final QC is disabled for this material; the existing workflow should continue without an additional Final QC run.'
    });
  }
  if (asset.grnStatus !== 'COMPLETED' || asset.qcStatus !== 'PASSED' || asset.storesStatus !== 'RECEIVED') {
    return res.status(409).json({ ok: false, code: 'PREREQUISITES_NOT_MET', message: 'GRN, existing QC and Stores prerequisites are not complete.' });
  }

  const runId = 'FQC-' + new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + '-' + randomUUID().slice(0, 6).toUpperCase();
  const createdAt = new Date().toISOString();
  const channels = Array.from({ length: 120 }, (_unused, index) => createChannel(runId, index + 1, profile));
  const passed = channels.filter((channel) => channel.status === 'PASS').length;
  const failed = channels.filter((channel) => channel.status === 'FAIL').length;
  const notTested = channels.filter((channel) => channel.status === 'NOT_TESTED').length;
  const tested = channels.length - notTested;
  const status = profile === 'incomplete' ? 'INCOMPLETE' : (failed > 0 ? 'FAILED' : 'PASSED');
  const summary = {
    mode: 'SIMULATION',
    totalChannels: 120,
    testedChannels: tested,
    passedChannels: passed,
    failedChannels: failed,
    notTestedChannels: notTested,
    completionPercent: Math.round((tested / 120) * 1000) / 10,
    failureBreakdown: channels.filter((channel) => channel.status === 'FAIL').reduce((result, channel) => {
      result[channel.failureCode] = (result[channel.failureCode] || 0) + 1;
      return result;
    }, {}),
    finalSafetyCheck: 'NOT_PERFORMED_IN_SIMULATION',
    note: 'Simulated demonstration result only. No Arduino controller or camera was operated.'
  };

  const saveRun = db.transaction(() => {
    db.prepare(
      "INSERT INTO final_qc_poc_runs (run_id, asset_id, mode, profile, status, summary_json, created_at, completed_at) " +
      "VALUES (?, ?, 'SIMULATION', ?, ?, ?, ?, ?)"
    ).run(runId, assetId, profile, status, JSON.stringify(summary), createdAt, createdAt);

    const insertChannel = db.prepare(
      "INSERT INTO final_qc_poc_channels " +
      "(run_id, channel_no, channel_label, bin_no, slot_no, status, failure_code, failure_reason, expected_input, detected_inputs_json, brightness_delta, brightness_threshold) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    for (const channel of channels) {
      insertChannel.run(
        runId, channel.channelNo, channel.channelLabel, channel.binNo, channel.slotNo,
        channel.status, channel.failureCode, channel.failureReason, channel.expectedInput,
        JSON.stringify(channel.detectedInputs), channel.brightnessDelta, channel.brightnessThreshold
      );
    }
  });

  try {
    saveRun();
  } catch (error) {
    if (error && error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      return res.status(409).json({ ok: false, message: 'Board/material was changed while the run was being created.' });
    }
    return res.status(500).json({ ok: false, message: 'Could not save the demo run.' });
  }

  const fullRun = getRun(runId);
  res.status(201).json({
    ok: true,
    mode: 'SIMULATION',
    message: 'Demo run completed. This is not a physical hardware test.',
    data: fullRun
  });
});

router.get('/api/audit/:assetId', (req, res) => {
  const asset = getAsset(req.params.assetId);
  if (!asset) return res.status(404).json({ ok: false, message: 'Board/material was not found.' });
  const rows = db.prepare(
    "SELECT audit_id, action, previous_value, new_value, actor, created_at " +
    "FROM final_qc_poc_audit WHERE asset_id = ? ORDER BY created_at DESC LIMIT 50"
  ).all(req.params.assetId);
  res.json({ ok: true, mode: 'SIMULATION', data: rows });
});

export default router;
