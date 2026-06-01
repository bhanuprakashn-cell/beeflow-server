import { db } from '../db/sqlite.js';

const fetchProcessableStmt = db.prepare(`
  SELECT
    id,
    entity,
    operation,
    payload_json,
    operation_id,
    entity_id,
    operation_type,
    operation_timestamp_utc,
    source_mode,
    server_instance_id,
    revision,
    idempotency_key,
    operation_hash,
    conflict_status,
    resolution_note,
    retry_count,
    status,
    next_retry_at,
    last_error,
    processed_at,
    processing_started_at,
    created_at,
    updated_at
  FROM sync_queue
  WHERE status IN ('pending', 'retry')
    AND (next_retry_at IS NULL OR next_retry_at <= datetime('now'))
  ORDER BY created_at ASC
  LIMIT ?
`);

const markProcessingStmt = db.prepare(`
  UPDATE sync_queue
  SET status = 'processing',
      processing_started_at = datetime('now'),
      updated_at = datetime('now')
  WHERE id = ?
`);

const markSyncedStmt = db.prepare(`
  UPDATE sync_queue
  SET status = 'synced',
      conflict_status = COALESCE(?, conflict_status),
      resolution_note = COALESCE(?, resolution_note),
      processed_at = datetime('now'),
      processing_started_at = NULL,
      updated_at = datetime('now'),
      last_error = NULL
  WHERE id = ?
`);

const markRetryStmt = db.prepare(`
  UPDATE sync_queue
  SET status = 'retry',
      retry_count = ?,
      last_error = ?,
      next_retry_at = ?,
      processing_started_at = NULL,
      updated_at = datetime('now')
  WHERE id = ?
`);

const markFailedStmt = db.prepare(`
  UPDATE sync_queue
  SET status = 'failed',
      last_error = ?,
      processing_started_at = NULL,
      updated_at = datetime('now')
  WHERE id = ?
`);

const summaryStmt = db.prepare(`
  SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
    SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing_count,
    SUM(CASE WHEN status = 'retry' THEN 1 ELSE 0 END) AS retry_count,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
    SUM(CASE WHEN status = 'synced' THEN 1 ELSE 0 END) AS synced_count
  FROM sync_queue
`);

const listRecentJobsStmt = db.prepare(`
  SELECT
    id,
    entity,
    operation,
    operation_id,
    entity_id,
    operation_type,
    operation_timestamp_utc,
    source_mode,
    server_instance_id,
    revision,
    idempotency_key,
    operation_hash,
    conflict_status,
    resolution_note,
    status,
    retry_count,
    next_retry_at,
    last_error,
    processed_at,
    processing_started_at,
    created_at,
    updated_at,
    payload_json
  FROM sync_queue
  ORDER BY created_at DESC
  LIMIT ?
`);

const requeueStuckProcessingStmt = db.prepare(`
  UPDATE sync_queue
  SET status = 'retry',
      last_error = 'Requeued stuck processing job',
      next_retry_at = datetime('now'),
      processing_started_at = NULL,
      updated_at = datetime('now')
  WHERE status = 'processing'
    AND processing_started_at IS NOT NULL
    AND datetime(processing_started_at, '+' || ? || ' seconds') <= datetime('now')
`);

const autoRecoverFailedStmt = db.prepare(`
  UPDATE sync_queue
  SET status = 'retry',
      retry_count = 0,
      next_retry_at = datetime('now'),
      last_error = 'Auto-recovered failed job for retry',
      updated_at = datetime('now')
  WHERE status = 'failed'
    AND datetime(updated_at, '+' || ? || ' seconds') <= datetime('now')
    AND (last_error IS NULL OR last_error NOT LIKE '%forceFail%')
`);

export function fetchProcessableJobs(limit = 20) {
  return fetchProcessableStmt.all(limit);
}

export function markProcessing(id) {
  markProcessingStmt.run(id);
}

export function markSynced(id) {
  markSyncedStmt.run(null, null, id);
}

export function markSyncedWithResolution(id, conflictStatus, resolutionNote) {
  markSyncedStmt.run(conflictStatus ?? null, resolutionNote ?? null, id);
}

export function markRetry(id, errorMessage, retryCount, nextRetryAt) {
  markRetryStmt.run(retryCount, errorMessage, nextRetryAt, id);
}

export function markFailed(id, errorMessage) {
  markFailedStmt.run(errorMessage, id);
}

export function getQueueSummary() {
  const row = summaryStmt.get();
  return {
    total: Number(row.total || 0),
    pending_count: Number(row.pending_count || 0),
    processing_count: Number(row.processing_count || 0),
    retry_count: Number(row.retry_count || 0),
    failed_count: Number(row.failed_count || 0),
    synced_count: Number(row.synced_count || 0),
  };
}

export function listRecentJobs(limit = 50) {
  return listRecentJobsStmt.all(limit).map((row) => ({
    ...row,
    payload: JSON.parse(row.payload_json),
  }));
}

export function requeueStuckProcessingJobs(timeoutSeconds = 120) {
  const result = requeueStuckProcessingStmt.run(timeoutSeconds);
  return result.changes;
}

export function autoRecoverFailedJobs(cooldownSeconds = 300) {
  const result = autoRecoverFailedStmt.run(cooldownSeconds);
  return result.changes;
}
