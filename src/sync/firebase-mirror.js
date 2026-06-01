import { getCollectionName, getFirestore } from './firebase-client.js';
import {
  getMirrorStatus,
  upsertMirroredEntity,
  upsertMirroredOperation,
} from '../services/mirror.service.js';

let entitiesUnsub = null;
let operationsUnsub = null;
let started = false;
let lastError = null;
let lastEventAt = null;
let reconnectTimer = null;

function stamp() {
  lastEventAt = new Date().toISOString();
}

function safeIso(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
  if (typeof ts === 'string') return ts;
  return null;
}

function clearSubs() {
  if (entitiesUnsub) entitiesUnsub();
  if (operationsUnsub) operationsUnsub();
  entitiesUnsub = null;
  operationsUnsub = null;
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (started) {
      startFirebaseMirror();
    }
  }, 5000);
}

export function getFirebaseMirrorHealth() {
  return {
    started,
    entities_listener_active: Boolean(entitiesUnsub),
    operations_listener_active: Boolean(operationsUnsub),
    last_event_at: lastEventAt,
    last_error: lastError,
    sqlite_mirror: getMirrorStatus(),
  };
}

export function stopFirebaseMirror() {
  started = false;
  clearSubs();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

export function startFirebaseMirror() {
  stopFirebaseMirror();
  started = true;
  lastError = null;

  try {
    const db = getFirestore();
    const entitiesCollection = getCollectionName('entities');
    const operationsCollection = getCollectionName('operations');

    entitiesUnsub = db.collection(entitiesCollection).onSnapshot(
      (snap) => {
        stamp();
        for (const change of snap.docChanges()) {
          const data = change.doc.data() || {};
          upsertMirroredEntity({
            entityId: change.doc.id,
            revision: Number(data.revision || 0),
            operationTimestampUtc: data.operation_timestamp_utc || null,
            sourceMode: data.source_mode || null,
            serverInstanceId: data.server_instance_id || null,
            payloadJson: JSON.stringify(data.payload ?? null),
            firebaseUpdatedAt: safeIso(data.updated_at_server),
          });
        }
      },
      (error) => {
        lastError = `entities listener error: ${error?.message || 'unknown'}`;
        clearSubs();
        scheduleReconnect();
      },
    );

    operationsUnsub = db.collection(operationsCollection).onSnapshot(
      (snap) => {
        stamp();
        for (const change of snap.docChanges()) {
          const data = change.doc.data() || {};
          upsertMirroredOperation({
            idempotencyKey: change.doc.id,
            operationId: data.operation_id || null,
            entityId: data.entity_id || null,
            operationType: data.operation_type || null,
            operationTimestampUtc: data.operation_timestamp_utc || null,
            sourceMode: data.source_mode || null,
            serverInstanceId: data.server_instance_id || null,
            revision: Number(data.revision || 1),
            conflictState: data.conflict_state || null,
            resolutionNote: data.resolution_note || null,
            payloadJson: JSON.stringify(data),
            firebaseCreatedAt: safeIso(data.created_at_server),
          });
        }
      },
      (error) => {
        lastError = `operations listener error: ${error?.message || 'unknown'}`;
        clearSubs();
        scheduleReconnect();
      },
    );
  } catch (error) {
    lastError = `mirror bootstrap error: ${error?.message || 'unknown'}`;
    scheduleReconnect();
  }
}

