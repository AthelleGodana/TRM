import { Router } from 'express';
import { requireAuth, requireFeature, requireRole } from '../middleware/auth.js';
import { STAFF_ROLES } from '../config/roles.js';
import {
  listRoutesAdmin, listStudents, removeStudents, removeDrivers, listAllPayments, assignStudentRoute,
} from '../controllers/admin.controller.js';
import { getBillingOverview } from '../controllers/analytics.controller.js';
import {
  createRoute, updateRoute, previewRoute, optimiseRoute, searchPlaces,
} from '../controllers/route.controller.js';
import { getFleetOverview } from '../controllers/fleet.controller.js';
import { createPupil, linkGuardian, unlinkGuardian, listParents } from '../controllers/pupil.controller.js';
import {
  createSlot, listSlotsAdmin, updateSlot, deleteSlot, getSlotTimetable,
} from '../controllers/slot.controller.js';
import {
  setBusStatus, addVehicleLog, listVehicleLogs, getSafetyChecklist, toggleSafetyCheck,
} from '../controllers/vehicle.controller.js';
import {
  listVehicles, getVehicle, createVehicle, updateVehicle, assignVehicleDriver, updateOdometer,
  archiveVehicle, restoreVehicle,
} from '../controllers/fleetAsset.controller.js';
import { listDriverProfiles, getDriverProfile, updateDriverProfile } from '../controllers/driverProfile.controller.js';
import {
  listSchedules, createSchedule, updateSchedule, deleteSchedule, listDue,
  listServiceRecords, createServiceRecord, updateServiceRecord, deleteServiceRecord,
  listDefects, updateDefect,
} from '../controllers/maintenance.controller.js';
import {
  listDocuments, createDocument, updateDocument, deleteDocument, uploadDocumentFile, downloadDocument,
  uploadMiddleware,
} from '../controllers/document.controller.js';

const router = Router();

// Every route below requires a valid access token and a staff role
// (ORG_ADMIN or FLEET_MANAGER). Routes touching money or removing people
// are further restricted to ORG_ADMIN. Passenger features are refused for
// organisations whose profile does not use them (e.g. COMPANY).
const orgAdminOnly = requireRole('ORG_ADMIN');
const passengers = requireFeature('passengers');
const studentBilling = requireFeature('studentBilling');
router.use(requireAuth, requireRole(...STAFF_ROLES));

// ── Routes & runs ─────────────────────────────────────────────────────────
router.post('/routes/preview', previewRoute);
router.post('/routes/optimise', optimiseRoute);
router.post('/routes', createRoute);
router.get('/routes', listRoutesAdmin);
router.put('/routes/:id', updateRoute);
router.get('/places', searchPlaces);

router.post('/slots', createSlot);
router.get('/slots', listSlotsAdmin);
router.put('/slots/:id', updateSlot);
router.delete('/slots/:id', deleteSlot);
router.get('/slots/:id/timetable', getSlotTimetable);

// ── Vehicles ──────────────────────────────────────────────────────────────
router.get('/buses', listVehicles);
router.post('/buses', createVehicle);
router.put('/buses/status', setBusStatus);
router.get('/buses/:id', getVehicle);
router.put('/buses/:id', updateVehicle);
router.post('/buses/:id/assign', assignVehicleDriver);
router.put('/buses/:id/odometer', updateOdometer);
router.post('/buses/:id/archive', archiveVehicle);
router.post('/buses/:id/restore', restoreVehicle);

// ── Drivers ───────────────────────────────────────────────────────────────
router.get('/drivers', listDriverProfiles);
router.post('/drivers/remove', orgAdminOnly, removeDrivers);
router.get('/drivers/:id', getDriverProfile);
router.put('/drivers/:id', updateDriverProfile);

// ── Maintenance ───────────────────────────────────────────────────────────
router.get('/maintenance/due', listDue);
router.get('/maintenance/schedules', listSchedules);
router.post('/maintenance/schedules', createSchedule);
router.put('/maintenance/schedules/:id', updateSchedule);
router.delete('/maintenance/schedules/:id', deleteSchedule);
router.get('/maintenance/services', listServiceRecords);
router.post('/maintenance/services', createServiceRecord);
router.put('/maintenance/services/:id', updateServiceRecord);
router.delete('/maintenance/services/:id', deleteServiceRecord);
router.get('/maintenance/defects', listDefects);
router.patch('/maintenance/defects/:id', updateDefect);

// ── Documents ─────────────────────────────────────────────────────────────
router.get('/documents', listDocuments);
router.post('/documents', createDocument);
router.put('/documents/:id', updateDocument);
router.delete('/documents/:id', deleteDocument);
router.post('/documents/:id/file', uploadMiddleware, uploadDocumentFile);
router.get('/documents/:id/file', downloadDocument);

// ── Passengers ────────────────────────────────────────────────────────────
router.get('/students', passengers, listStudents);
router.post('/students/remove', passengers, orgAdminOnly, removeStudents);
router.put('/students/:id/route', passengers, assignStudentRoute);

// Passenger records without accounts (school pupils) and their parents
router.post('/pupils', passengers, createPupil);
router.get('/parents', passengers, listParents);
router.post('/pupils/:id/guardians', passengers, linkGuardian);
router.delete('/pupils/:id/guardians/:userId', passengers, unlinkGuardian);

router.get('/payments', studentBilling, orgAdminOnly, listAllPayments);
router.get('/billing/overview', studentBilling, orgAdminOnly, getBillingOverview);
router.get('/fleet/overview', getFleetOverview);

// ── Vehicle logs & safety checklist ───────────────────────────────────────
router.post('/vehicles/logs', addVehicleLog);
router.get('/vehicles/logs/:busId?', listVehicleLogs);
router.get('/vehicles/safety/:busId?', getSafetyChecklist);
router.post('/vehicles/safety', toggleSafetyCheck);

export default router;
