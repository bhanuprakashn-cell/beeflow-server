import { config } from '../config.js';
import {
  autoRecoverFailedJobs,
  fetchProcessableJobs,
  markFailed,
  markProcessing,
  markRetry,
  markSynced,
  markSyncedWithResolution,
  requeueStuckProcessingJobs,
} from '../services/queue.service.js';
import { processJobToFirebase } from './firebase-sync-adapter.js';
import { getNextRetryAt, shouldFailPermanently } from './retry-policy.js';

let timer = null;
let running = false;
let lastRunAt = null;

function logJob(payload) {
  console.log(`[sync-worker] ${JSON.stringify(payload)}`);
}

export function getWorkerHealth() {
  return {
    running: timer !== null,
    in_progress: running,
    interval_ms: config.syncIntervalMs,
    batch_size: config.syncBatchSize,
    max_retry: config.maxRetry,
    last_run_at: lastRunAt,
  };
}

export async function runOnce() {
  if (running) {
    return { skipped: true, processed: 0, message: 'worker already running' };
  }

  running = true;
  lastRunAt = new Date().toISOString();

  let processed = 0;
  let requeued_stuck = 0;
  let auto_recovered_failed = 0;

  try {
    requeued_stuck = requeueStuckProcessingJobs(120);
    if (config.autoRecoverFailed) {
      auto_recovered_failed = autoRecoverFailedJobs(
        config.failedRecoverCooldownSec,
      );
      if (auto_recovered_failed > 0) {
        console.log(
          `[sync-worker] auto_recovered_failed=${auto_recovered_failed}`,
        );
      }
    }

    const jobs = fetchProcessableJobs(config.syncBatchSize);

    for (const job of jobs) {
      const retryCount = Number(job.retry_count || 0);
      const nextRetryCount = retryCount + 1;

      try {
        markProcessing(job.id);
        logJob({
          jobId: job.id,
          status: 'processing',
          retryCount,
          error: null,
          nextRetryAt: null,
        });

        const result = await processJobToFirebase(job);
        if (result?.sync_state && result.sync_state !== 'applied') {
          markSyncedWithResolution(job.id, result.sync_state, result.resolution_note || null);
        } else {
          markSynced(job.id);
        }

        logJob({
          jobId: job.id,
          status: 'synced',
          retryCount,
          error: null,
          nextRetryAt: null,
          projectId: result.project_id,
          collection: result.collection,
          syncState: result.sync_state || 'applied',
          resolutionNote: result.resolution_note || null,
        });
      } catch (error) {
        const errorMessage = error?.message || 'Unknown sync error';

        if (shouldFailPermanently(nextRetryCount, config.maxRetry)) {
          markFailed(job.id, errorMessage);
          logJob({
            jobId: job.id,
            status: 'failed',
            retryCount: nextRetryCount,
            error: errorMessage,
            nextRetryAt: null,
          });
        } else {
          const nextRetryAt = getNextRetryAt(nextRetryCount);
          markRetry(job.id, errorMessage, nextRetryCount, nextRetryAt);
          logJob({
            jobId: job.id,
            status: 'retry',
            retryCount: nextRetryCount,
            error: errorMessage,
            nextRetryAt,
          });
        }
      }

      processed += 1;
    }

    return {
      skipped: false,
      processed,
      requeued_stuck,
      auto_recovered_failed,
      message: 'worker run completed',
    };
  } finally {
    running = false;
  }
}

export function start() {
  if (timer !== null) {
    return;
  }

  timer = setInterval(() => {
    runOnce().catch((error) => {
      console.error('[sync-worker] loop error', error);
    });
  }, config.syncIntervalMs);

  runOnce().catch((error) => {
    console.error('[sync-worker] bootstrap error', error);
  });
}

export function stop() {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}
