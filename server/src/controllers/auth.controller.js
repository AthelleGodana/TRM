import bcrypt from 'bcryptjs';
import { systemPrisma as prisma } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { signAccessToken } from '../services/token.service.js';

const PUBLIC_ROLES = { student: 'STUDENT', driver: 'DRIVER' };

// Picks the organisation a user lands in: the most recently used active
// membership, falling back to the oldest.
async function pickMembership(userId) {
  const memberships = await prisma.membership.findMany({
    where: { userId, organization: { status: 'ACTIVE' } },
    include: { organization: true },
    orderBy: [{ lastUsedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'asc' }],
  });
  return memberships[0] || null;
}

export const register = asyncHandler(async (req, res) => {
  const { username, password, firstName, lastName, role } = req.body;

  if (!username || username.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters.' });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  if (!firstName || !lastName) {
    return res.status(400).json({ error: 'First and last name are required.' });
  }
  if (!PUBLIC_ROLES[role]) {
    return res.status(400).json({ error: 'Invalid role selected.' });
  }

  // Legacy self-registration only exists for the migrated default organisation.
  const org = await prisma.organization.findUnique({ where: { slug: 'default' } });
  if (!org) {
    return res.status(400).json({ error: 'Self-registration is not available. Ask your organisation for an invitation.' });
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return res.status(409).json({ error: 'Username already taken.' });
  }

  const hashed = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      username, password: hashed, firstName, lastName,
      memberships: { create: { organizationId: org.id, role: PUBLIC_ROLES[role] } },
    },
  });

  if (role === 'student') {
    await prisma.student.create({ data: { userId: user.id, organizationId: org.id } });
  } else if (role === 'driver') {
    await prisma.driver.create({ data: { userId: user.id, organizationId: org.id } });
  }

  res.status(201).json({ message: 'Registration successful. Please log in.' });
});

export const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user?.password || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const membership = await pickMembership(user.id);
  if (!membership) {
    return res.status(403).json({ error: 'Your account is not linked to an active organisation.' });
  }

  const token = signAccessToken({
    userId: user.id, organizationId: membership.organizationId, role: membership.role,
  });

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      role: membership.role,
      organizationId: membership.organizationId,
    },
  });
});

export const me = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, username: true, firstName: true, lastName: true },
  });
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: { ...user, role: req.user.role, organizationId: req.user.organizationId } });
});
