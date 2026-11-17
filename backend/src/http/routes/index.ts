import { Router } from 'express';
import leadflowRoutes from './leadflowRoutes.js';

const router = Router();

// Health Check Endpoint
router.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    status: 'UP',
    timestamp: new Date().toISOString(),
    service: 'leadflow-ai-backend',
  });
});

// LeadFlow AI Core Sub-routers
router.use('/leadflow', leadflowRoutes);
router.use('/', leadflowRoutes); // Direct access for /leads, /icp, /analytics, etc.

export default router;
