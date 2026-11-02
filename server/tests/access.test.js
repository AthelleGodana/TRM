import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pruneGpsLogs } from '../src/jobs/gpsRetention.js';
import { bearer, createMember, createOrg, db, truncateAll } from './helpers.js';
import { googleToken, nextSub, stubGoogleCerts } from './google.js';

// Access flow without email: requesters see where their request stands,
// admins get badge counts, and people can be invited in bulk from a CSV.
const app = createApp();

beforeAll(async () => {
  await truncateAll();
  stubGoogleCerts();
});
afterAll(() => db.$disconnect());

const signIn = (opts) => request(app).post('/api/auth/google').send({ credential: googleToken(opts) });
const askAccess = (token, org) => request(app).post('/api/onboarding/access-requests')
  .set('Authorization', `Bearer ${token}`).send({ organizationCode: org.slug });
const bulk = (admin, rows) => request(app).post('/api/org/invitations/bulk').set('Authorization', bearer(admin)).send({ rows });

describe('access request status on sign-in', () => {
  it('shows a pending request instead of the onboarding form, without a session', async () => {
    const org = await createOrg({ name: 'Pending Uni' });
    const sub = nextSub();
    const first = await signIn({ sub, email: 'waiting@x.test' });
    expect(first.body.status).toBe('NEEDS_ONBOARDING');
    expect((await askAccess(first.body.onboardingToken, org)).status).toBe(201);

    const again = await signIn({ sub, email: 'waiting@x.test' });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ status: 'ACCESS_PENDING', organizations: ['Pending Uni'] });
    expect(again.body.onboardingToken).toBeTruthy();
    expect(again.body.accessToken).toBeUndefined();
    expect([].concat(again.headers['set-cookie'] || []).some((c) => c.startsWith('tt_refresh='))).toBe(false);
  });

  it('reports a rejected request, and a new request makes it pending again', async () => {
    const org = await createOrg({ name: 'Strict Co', profile: 'COMPANY' });
    const admin = await createMember(org, 'ORG_ADMIN');
    const sub = nextSub();
    const first = await signIn({ sub, email: 'declined@x.test' });
    await askAccess(first.body.onboardingToken, org);
    const { id } = (await db.accessRequest.findFirst({ where: { organizationId: org.id } }));
    expect((await request(app).post(`/api/org/access-requests/${id}/reject`).set('Authorization', bearer(admin))).status).toBe(200);

    const rejected = await signIn({ sub, email: 'declined@x.test' });
    expect(rejected.body).toMatchObject({ status: 'ACCESS_REJECTED', organizations: ['Strict Co'] });

    await askAccess(rejected.body.onboardingToken, org);
    expect((await signIn({ sub, email: 'declined@x.test' })).body.status).toBe('ACCESS_PENDING');
  });

  it('carries the status in the redirect-mode fragment', async () => {
    const org = await createOrg();
    const sub = nextSub();
    const first = await signIn({ sub, email: 'redirect-wait@x.test' });
    await askAccess(first.body.onboardingToken, org);
    const res = await request(app).post('/api/auth/google/redirect').type('form')
      .set('Cookie', 'g_csrf_token=abc')
      .send({ credential: googleToken({ sub, email: 'redirect-wait@x.test' }), g_csrf_token: 'abc' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toMatch(/\/onboarding#token=[^&]+&status=ACCESS_PENDING$/);
  });
});

describe('admin summary counts', () => {
  it('counts only this organisation\'s pending requests and live invitations', async () => {
    const orgA = await createOrg();
    const orgB = await createOrg();
    const adminA = await createMember(orgA, 'ORG_ADMIN');
    const adminB = await createMember(orgB, 'ORG_ADMIN');
    const outsider = await db.user.create({ data: { firstName: 'Out', lastName: 'Sider', email: 'outsider@x.test' } });
    await db.accessRequest.create({ data: { organizationId: orgB.id, userId: outsider.id } });
    const future = new Date(Date.now() + 86400000);
    await db.invitation.createMany({
      data: [
        { organizationId: orgB.id, email: 'b1@x.test', role: 'DRIVER', expiresAt: future },
        { organizationId: orgB.id, email: 'b2@x.test', role: 'DRIVER', expiresAt: new Date(Date.now() - 1000) },
        { organizationId: orgA.id, email: 'a1@x.test', role: 'DRIVER', expiresAt: future },
      ],
    });

    const a = await request(app).get('/api/org/summary').set('Authorization', bearer(adminA));
    expect(a.body).toEqual({ pendingAccessRequests: 0, pendingInvitations: 1 });
    const b = await request(app).get('/api/org/summary').set('Authorization', bearer(adminB));
    expect(b.body).toEqual({ pendingAccessRequests: 1, pendingInvitations: 1 });
  });

  it('is for ORG_ADMIN only', async () => {
    const org = await createOrg();
    const officer = await createMember(org, 'FLEET_MANAGER');
    expect((await request(app).get('/api/org/summary').set('Authorization', bearer(officer))).status).toBe(403);
  });
});

describe('bulk CSV invitations', () => {
  it('creates valid rows and reports the rest with reasons', async () => {
    const org = await createOrg({ profile: 'UNIVERSITY' });
    const admin = await createMember(org, 'ORG_ADMIN');
    await createMember(org, 'DRIVER', { email: 'already@x.test' });
    const res = await bulk(admin, [
      { email: 'New.Student@x.test', role: 'student' },
      { email: 'driver1@x.test', role: 'DRIVER' },
      { email: 'not-an-email', role: 'DRIVER' },
      { email: 'parent@x.test', role: 'PARENT' },
      { email: 'already@x.test', role: 'DRIVER' },
      { email: 'driver1@x.test', role: 'DRIVER' },
      { email: 'kid@x.test', role: 'DRIVER', childFirstName: 'A', childLastName: 'B' },
    ]);
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(2);
    expect(res.body.skipped.map((s) => [s.row, s.reason])).toEqual([
      [3, 'Invalid email address.'],
      [4, 'That role is not available for this organisation.'],
      [5, 'Already a member.'],
      [6, 'Duplicate row.'],
      [7, 'Only PARENT rows can name a child.'],
    ]);
    const invitations = await db.invitation.findMany({ where: { organizationId: org.id }, orderBy: { email: 'asc' } });
    expect(invitations.map((i) => [i.email, i.role])).toEqual([['driver1@x.test', 'DRIVER'], ['new.student@x.test', 'STUDENT']]);
  });

  it('ignores members of other organisations and replaces pending invitations', async () => {
    const mine = await createOrg({ profile: 'COMPANY' });
    const other = await createOrg({ profile: 'COMPANY' });
    const admin = await createMember(mine, 'ORG_ADMIN');
    await createMember(other, 'DRIVER', { email: 'elsewhere@x.test' });
    expect((await bulk(admin, [{ email: 'elsewhere@x.test', role: 'DRIVER' }])).body.created).toBe(1);
    expect((await bulk(admin, [{ email: 'elsewhere@x.test', role: 'FLEET_MANAGER' }])).body.created).toBe(1);

    const rows = await db.invitation.findMany({ where: { email: 'elsewhere@x.test' }, orderBy: { id: 'asc' } });
    expect(rows.map((r) => [r.organizationId, r.status, r.role])).toEqual([
      [mine.id, 'REVOKED', 'DRIVER'],
      [mine.id, 'PENDING', 'FLEET_MANAGER'],
    ]);
    expect(await db.membership.count({ where: { organizationId: other.id } })).toBe(1);
  });

  it('rejects empty and oversized imports', async () => {
    const org = await createOrg();
    const admin = await createMember(org, 'ORG_ADMIN');
    expect((await bulk(admin, [])).status).toBe(400);
    const many = Array.from({ length: 501 }, (_, i) => ({ email: `p${i}@x.test`, role: 'DRIVER' }));
    expect((await bulk(admin, many)).status).toBe(400);
  });

  it('creates and links a school parent\'s children on first sign-in, once', async () => {
    const school = await createOrg({ profile: 'SCHOOL' });
    const admin = await createMember(school, 'ORG_ADMIN');
    const rows = [
      { email: 'mum@x.test', role: 'PARENT', childFirstName: 'Baraka', childLastName: 'Otieno' },
      { email: 'mum@x.test', role: 'PARENT', childFirstName: 'Zawadi', childLastName: 'Otieno' },
      { email: 'half@x.test', role: 'PARENT', childFirstName: 'Only' },
    ];
    const res = await bulk(admin, rows);
    expect(res.body).toMatchObject({ created: 1, skipped: [{ row: 3, reason: 'Give both the child\'s first and last name.' }] });

    const sub = nextSub();
    const signedIn = await signIn({ sub, email: 'mum@x.test' });
    expect(signedIn.body.session.role).toBe('PARENT');
    const children = await request(app).get('/api/parents/children').set('Authorization', `Bearer ${signedIn.body.accessToken}`);
    expect(children.status).toBe(200);

    const user = await db.user.findUnique({ where: { email: 'mum@x.test' } });
    const links = await db.passengerGuardian.findMany({ where: { userId: user.id }, include: { student: true } });
    expect(links.map((l) => l.student.firstName).sort()).toEqual(['Baraka', 'Zawadi']);
    expect(links.every((l) => l.organizationId === school.id && l.student.organizationId === school.id)).toBe(true);

    // Removing the parent and importing the same rows again reuses the pupils.
    const member = await db.membership.findFirst({ where: { userId: user.id } });
    await db.membership.delete({ where: { id: member.id } });
    await bulk(admin, rows.slice(0, 2));
    await signIn({ sub, email: 'mum@x.test' });
    expect(await db.student.count({ where: { organizationId: school.id, lastName: 'Otieno' } })).toBe(2);
  });
});

describe('GPS retention', () => {
  it('deletes only points older than the window, and does nothing when disabled', async () => {
    const org = await createOrg();
    const bus = await db.bus.create({ data: { organizationId: org.id, licensePlate: 'KGP 001A', capacity: 30 } });
    const day = 86400000;
    const now = new Date();
    await db.gpsLog.createMany({
      data: [100, 91, 89, 1].map((d) => ({ organizationId: org.id, busId: bus.id, lat: 0, lng: 0, recordedAt: new Date(now - d * day) })),
    });
    expect(await pruneGpsLogs(0, now)).toBe(0);
    expect(await pruneGpsLogs(90, now)).toBe(2);
    expect(await db.gpsLog.count({ where: { busId: bus.id } })).toBe(2);
  });
});
