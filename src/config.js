import dotenv from 'dotenv';

dotenv.config();

function parseDenyList(raw) {
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export const config = {
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT) || 8080,
  dbPath: process.env.DB_PATH || './data/poc.db',
  nodeEnv: process.env.NODE_ENV || 'development',
  syncIntervalMs: Number(process.env.SYNC_INTERVAL_MS) || 5000,
  maxRetry: Number(process.env.MAX_RETRY) || 8,
  syncBatchSize: Number(process.env.SYNC_BATCH_SIZE) || 20,
  serverInstanceId: process.env.SERVER_INSTANCE_ID || 'windows-primary',
  autoRecoverFailed: (process.env.AUTO_RECOVER_FAILED || 'true').toLowerCase() !== 'false',
  failedRecoverCooldownSec: Number(process.env.FAILED_RECOVER_COOLDOWN_SEC) || 300,
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || '',
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
  firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY || '',
  firebaseCollectionPrefix: process.env.FIREBASE_COLLECTION_PREFIX || '',
  productionFirebaseProjectIds: parseDenyList(process.env.PRODUCTION_FIREBASE_PROJECT_IDS),
  ngrokPublicUrl: process.env.NGROK_PUBLIC_URL || '',
};

export function validateFirebaseIsolation(runtimeConfig = config) {
  if (!runtimeConfig.firebaseProjectId) {
    throw new Error('FIREBASE_PROJECT_ID is required');
  }

  if (runtimeConfig.productionFirebaseProjectIds.includes(runtimeConfig.firebaseProjectId)) {
    throw new Error(`Blocked Firebase project id: ${runtimeConfig.firebaseProjectId}`);
  }

  if (!runtimeConfig.firebaseCollectionPrefix) {
    throw new Error('FIREBASE_COLLECTION_PREFIX is required');
  }

  if (!runtimeConfig.firebaseCollectionPrefix.startsWith('poc_')) {
    throw new Error('FIREBASE_COLLECTION_PREFIX must start with "poc_"');
  }
}
