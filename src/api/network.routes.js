import { Router } from 'express';
import dns from 'node:dns/promises';
import { config } from '../config.js';
import { getLanUrls } from '../utils/network.js';

const router = Router();

async function hasInternet() {
  try {
    await dns.lookup('firestore.googleapis.com');
    return true;
  } catch (_) {
    return false;
  }
}

router.get('/preferred', async (_req, res) => {
  const lanUrls = getLanUrls(config.port);
  const internet = await hasInternet();
  const ngrok = config.ngrokPublicUrl.trim();
  const ngrokEnabled = ngrok.startsWith('https://') || ngrok.startsWith('http://');

  const preferredUrl =
    internet && ngrokEnabled
      ? ngrok
      : (lanUrls[0] || `http://localhost:${config.port}`);

  res.json({
    ok: true,
    data: {
      internet,
      ngrok_enabled: ngrokEnabled,
      ngrok_url: ngrokEnabled ? ngrok : null,
      lan_urls: lanUrls,
      preferred_url: preferredUrl,
      mode: internet && ngrokEnabled ? 'ngrok' : 'local_lan',
    },
    message: 'Preferred network route resolved',
  });
});

export default router;

