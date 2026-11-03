import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { STAFF_ROLES } from '../config/roles.js';
import {
  listRoutesAdmin, updateBusAssignment, createBus, listBuses,
  listDrivers, listStudents, removeStudents, removeDrivers, listAllPayments,
} from '../controllers/admin.controller.js';
import { getBillingOverview } from '../controllers/analytics.controller.js';
import {
  createRoute, updateRoute, previewRoute, optimiseRoute, searchPlaces,
} from '../controllers/route.controller.js';
import { getFleetOverview } from '../controllers/fleet.controller.js';
import { createPupil, linkGuardian, unlinkGuardian, listParents } from '../controllers/pupil.controller.js';
import {
  createSlot, listSlotsAdmin,
} from '../controllers/slot.controller.js';
import {
  setBusStatus, addVehicleLog, listVehicleLogs, getSafetyChecklist, toggleSafetyCheck,
} from '../controllers/vehicle.controller.js';

const router = Router();

// Every route below requires a valid access token and a staff role
// (ORG_ADMIN or FLEET_MANAGER). Routes touching money or removing people
// are further restricted to ORG_ADMIN.
const orgAdminOnly = requireRole('ORG_ADMIN');
router.use(requireAuth, requireRole(...STAFF_ROLES));

router.post('/routes/preview', previewRoute);
router.post('/routes/optimise', optimiseRoute);
router.post('/routes', createRoute);
router.get('/routes', listRoutesAdmin);
router.put('/routes/:id', updateRoute);
router.get('/places', searchPlaces);

router.post('/buses', createBus);
router.get('/buses', listBuses);
router.put('/buses/status', setBusStatus);
router.put('/buses/:id', updateBusAssignment);

router.get('/drivers', listDrivers);
router.post('/drivers/remove', orgAdminOnly, removeDrivers);

router.get('/students', listStudents);
router.post('/students/remove', orgAdminOnly, removeStudents);

// Passenger records without accounts (school pupils) and their parents
router.post('/pupils', createPupil);
router.get('/parents', listParents);
router.post('/pupils/:id/guardians', linkGuardian);
router.delete('/pupils/:id/guardians/:userId', unlinkGuardian);

router.get('/payments', orgAdminOnly, listAllPayments);
router.get('/billing/overview', orgAdminOnly, getBillingOverview);
router.get('/fleet/overview', getFleetOverview);

// Slot management
router.post('/slots', createSlot);
router.get('/slots', listSlotsAdmin);

// Vehicle logs & safety checklist
router.post('/vehicles/logs', addVehicleLog);
router.get('/vehicles/logs/:busId?', listVehicleLogs);
router.get('/vehicles/safety/:busId?', getSafetyChecklist);
router.post('/vehicles/safety', toggleSafetyCheck);

export default router;
