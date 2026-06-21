import prisma from '../config/prisma.js';
import { createAuditLog } from '../utils/auditLogger.js';

// Helper to validate tier access
const TIER_ORDER = ['TOWN', 'LAVINGTON', 'ADAMS'];
const canAccess = (studentTier, pointTier) => {
  return TIER_ORDER.indexOf(studentTier) >= TIER_ORDER.indexOf(pointTier);
};

// STUDENT CONTROLLERS
export const getStudentProfile = async (req, res) => {
  try {
    const student = await prisma.student.findUnique({
      where: { userId: req.user.id },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        pickupPoint: true,
        bus: { include: { route: true } },
        payments: { orderBy: { createdAt: 'desc' } }
      }
    });
    res.json(student);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DRIVER CONTROLLERS
export const getDriverTrips = async (req, res) => {
  try {
    const driver = await prisma.driver.findUnique({
      where: { userId: req.user.id },
      include: {
        bus: {
          include: {
            route: { include: { pickupPoints: true } },
            students: { include: { user: { select: { firstName: true, lastName: true } } } },
            trips: { orderBy: { createdAt: 'desc' }, take: 5 }
          }
        }
      }
    });
    res.json(driver);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ADMIN CONTROLLERS
export const getAllBuses = async (req, res) => {
  try {
    const buses = await prisma.bus.findMany({
      include: { route: true, driver: { include: { user: true } } }
    });
    res.json(buses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createRoute = async (req, res) => {
  try {
    const { name, description } = req.body;
    const route = await prisma.route.create({
      data: { name, description }
    });

    await createAuditLog(req.user.id, 'CREATE_ROUTE', 'Route', route.id);

    res.status(201).json(route);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getPickupPoints = async (req, res) => {
  try {
    const points = await prisma.pickupPoint.findMany({
      include: { route: true }
    });
    res.json(points);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
