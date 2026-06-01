import crypto from 'node:crypto';

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
    .join(',')}}`;
}

export function operationHash(payload) {
  const canonical = stableStringify(payload);
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export function normalizeSourceMode(raw) {
  if (!raw || typeof raw !== 'string') return 'server';
  const v = raw.trim().toLowerCase();
  if (v === 'internet' || v === 'server') return v;
  return 'server';
}

