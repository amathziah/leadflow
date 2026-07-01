import { Router } from 'express';
import {
  getLeads,
  getLeadById,
  updateLead,
  deleteLead,
} from '../controllers/leadController.js';

const router = Router();

router.route('/')
  .get(getLeads);

router.route('/:id')
  .get(getLeadById)
  .put(updateLead)
  .delete(deleteLead);

export default router;
