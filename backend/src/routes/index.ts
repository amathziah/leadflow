import { Router } from 'express';
import leadRoutes from './leadRoutes.js';
import workflowRoutes from './workflowRoutes.js';

const router = Router();

// Health Check Endpoint
router.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    status: 'UP',
    timestamp: new Date().toISOString(),
    service: 'leadflow-backend',
  });
});

// Mount Sub-routers
router.use('/leads', leadRoutes);
router.use('/workflows', workflowRoutes);

export default router;
