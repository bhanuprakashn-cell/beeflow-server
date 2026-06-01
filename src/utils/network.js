import os from 'node:os';

function isPrivateIpv4(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  const a = Number(parts[0]);
  const b = Number(parts[1]);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

export function getLanUrls(port) {
  const ifaces = os.networkInterfaces();
  const urls = [];

  for (const entries of Object.values(ifaces)) {
    for (const entry of entries || []) {
      if (!entry || entry.internal) continue;
      if (entry.family !== 'IPv4') continue;
      if (!isPrivateIpv4(entry.address)) continue;
      urls.push(`http://${entry.address}:${port}`);
    }
  }

  return Array.from(new Set(urls)).sort();
}

export function getServerNetworkInfo(port) {
  return {
    hostname: os.hostname(),
    lan_urls: getLanUrls(port),
  };
}

