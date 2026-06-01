import { randomUUID } from 'node:crypto';
import { db } from '../db/sqlite.js';
import { config } from '../config.js';
import { normalizeSourceMode, operationHash } from '../utils/operation.js';

const insertItemStmt = db.prepare(`
  INSERT INTO items_local (id, payload_json, sync_status)
  VALUES (?, ?, 'pending')
`);

const insertQueueStmt = db.prepare(`
  INSERT INTO sync_queue (
    id, entity, operation, payload_json, retry_count, status,
    operation_id, entity_id, operation_type, operation_timestamp_utc,
    source_mode, server_instance_id, revision, idempotency_key, operation_hash,
    conflict_status, resolution_note
  )
  VALUES (
    ?, 'items_local', 'create', ?, 0, 'pending',
    ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    'none', NULL
  )
`);

const findByIdempotencyStmt = db.prepare(`
  SELECT idempotency_key, item_id, queue_id, created_at
  FROM ingest_dedupe
  WHERE idempotency_key = ?
  LIMIT 1
`);

const insertIdempotencyStmt = db.prepare(`
  INSERT INTO ingest_dedupe (idempotency_key, item_id, queue_id)
  VALUES (?, ?, ?)
`);

const listItemsStmt = db.prepare(`
  SELECT id, payload_json, sync_status, created_at, updated_at
  FROM items_local
  ORDER BY created_at DESC
`);

const syncStatusStmt = db.prepare(`
  SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
    SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing_count,
    SUM(CASE WHEN status = 'retry' THEN 1 ELSE 0 END) AS retry_count,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
    SUM(CASE WHEN status = 'synced' THEN 1 ELSE 0 END) AS synced_count
  FROM sync_queue
`);

const createItemTx = db.transaction((payload) => {
  const payloadObject = payload ?? {};
  const itemId = randomUUID();
  const queueId = randomUUID();
  const operationId =
    typeof payloadObject.operation_id === 'string' &&
    payloadObject.operation_id.trim().length > 0
      ? payloadObject.operation_id.trim()
      : randomUUID();
  const entityId =
    typeof payloadObject.entity_id === 'string' &&
    payloadObject.entity_id.trim().length > 0
      ? payloadObject.entity_id.trim()
      : itemId;
  const operationType =
    typeof payloadObject.operation_type === 'string' &&
    payloadObject.operation_type.trim().length > 0
      ? payloadObject.operation_type.trim()
      : 'create_item';
  const operationTimestampUtc =
    typeof payloadObject.operation_timestamp_utc === 'string' &&
    payloadObject.operation_timestamp_utc.trim().length > 0
      ? payloadObject.operation_timestamp_utc.trim()
      : new Date().toISOString();
  const sourceMode = normalizeSourceMode(payloadObject.source_mode);
  const serverInstanceId = config.serverInstanceId || 'windows-primary';
  const revision =
    Number.isFinite(Number(payloadObject.revision)) &&
    Number(payloadObject.revision) > 0
      ? Number(payloadObject.revision)
      : 1;
  const operationHashValue = operationHash(payloadObject);
  const idempotencyKeyRaw =
    typeof payloadObject.idempotency_key === 'string' &&
    payloadObject.idempotency_key.trim().length > 0
      ? payloadObject.idempotency_key.trim()
      : `${entityId}:${operationType}:${operationHashValue}`;

  const duplicate = findByIdempotencyStmt.get(idempotencyKeyRaw);
  if (duplicate) {
    return {
      itemId: duplicate.item_id,
      queueId: duplicate.queue_id,
      operationId,
      idempotencyKey: idempotencyKeyRaw,
      duplicate: true,
    };
  }

  const payloadWithEnvelope = {
    ...payloadObject,
    operation_id: operationId,
    entity_id: entityId,
    operation_type: operationType,
    operation_timestamp_utc: operationTimestampUtc,
    source_mode: sourceMode,
    server_instance_id: serverInstanceId,
    revision,
    idempotency_key: idempotencyKeyRaw,
    operation_hash: operationHashValue,
  };

  const payloadJson = JSON.stringify(payloadWithEnvelope);

  insertItemStmt.run(itemId, payloadJson);
  insertQueueStmt.run(
    queueId,
    payloadJson,
    operationId,
    entityId,
    operationType,
    operationTimestampUtc,
    sourceMode,
    serverInstanceId,
    revision,
    idempotencyKeyRaw,
    operationHashValue,
  );
  insertIdempotencyStmt.run(idempotencyKeyRaw, itemId, queueId);

  return {
    itemId,
    queueId,
    operationId,
    idempotencyKey: idempotencyKeyRaw,
    duplicate: false,
  };
});

export function createItem(payload) {
  return createItemTx(payload);
}

export function listItems() {
  const rows = listItemsStmt.all();
  return rows.map((row) => ({
    id: row.id,
    sync_status: row.sync_status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    payload: JSON.parse(row.payload_json),
  }));
}

export function getSyncStatus() {
  const row = syncStatusStmt.get();
  return {
    total: Number(row.total || 0),
    pending_count: Number(row.pending_count || 0),
    processing_count: Number(row.processing_count || 0),
    retry_count: Number(row.retry_count || 0),
    failed_count: Number(row.failed_count || 0),
    synced_count: Number(row.synced_count || 0),
  };
}
