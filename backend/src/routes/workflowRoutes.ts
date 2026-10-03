import { Router } from 'express';
import {
  getWorkflows,
  getWorkflowById,
  getWorkflowLogs,
  triggerWorkflow,
  streamWorkflowTrajectory,
  deleteWorkflow,
} from '../controllers/workflowController.js';

const router = Router();

router.route('/')
  .get(getWorkflows)
  .post(triggerWorkflow);

router.route('/:id')
  .get(getWorkflowById)
  .delete(deleteWorkflow);

router.route('/:id/logs')
  .get(getWorkflowLogs);

router.route('/:id/stream')
  .get(streamWorkflowTrajectory);

export default router;
