import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { authRouter } from './auth.routes.js';
import { batchRouter } from './batch.routes.js';
import { orderRouter } from './order.routes.js';
import { scanRouter } from './scan.routes.js';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/batches', batchRouter);
apiRouter.use('/orders', orderRouter);
apiRouter.use('/scan', scanRouter);

