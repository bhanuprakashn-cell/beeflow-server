import { getCollectionName, getFirestore } from './firebase-client.js';
import { config } from '../config.js';
import admin from 'firebase-admin';

export async function processJobToFirebase(job) {
  const payload = JSON.parse(job.payload_json);
  const db = getFirestore();
  const entitiesCollection = getCollectionName('entities');
  const operationsCollection = getCollectionName('operations');

  const operationId = job.operation_id || payload.operation_id || job.id;
  const idempotencyKey = job.idempotency_key || payload.idempotency_key || job.id;
  const entityId = job.entity_id || payload.entity_id || payload.id || job.id;
  const operationType = job.operation_type || payload.operation_type || job.operation || 'create_item';
  const operationTimestampUtc =
    job.operation_timestamp_utc ||
    payload.operation_timestamp_utc ||
    new Date().toISOString();
  const sourceMode = job.source_mode || payload.source_mode || 'server';
  const serverInstanceId = job.server_instance_id || payload.server_instance_id || config.serverInstanceId;
  const incomingRevision = Number(job.revision || payload.revision || 1);

  const entityRef = db.collection(entitiesCollection).doc(entityId);
  const operationRef = db.collection(operationsCollection).doc(idempotencyKey);

  try {
    const result = await db.runTransaction(async (tx) => {
      const [opSnap, entitySnap] = await Promise.all([
        tx.get(operationRef),
        tx.get(entityRef),
      ]);

      if (opSnap.exists) {
        return {
          state: 'duplicate',
          note: 'Operation already applied in Firebase',
        };
      }

      const current = entitySnap.exists ? entitySnap.data() : {};
      const currentRevision = Number(current?.revision || 0);
      const currentUpdatedAt = current?.operation_timestamp_utc || null;

      let conflictState = 'applied';
      let resolutionNote = null;
      if (currentRevision > incomingRevision) {
        conflictState = 'resolved_remote_newer';
        resolutionNote = 'Remote revision newer. Queue op resolved without overwrite.';
      } else if (
        currentRevision === incomingRevision &&
        currentUpdatedAt &&
        operationTimestampUtc &&
        currentUpdatedAt >= operationTimestampUtc
      ) {
        conflictState = 'resolved_duplicate_state';
        resolutionNote = 'Equivalent or newer state already present.';
      }

      tx.set(operationRef, {
        operation_id: operationId,
        idempotency_key: idempotencyKey,
        entity_id: entityId,
        operation_type: operationType,
        operation_timestamp_utc: operationTimestampUtc,
        source_mode: sourceMode,
        server_instance_id: serverInstanceId,
        revision: incomingRevision,
        queue_id: job.id,
        local_created_at: job.created_at || null,
        conflict_state: conflictState,
        resolution_note: resolutionNote,
        created_at_server: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (conflictState === 'applied') {
        tx.set(
          entityRef,
          {
            entity_id: entityId,
            revision: incomingRevision,
            operation_timestamp_utc: operationTimestampUtc,
            source_mode: sourceMode,
            server_instance_id: serverInstanceId,
            last_operation_id: operationId,
            payload,
            updated_at_server: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }

      return {
        state: conflictState,
        note: resolutionNote,
      };
    });

    return {
      ok: true,
      project_id: config.firebaseProjectId,
      collection: entitiesCollection,
      doc_id: entityId,
      sync_state: result.state,
      resolution_note: result.note,
    };
  } catch (error) {
    throw new Error(`Firebase sync failed for job ${job.id}: ${error?.message || 'unknown error'}`);
  }
}
