import { Router } from 'express';
import {
  getAnalyses,
  getAnalysisById,
  getAnalysisLogs,
  triggerAnalysis,
  streamAnalysisTrajectory,
  deleteAnalysis,
} from '../controllers/analysisController.js';

const router = Router();

router.route('/')
  .get(getAnalyses)
  .post(triggerAnalysis);

router.route('/:id')
  .get(getAnalysisById)
  .delete(deleteAnalysis);

router.route('/:id/logs')
  .get(getAnalysisLogs);

router.route('/:id/stream')
  .get(streamAnalysisTrajectory);

export default router;
