import express from 'express';
import {
  getStudentProfile,
  getDriverTrips,
  getAllBuses,
  createRoute,
  getPickupPoints,
  updateStudentSchedule,
  getCapacityPlanning
} from '../controllers/featureController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Student Routes
router.get('/student/profile', protect, authorize('STUDENT'), getStudentProfile);
router.post('/student/schedule', protect, authorize('STUDENT'), updateStudentSchedule);

// Driver Routes
router.get('/driver/trips', protect, authorize('DRIVER'), getDriverTrips);

// Admin Routes
router.get('/admin/buses', protect, authorize('ADMIN'), getAllBuses);
router.post('/admin/routes', protect, authorize('ADMIN'), createRoute);
router.get('/admin/capacity-planning', protect, authorize('ADMIN'), getCapacityPlanning);
router.get('/pickup-points', protect, getPickupPoints);

export default router;
