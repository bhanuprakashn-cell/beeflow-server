import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let server;
let baseUrl;
let tempDir;
let dbInstance;

before(async () => {
  process.env.NODE_ENV = 'test';
  tempDir = mkdtempSync(path.join(tmpdir(), 'beeflow-final-qc-poc-'));
  process.env.DB_PATH = path.join(tempDir, 'poc.db');

  // Dynamic imports ensure the isolated test DB is configured before SQLite
  // and the route initialize. Keep the connection for deterministic cleanup.
  const { db } = await import('../src/db/sqlite.js');
  dbInstance = db;
  const { default: finalQcPocRoutes } = await import('../src/api/final-qc-poc.routes.js');
  const app = express();
  app.use(express.json());
  app.use('/admin/final-qc-poc', finalQcPocRoutes);

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = 'http://127.0.0.1:' + server.address().port + '/admin/final-qc-poc';
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (dbInstance && dbInstance.open) dbInstance.close();
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
});

async function request(pathname, { method = 'GET', body } = {}) {
  const response = await fetch(baseUrl + pathname, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, json: await response.json() };
}

test('seeds target material with Final QC enabled and unrelated material disabled', async () => {
  const response = await request('/api/assets');
  assert.equal(response.status, 200);
  assert.equal(response.json.mode, 'SIMULATION');
  const target = response.json.data.find((asset) => asset.assetId === 'ACS-HUB-00125');
  const generic = response.json.data.find((asset) => asset.assetId === 'MAT-DEMO-0042');
  assert.ok(target);
  assert.ok(generic);
  assert.equal(target.requiresFinalQC, true);
  assert.equal(generic.requiresFinalQC, false);
});

test('mixed simulation persists 120 channels and three named failure types', async () => {
  const response = await request('/api/runs', {
    method: 'POST',
    body: { assetId: 'ACS-HUB-00125', profile: 'mixed' }
  });
  assert.equal(response.status, 201);
  const run = response.json.data;
  assert.equal(run.mode, 'SIMULATION');
  assert.equal(run.status, 'FAILED');
  assert.equal(run.channels.length, 120);
  assert.equal(run.summary.testedChannels, 120);
  assert.equal(run.summary.passedChannels, 117);
  assert.equal(run.summary.failedChannels, 3);
  assert.equal(run.summary.notTestedChannels, 0);
  assert.deepEqual(
    run.channels.filter((channel) => channel.status === 'FAIL').map((channel) => channel.failureCode),
    ['MISSING_EXPECTED_INPUT', 'UNEXPECTED_EXTRA_INPUT', 'LOW_LED_BRIGHTNESS']
  );

  const persisted = await request('/api/runs/' + encodeURIComponent(run.runId));
  assert.equal(persisted.status, 200);
  assert.equal(persisted.json.data.channels.length, 120);
  assert.equal(persisted.json.data.status, 'FAILED');
});

test('all-pass scenario is explicitly simulation and contains all 120 passing channels', async () => {
  const response = await request('/api/runs', {
    method: 'POST',
    body: { assetId: 'ACS-HUB-00125', profile: 'all-pass' }
  });
  assert.equal(response.status, 201);
  assert.equal(response.json.mode, 'SIMULATION');
  assert.equal(response.json.data.status, 'PASSED');
  assert.equal(response.json.data.summary.passedChannels, 120);
  assert.equal(response.json.data.summary.failedChannels, 0);
  assert.equal(response.json.data.summary.notTestedChannels, 0);
  assert.ok(response.json.data.channels.every((channel) => channel.status === 'PASS'));
});

test('interrupted scenario remains INCOMPLETE and never passes', async () => {
  const response = await request('/api/runs', {
    method: 'POST',
    body: { assetId: 'ACS-HUB-00125', profile: 'incomplete' }
  });
  assert.equal(response.status, 201);
  assert.equal(response.json.data.status, 'INCOMPLETE');
  assert.equal(response.json.data.summary.testedChannels, 73);
  assert.equal(response.json.data.summary.notTestedChannels, 47);
  assert.notEqual(response.json.data.status, 'PASSED');
});

test('generic material cannot start Final QC unless its requirement is enabled', async () => {
  const response = await request('/api/runs', {
    method: 'POST',
    body: { assetId: 'MAT-DEMO-0042', profile: 'all-pass' }
  });
  assert.equal(response.status, 409);
  assert.equal(response.json.code, 'FINAL_QC_NOT_REQUIRED');
});

test('requirement toggles persist and create an audit record', async () => {
  const disabled = await request('/api/assets/ACS-HUB-00125/require-final-qc', {
    method: 'PATCH',
    body: { requireFinalQC: false, actor: 'POC Test' }
  });
  assert.equal(disabled.status, 200);
  assert.equal(disabled.json.data.requiresFinalQC, false);

  const blockedRun = await request('/api/runs', {
    method: 'POST',
    body: { assetId: 'ACS-HUB-00125', profile: 'all-pass' }
  });
  assert.equal(blockedRun.status, 409);
  assert.equal(blockedRun.json.code, 'FINAL_QC_NOT_REQUIRED');

  const audit = await request('/api/audit/ACS-HUB-00125');
  assert.equal(audit.status, 200);
  assert.ok(audit.json.data.some((event) => event.actor === 'POC Test' && event.new_value === 0));

  const enabled = await request('/api/assets/ACS-HUB-00125/require-final-qc', {
    method: 'PATCH',
    body: { requireFinalQC: true, actor: 'POC Test' }
  });
  assert.equal(enabled.status, 200);
  assert.equal(enabled.json.data.requiresFinalQC, true);
});

test('run history preserves multiple runs for the same board', async () => {
  const response = await request('/api/assets/ACS-HUB-00125/runs');
  assert.equal(response.status, 200);
  assert.ok(response.json.data.length >= 3);
  assert.ok(response.json.data.every((run) => run.mode === 'SIMULATION'));
});
