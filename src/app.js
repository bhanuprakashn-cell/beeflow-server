import express from 'express';
import cors from 'cors';
import healthRoutes from './api/health.routes.js';
import itemsRoutes from './api/items.routes.js';
import syncRoutes from './api/sync.routes.js';
import networkRoutes from './api/network.routes.js';
import { errorHandler } from './middleware/error-handler.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use('/health', healthRoutes);
app.use('/items', itemsRoutes);
app.use('/sync', syncRoutes);
app.use('/network', networkRoutes);

app.use(errorHandler);

export default app;
