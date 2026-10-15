import express from 'express';
import cors from 'cors';
import healthRoutes from './api/health.routes.js';
import itemsRoutes from './api/items.routes.js';
import syncRoutes from './api/sync.routes.js';
import networkRoutes from './api/network.routes.js';
import finalQcPocRoutes from './api/final-qc-poc.routes.js';
import { errorHandler } from './middleware/error-handler.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use('/health', healthRoutes);
app.use('/items', itemsRoutes);
app.use('/sync', syncRoutes);
app.use('/network', networkRoutes);

// Development-only Final QC prototype. The route rejects production mode
// and is local-only by default; it never controls real hardware.
app.use('/admin/final-qc-poc', finalQcPocRoutes);

app.use(errorHandler);

export default app;
