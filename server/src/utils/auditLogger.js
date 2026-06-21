import prisma from '../config/prisma.js';

export const createAuditLog = async (adminId, action, targetType, targetId) => {
  try {
    await prisma.auditLog.create({
      data: {
        adminId,
        action,
        targetType,
        targetId: targetId ? String(targetId) : null
      }
    });
  } catch (error) {
    console.error('Audit Log Error:', error);
  }
};
