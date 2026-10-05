import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  createRoute, listRoutesAdmin, updateBusAssignment, createBus, listBuses,
  listDrivers, listStudents, removeStudents, removeDrivers, listAllPayments,
} from '../controllers/admin.controller.js';
import { getBillingOverview } from '../controllers/analytics.controller.js';
import { getFleetOverview } from '../controllers/fleet.controller.js';
import {
  createSlot, listSlotsAdmin,
} from '../controllers/slot.controller.js';
import {
  setBusStatus, addVehicleLog, listVehicleLogs, getSafetyChecklist, toggleSafetyCheck,
} from '../controllers/vehicle.controller.js';

const router = Router();

// Every route below requires a valid JWT and the 'admin' role.
// This is the single enforcement point for admin RBAC — no admin
// controller function is reachable without passing both checks.
router.use(requireAuth, requireRole('admin'));

router.post('/routes', createRoute);
router.get('/routes', listRoutesAdmin);

router.post('/buses', createBus);
router.get('/buses', listBuses);
router.put('/buses/status', setBusStatus);
router.put('/buses/:id', updateBusAssignment);

router.get('/drivers', listDrivers);
router.post('/drivers/remove', removeDrivers);

router.get('/students', listStudents);
router.post('/students/remove', removeStudents);

router.get('/payments', listAllPayments);
router.get('/billing/overview', getBillingOverview);
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
