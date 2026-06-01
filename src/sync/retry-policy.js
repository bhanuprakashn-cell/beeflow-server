import { config } from '../config.js';

const BASE_BACKOFF_MS = 5000;
const MAX_BACKOFF_MS = 300000;

export function getNextRetryAt(retryCount) {
  const exponential = BASE_BACKOFF_MS * (2 ** Math.max(0, retryCount - 1));
  const capped = Math.min(MAX_BACKOFF_MS, exponential);
  const jitterMs = Math.floor(Math.random() * 1000);
  return new Date(Date.now() + capped + jitterMs).toISOString();
}

export function shouldFailPermanently(retryCount, maxRetry = config.maxRetry || 8) {
  return retryCount >= maxRetry;
}
