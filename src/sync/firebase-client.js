import admin from 'firebase-admin';
import { config } from '../config.js';

let app = null;

function normalizePrivateKey(privateKey) {
  if (typeof privateKey !== 'string' || privateKey.trim().length === 0) {
    throw new Error('Missing Firebase private key');
  }

  return privateKey.replace(/\\n/g, '\n');
}

function getFirebaseApp() {
  if (app) {
    return app;
  }

  app = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: config.firebaseProjectId,
      clientEmail: config.firebaseClientEmail,
      privateKey: normalizePrivateKey(config.firebasePrivateKey),
    }),
  });

  return app;
}

export function getFirestore() {
  return getFirebaseApp().firestore();
}

export function getCollectionName(entity) {
  return `${config.firebaseCollectionPrefix}${entity}`;
}
