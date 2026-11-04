import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { authRouter } from './auth.routes.js';
import { batchRouter } from './batch.routes.js';
import { orderRouter } from './order.routes.js';
import { scanRouter } from './scan.routes.js';
import { productRouter } from './product.routes.js';
import { stockRouter } from './stock.routes.js';
import { offlineOrderRouter } from './offlineOrder.routes.js';
import { dashboardRouter } from './dashboard.routes.js';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/batches', batchRouter);
apiRouter.use('/orders', orderRouter);
apiRouter.use('/scan', scanRouter);
apiRouter.use('/products', productRouter);
apiRouter.use('/stock', stockRouter);
apiRouter.use('/offline-orders', offlineOrderRouter);
apiRouter.use('/dashboard', dashboardRouter);

