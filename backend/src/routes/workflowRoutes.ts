import { Router } from 'express';
import {
  getWorkflows,
  getWorkflowById,
  getWorkflowLogs,
  triggerWorkflow,
} from '../controllers/workflowController.js';

const router = Router();

router.route('/')
  .get(getWorkflows)
  .post(triggerWorkflow);

router.route('/:id')
  .get(getWorkflowById);

router.route('/:id/logs')
  .get(getWorkflowLogs);

export default router;
