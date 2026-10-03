import { Router } from 'express';
import {
  getCompetitors,
  getCompetitorById,
  deleteCompetitor,
} from '../controllers/competitorController.js';

const router = Router();

router.route('/')
  .get(getCompetitors);

router.route('/:id')
  .get(getCompetitorById)
  .delete(deleteCompetitor);

export default router;
