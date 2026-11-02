import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { STAFF_ROLES } from '../config/roles.js';
import {
  listFuelRecords, getFuelRecord, createFuelRecord, updateFuelRecord, deleteFuelRecord,
  listFuelCards, createFuelCard, updateFuelCard, deleteFuelCard,
  listFuelProfiles, upsertFuelProfile, deleteFuelProfile,
  listCalibrations, createCalibration, updateCalibration, deleteCalibration,
  listAnomalies, reviewAnomaly, listAnalysisRuns, triggerAnalysis,
} from '../controllers/fuel.controller.js';

// The whole Fuel Hub is hidden (404) unless the organisation has the
// fuelHubEnabled feature flag.
function requireFuelHub(req, res, next) {
  if (!req.org?.fuelHubEnabled) return res.status(404).json({ error: 'Fuel Hub is not enabled for this organisation.' });
  next();
}

const staff = requireRole(...STAFF_ROLES);
const router = Router();
router.use(requireAuth, requireFuelHub);

// Drivers can log and see their own fuel-ups; staff manage everything.
router.get('/records', requireRole('DRIVER', ...STAFF_ROLES), listFuelRecords);
router.post('/records', requireRole('DRIVER', ...STAFF_ROLES), createFuelRecord);
router.get('/records/:id', requireRole('DRIVER', ...STAFF_ROLES), getFuelRecord);
router.patch('/records/:id', staff, updateFuelRecord);
router.delete('/records/:id', staff, deleteFuelRecord);

router.get('/cards', staff, listFuelCards);
router.post('/cards', staff, createFuelCard);
router.patch('/cards/:id', staff, updateFuelCard);
router.delete('/cards/:id', staff, deleteFuelCard);

router.get('/profiles', staff, listFuelProfiles);
router.put('/profiles/:busId', staff, upsertFuelProfile);
router.delete('/profiles/:busId', staff, deleteFuelProfile);

router.get('/calibrations', staff, listCalibrations);
router.post('/calibrations', staff, createCalibration);
router.patch('/calibrations/:id', staff, updateCalibration);
router.delete('/calibrations/:id', staff, deleteCalibration);

router.get('/anomalies', staff, listAnomalies);
router.patch('/anomalies/:id', staff, reviewAnomaly);

router.get('/analysis/runs', staff, listAnalysisRuns);
router.post('/analysis/run', requireRole('ORG_ADMIN'), triggerAnalysis);

export default router;
