import { Router } from 'express';
import {
  autoRecoverFailedJobs,
  listRecentJobs,
  getQueueSummary,
} from '../services/queue.service.js';
import { config } from '../config.js';
import { getWorkerHealth, runOnce } from '../sync/sync-worker.js';
import { getFirebaseMirrorHealth } from '../sync/firebase-mirror.js';
import { getServerNetworkInfo } from '../utils/network.js';

const router = Router();

router.get('/status', (_req, res, next) => {
  try {
    const queue = getQueueSummary();
    const mirror = getFirebaseMirrorHealth();
    const cloudReachable =
      Boolean(config.firebaseProjectId) &&
      mirror.started &&
      mirror.entities_listener_active &&
      mirror.operations_listener_active;
    const cloudSyncing =
      cloudReachable &&
      (queue.pending_count > 0 || queue.processing_count > 0 || queue.retry_count > 0);
    const cloudState = cloudReachable
      ? cloudSyncing
        ? 'syncing'
        : 'connected'
      : 'disconnected';

    res.json({
      ok: true,
      data: {
        queue,
        worker: getWorkerHealth(),
        cloud: {
          reachable: cloudReachable,
          state: cloudState,
          syncing: cloudSyncing,
          mirror,
        },
        network: getServerNetworkInfo(config.port),
        firebase_project_id: config.firebaseProjectId,
        firebase_collection_prefix: config.firebaseCollectionPrefix,
      },
      message: 'Sync status fetched',
    });
  } catch (error) {
    next(error);
  }
});

router.get('/safety', (_req, res) => {
  const prefix = (config.firebaseCollectionPrefix || '').trim();
  const blocked = config.productionFirebaseProjectIds.includes(config.firebaseProjectId);
  const pass =
    Boolean(config.firebaseProjectId) &&
    Boolean(prefix) &&
    prefix.startsWith('poc_') &&
    !blocked;

  res.json({
    ok: pass,
    data: {
      isolation_pass: pass,
      active_project_id: config.firebaseProjectId,
      prefix,
      blocked_by_deny_list: blocked,
    },
    message: pass ? 'Safety checks passed' : 'Safety checks failed',
  });
});

router.post('/trigger', async (_req, res, next) => {
  try {
    const result = await runOnce();
    res.json({
      ok: true,
      data: result,
      message: 'Sync trigger executed',
    });
  } catch (error) {
    next(error);
  }
});

router.post('/recover-failed', (req, res, next) => {
  try {
    const cooldown =
      Number.isFinite(Number(req.query.cooldown_sec)) &&
      Number(req.query.cooldown_sec) >= 0
        ? Number(req.query.cooldown_sec)
        : config.failedRecoverCooldownSec;

    const recovered = autoRecoverFailedJobs(cooldown);
    res.json({
      ok: true,
      data: { recovered, cooldown_sec: cooldown },
      message: 'Failed jobs recovery executed',
    });
  } catch (error) {
    next(error);
  }
});

router.get('/jobs', (req, res, next) => {
  try {
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 200) : 50;
    const jobs = listRecentJobs(limit);

    res.json({
      ok: true,
      data: jobs,
      message: 'Recent sync jobs fetched',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
