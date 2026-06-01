import { Router } from 'express';
import { createItem, listItems } from '../services/items.service.js';

const router = Router();

router.post('/', (req, res, next) => {
  try {
    const payload = req.body;

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return res.status(400).json({
        ok: false,
        data: null,
        message: 'Request body must be a JSON object',
      });
    }

    const { itemId, queueId, operationId, idempotencyKey, duplicate } =
      createItem(payload);
    const now = new Date().toISOString();
    console.log(
      `[ingest] ${now} item_saved item_id=${itemId} queue_id=${queueId} operation_id=${operationId} duplicate=${duplicate} idempotency_key=${idempotencyKey} keys=${Object.keys(payload).join(',')}`,
    );

    return res.status(duplicate ? 200 : 201).json({
      ok: true,
      data: {
        item_id: itemId,
        queue_id: queueId,
        operation_id: operationId,
        idempotency_key: idempotencyKey,
        duplicate,
        sync_status: 'pending',
      },
      message: duplicate
        ? 'Duplicate operation ignored and existing result returned'
        : 'Item created and queued for sync',
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/', (_req, res, next) => {
  try {
    const items = listItems();
    res.json({
      ok: true,
      data: items,
      message: 'Items fetched',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
