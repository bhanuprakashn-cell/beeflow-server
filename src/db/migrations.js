export function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS items_local (
      id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      entity TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ingest_dedupe (
      idempotency_key TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      queue_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mirror_entities (
      entity_id TEXT PRIMARY KEY,
      revision INTEGER NOT NULL DEFAULT 0,
      operation_timestamp_utc TEXT NULL,
      source_mode TEXT NULL,
      server_instance_id TEXT NULL,
      payload_json TEXT NULL,
      firebase_updated_at TEXT NULL,
      mirrored_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mirror_operations (
      idempotency_key TEXT PRIMARY KEY,
      operation_id TEXT NULL,
      entity_id TEXT NULL,
      operation_type TEXT NULL,
      operation_timestamp_utc TEXT NULL,
      source_mode TEXT NULL,
      server_instance_id TEXT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      conflict_state TEXT NULL,
      resolution_note TEXT NULL,
      payload_json TEXT NULL,
      firebase_created_at TEXT NULL,
      mirrored_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_items_local_created_at
    ON items_local(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_sync_queue_status_retry
    ON sync_queue(status, retry_count, created_at);

    CREATE INDEX IF NOT EXISTS idx_sync_queue_status_next_retry
    ON sync_queue(status, next_retry_at, created_at);
  `);

  const existingColumns = new Set(
    db.prepare("PRAGMA table_info(sync_queue)").all().map((col) => col.name),
  );

  if (!existingColumns.has('next_retry_at')) {
    db.exec('ALTER TABLE sync_queue ADD COLUMN next_retry_at TEXT NULL');
  }

  if (!existingColumns.has('last_error')) {
    db.exec('ALTER TABLE sync_queue ADD COLUMN last_error TEXT NULL');
  }

  if (!existingColumns.has('processed_at')) {
    db.exec('ALTER TABLE sync_queue ADD COLUMN processed_at TEXT NULL');
  }

  if (!existingColumns.has('processing_started_at')) {
    db.exec('ALTER TABLE sync_queue ADD COLUMN processing_started_at TEXT NULL');
  }

  if (!existingColumns.has('operation_id')) {
    db.exec('ALTER TABLE sync_queue ADD COLUMN operation_id TEXT NULL');
  }

  if (!existingColumns.has('entity_id')) {
    db.exec('ALTER TABLE sync_queue ADD COLUMN entity_id TEXT NULL');
  }

  if (!existingColumns.has('operation_type')) {
    db.exec('ALTER TABLE sync_queue ADD COLUMN operation_type TEXT NULL');
  }

  if (!existingColumns.has('operation_timestamp_utc')) {
    db.exec('ALTER TABLE sync_queue ADD COLUMN operation_timestamp_utc TEXT NULL');
  }

  if (!existingColumns.has('source_mode')) {
    db.exec('ALTER TABLE sync_queue ADD COLUMN source_mode TEXT NULL');
  }

  if (!existingColumns.has('server_instance_id')) {
    db.exec('ALTER TABLE sync_queue ADD COLUMN server_instance_id TEXT NULL');
  }

  if (!existingColumns.has('revision')) {
    db.exec('ALTER TABLE sync_queue ADD COLUMN revision INTEGER NOT NULL DEFAULT 1');
  }

  if (!existingColumns.has('idempotency_key')) {
    db.exec('ALTER TABLE sync_queue ADD COLUMN idempotency_key TEXT NULL');
  }

  if (!existingColumns.has('operation_hash')) {
    db.exec('ALTER TABLE sync_queue ADD COLUMN operation_hash TEXT NULL');
  }

  if (!existingColumns.has('conflict_status')) {
    db.exec("ALTER TABLE sync_queue ADD COLUMN conflict_status TEXT NOT NULL DEFAULT 'none'");
  }

  if (!existingColumns.has('resolution_note')) {
    db.exec('ALTER TABLE sync_queue ADD COLUMN resolution_note TEXT NULL');
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sync_queue_status_next_retry
    ON sync_queue(status, next_retry_at, created_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sync_queue_idempotency_key
    ON sync_queue(idempotency_key)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sync_queue_entity_revision
    ON sync_queue(entity_id, revision, created_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_mirror_entities_revision
    ON mirror_entities(revision, mirrored_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_mirror_ops_entity_time
    ON mirror_operations(entity_id, operation_timestamp_utc, mirrored_at)
  `);
}
