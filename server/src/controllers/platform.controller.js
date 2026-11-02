import { systemPrisma as db } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Platform administration for SUPER_ADMIN. Works across organisations, so
// it uses the system client; none of these routes return tenant data
// beyond organisation metadata and counts.

const STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED'];

export const listOrganizations = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const organizations = await db.organization.findMany({
    where: STATUSES.includes(status) ? { status } : undefined,
    include: {
      _count: { select: { memberships: true, buses: true } },
      memberships: {
        where: { role: 'ORG_ADMIN' },
        select: { user: { select: { name: true, email: true } } },
        take: 3,
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({
    organizations: organizations.map(({ memberships, _count, ...org }) => ({
      ...org,
      admins: memberships.map((m) => m.user),
      memberCount: _count.memberships,
      busCount: _count.buses,
    })),
  });
});

function setStatus(status, extra = {}) {
  return asyncHandler(async (req, res) => {
    const id = Number(req.params.id) || 0;
    const org = await db.organization.findUnique({ where: { id } });
    if (!org) return res.status(404).json({ error: 'Organisation not found.' });
    const updated = await db.organization.update({ where: { id }, data: { status, ...extra(org) } });
    res.json({ organization: updated });
  });
}

export const approveOrganization = setStatus('ACTIVE', (org) => (org.approvedAt ? {} : { approvedAt: new Date() }));
export const suspendOrganization = setStatus('SUSPENDED', () => ({}));
export const reactivateOrganization = setStatus('ACTIVE', () => ({}));

export const updateFeatures = asyncHandler(async (req, res) => {
  const id = Number(req.params.id) || 0;
  const data = {};
  for (const key of ['fuelHubEnabled', 'aiFuelAnalyticsEnabled']) {
    if (typeof req.body?.[key] === 'boolean') data[key] = req.body[key];
  }
  const org = await db.organization.findUnique({ where: { id } });
  if (!org) return res.status(404).json({ error: 'Organisation not found.' });
  res.json({ organization: await db.organization.update({ where: { id }, data }) });
});
