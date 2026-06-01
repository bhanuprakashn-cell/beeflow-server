import { Router } from 'express';
import { config } from '../config.js';
import { getServerNetworkInfo } from '../utils/network.js';

const router = Router();

router.get('/', (_req, res) => {
  const network = getServerNetworkInfo(config.port);
  res.json({
    ok: true,
    data: {
      status: 'healthy',
      server_time_utc: new Date().toISOString(),
      ...network,
    },
    message: 'Health check passed',
  });
});

export default router;
