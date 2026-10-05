import prisma from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Aggregates payment data into figures the admin billing dashboard can
// render directly: total revenue, revenue by month, tier breakdown, and
// counts by status. All computed from the Payment table — no new tables
// needed for this scope addition.
export const getBillingOverview = asyncHandler(async (req, res) => {
  const payments = await prisma.payment.findMany({
    where: { status: 'PAID' },
    include: { student: { select: { paymentTier: true } } },
  });

  const totalRevenue = payments.reduce((sum, p) => sum + Number(p.amount), 0);

  const byMonth = {};
  for (const p of payments) {
    const key = p.createdAt.toISOString().slice(0, 7); // YYYY-MM
    byMonth[key] = (byMonth[key] || 0) + Number(p.amount);
  }
  const revenueByMonth = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, revenue]) => ({ month, revenue }));

  const byTier = { TOWN: 0, LAVINGTON: 0, ADAMS: 0 };
  for (const p of payments) {
    const tier = p.student?.paymentTier;
    if (tier) byTier[tier] += Number(p.amount);
  }
  const revenueByTier = Object.entries(byTier).map(([tier, revenue]) => ({ tier, revenue }));

  const [paidCount, pendingCount, failedCount] = await Promise.all([
    prisma.payment.count({ where: { status: 'PAID' } }),
    prisma.payment.count({ where: { status: 'PENDING' } }),
    prisma.payment.count({ where: { status: 'FAILED' } }),
  ]);

  res.json({
    totalRevenue,
    revenueByMonth,
    revenueByTier,
    counts: { paid: paidCount, pending: pendingCount, failed: failedCount },
  });
});
