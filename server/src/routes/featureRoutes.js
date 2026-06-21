import express from 'express';
import {
  getStudentProfile,
  getDriverTrips,
  getAllBuses,
  createRoute,
  getPickupPoints
} from '../controllers/featureController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Student Routes
router.get('/student/profile', protect, authorize('STUDENT'), getStudentProfile);

// Driver Routes
router.get('/driver/trips', protect, authorize('DRIVER'), getDriverTrips);

// Admin Routes
router.get('/admin/buses', protect, authorize('ADMIN'), getAllBuses);
router.post('/admin/routes', protect, authorize('ADMIN'), createRoute);
router.get('/pickup-points', protect, getPickupPoints);

export default router;
