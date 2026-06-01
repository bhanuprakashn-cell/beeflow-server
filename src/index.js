import app from './app.js';
import { config, validateFirebaseIsolation } from './config.js';
import './db/sqlite.js';
import { start, stop } from './sync/sync-worker.js';
import { startFirebaseMirror, stopFirebaseMirror } from './sync/firebase-mirror.js';
import { getLanUrls } from './utils/network.js';

try {
  validateFirebaseIsolation(config);
} catch (error) {
  console.error(`[FATAL] Firebase isolation validation failed: ${error.message}`);
  process.exit(1);
}

const server = app.listen(config.port, config.host, () => {
  console.log(
    `Server listening on ${config.host}:${config.port} in ${config.nodeEnv} mode`,
  );
  console.log(`Health: http://localhost:${config.port}/health`);
  const lan = getLanUrls(config.port);
  if (lan.length > 0) {
    console.log(`LAN URLs: ${lan.join(' , ')}`);
  } else {
    console.log('LAN URLs: not detected');
  }
  start();
  startFirebaseMirror();
});

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down gracefully...`);
  stopFirebaseMirror();
  stop();
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
