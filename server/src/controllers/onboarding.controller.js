import { systemPrisma as db } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { verifyOnboardingToken } from '../services/session.service.js';

const PROFILES = ['UNIVERSITY', 'SCHOOL', 'COMPANY'];

// Authenticates a Google user who has no organisation yet, using the
// short-lived onboarding token returned by /auth/google.
export function requireOnboardingToken(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  try {
    req.onboardingUserId = verifyOnboardingToken(token).userId;
    next();
  } catch {
    res.status(401).json({ error: 'Please sign in with Google again.' });
  }
}

function slugify(name) {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'org';
}

async function uniqueSlug(name) {
  const base = slugify(name);
  for (let i = 0; i < 50; i += 1) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    if (!(await db.organization.findUnique({ where: { slug } }))) return slug;
  }
  return `${base}-${Date.now()}`;
}

// POST /onboarding/access-requests — { organizationCode, message }
// Asks an existing organisation for access. The organisation code is the
// slug its administrator shares; there is no public directory.
export const requestAccess = asyncHandler(async (req, res) => {
  const code = String(req.body?.organizationCode || '').trim().toLowerCase();
  const message = req.body?.message ? String(req.body.message).slice(0, 500) : null;
  const org = code && await db.organization.findFirst({ where: { slug: code, status: 'ACTIVE' } });
  if (!org) return res.status(404).json({ error: 'No active organisation uses that code.' });

  await db.accessRequest.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: req.onboardingUserId } },
    update: { status: 'PENDING', message, reviewedAt: null, reviewedById: null },
    create: { organizationId: org.id, userId: req.onboardingUserId, message },
  });
  res.status(201).json({ message: `Your request was sent to ${org.name}. You can sign in once an administrator approves it.` });
});

// POST /onboarding/organizations — { name, profile }
// Registers a new organisation. It stays PENDING (and its creator cannot
// sign in to it) until a SUPER_ADMIN approves it.
export const registerOrganization = asyncHandler(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const profile = req.body?.profile;
  if (name.length < 3 || name.length > 120) {
    return res.status(400).json({ error: 'Organisation name must be 3 to 120 characters.' });
  }
  if (!PROFILES.includes(profile)) {
    return res.status(400).json({ error: 'Choose University, School or Company.' });
  }

  const org = await db.$transaction(async (tx) => {
    const created = await tx.organization.create({
      data: { name, profile, slug: await uniqueSlug(name), status: 'PENDING' },
    });
    await tx.membership.create({
      data: { organizationId: created.id, userId: req.onboardingUserId, role: 'ORG_ADMIN' },
    });
    return created;
  });

  res.status(201).json({
    status: 'ORG_PENDING',
    organization: { name: org.name, slug: org.slug, profile: org.profile },
    message: 'Thanks! Your organisation is awaiting approval. We will let you in as soon as it is approved.',
  });
});
