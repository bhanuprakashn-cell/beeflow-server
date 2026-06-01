import { db } from '../db/sqlite.js';

const upsertEntityStmt = db.prepare(`
  INSERT INTO mirror_entities (
    entity_id, revision, operation_timestamp_utc, source_mode,
    server_instance_id, payload_json, firebase_updated_at, mirrored_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT(entity_id) DO UPDATE SET
    revision=excluded.revision,
    operation_timestamp_utc=excluded.operation_timestamp_utc,
    source_mode=excluded.source_mode,
    server_instance_id=excluded.server_instance_id,
    payload_json=excluded.payload_json,
    firebase_updated_at=excluded.firebase_updated_at,
    mirrored_at=datetime('now')
`);

const upsertOperationStmt = db.prepare(`
  INSERT INTO mirror_operations (
    idempotency_key, operation_id, entity_id, operation_type,
    operation_timestamp_utc, source_mode, server_instance_id, revision,
    conflict_state, resolution_note, payload_json, firebase_created_at, mirrored_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT(idempotency_key) DO UPDATE SET
    operation_id=excluded.operation_id,
    entity_id=excluded.entity_id,
    operation_type=excluded.operation_type,
    operation_timestamp_utc=excluded.operation_timestamp_utc,
    source_mode=excluded.source_mode,
    server_instance_id=excluded.server_instance_id,
    revision=excluded.revision,
    conflict_state=excluded.conflict_state,
    resolution_note=excluded.resolution_note,
    payload_json=excluded.payload_json,
    firebase_created_at=excluded.firebase_created_at,
    mirrored_at=datetime('now')
`);

const mirrorStatusStmt = db.prepare(`
  SELECT
    (SELECT COUNT(*) FROM mirror_entities) AS entities_count,
    (SELECT COUNT(*) FROM mirror_operations) AS operations_count,
    (SELECT MAX(mirrored_at) FROM mirror_entities) AS last_entities_mirror_at,
    (SELECT MAX(mirrored_at) FROM mirror_operations) AS last_operations_mirror_at
`);

export function upsertMirroredEntity({
  entityId,
  revision,
  operationTimestampUtc,
  sourceMode,
  serverInstanceId,
  payloadJson,
  firebaseUpdatedAt,
}) {
  upsertEntityStmt.run(
    entityId,
    revision,
    operationTimestampUtc,
    sourceMode,
    serverInstanceId,
    payloadJson,
    firebaseUpdatedAt,
  );
}

export function upsertMirroredOperation({
  idempotencyKey,
  operationId,
  entityId,
  operationType,
  operationTimestampUtc,
  sourceMode,
  serverInstanceId,
  revision,
  conflictState,
  resolutionNote,
  payloadJson,
  firebaseCreatedAt,
}) {
  upsertOperationStmt.run(
    idempotencyKey,
    operationId,
    entityId,
    operationType,
    operationTimestampUtc,
    sourceMode,
    serverInstanceId,
    revision,
    conflictState,
    resolutionNote,
    payloadJson,
    firebaseCreatedAt,
  );
}

export function getMirrorStatus() {
  const row = mirrorStatusStmt.get();
  return {
    entities_count: Number(row?.entities_count || 0),
    operations_count: Number(row?.operations_count || 0),
    last_entities_mirror_at: row?.last_entities_mirror_at || null,
    last_operations_mirror_at: row?.last_operations_mirror_at || null,
  };
}

