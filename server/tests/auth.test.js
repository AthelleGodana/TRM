import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { verifyAccessToken } from '../src/services/token.service.js';
import { ensureSuperAdmin, linkDefaultOrgAdmin } from '../src/services/bootstrap.js';
import { bearer, createMember, createOrg, db, truncateAll } from './helpers.js';
import { googleToken, nextSub, stubGoogleCerts, wrongKey } from './google.js';

const app = createApp();
const APP_HEADER = ['X-Transtrack-Request', '1'];

beforeAll(async () => {
  await truncateAll();
  stubGoogleCerts();
});
afterAll(() => db.$disconnect());

const signIn = (opts) => request(app).post('/api/auth/google').send({ credential: googleToken(opts) });

function refreshCookie(res) {
  const raw = [].concat(res.headers['set-cookie'] || []).find((c) => c.startsWith('tt_refresh='));
  return raw && raw.split(';')[0];
}

const refresh = (cookie) => request(app).post('/api/auth/refresh').set(...APP_HEADER).set('Cookie', cookie || '');

describe('Google token verification', () => {
  it('rejects a malformed token', async () => {
    const res = await request(app).post('/api/auth/google').send({ credential: 'not.a.jwt' });
    expect(res.status).toBe(401);
  });

  it('rejects a token signed by the wrong key', async () => {
    expect((await signIn({ email: 'a@x.test', key: wrongKey })).status).toBe(401);
  });

  it('rejects a token issued for another client ID', async () => {
    expect((await signIn({ email: 'a@x.test', audience: 'someone-else.apps.googleusercontent.com' })).status).toBe(401);
  });

  it('rejects an expired token', async () => {
    expect((await signIn({ email: 'a@x.test', expiresIn: -3600 })).status).toBe(401);
  });

  it('rejects an unverified email', async () => {
    const res = await signIn({ email: 'unverified@x.test', emailVerified: false });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/not verified/);
    expect(await db.user.findUnique({ where: { email: 'unverified@x.test' } })).toBeNull();
  });
});

describe('sign-in outcomes', () => {
  it('a new user without an invitation is sent to onboarding with no session', async () => {
    const res = await signIn({ email: 'newcomer@x.test' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('NEEDS_ONBOARDING');
    expect(res.body.onboardingToken).toBeTruthy();
    expect(res.body.accessToken).toBeUndefined();
    expect(refreshCookie(res)).toBeUndefined();
  });

  it('identifies users by Google sub and stores only sub, email, name and picture', async () => {
    const sub = nextSub();
    await signIn({ sub, email: 'first@x.test', name: 'First Name' });
    await signIn({ sub, email: 'changed@x.test', name: 'First Name' });
    const users = await db.user.findMany({ where: { googleSub: sub } });
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ email: 'changed@x.test', name: 'First Name', picture: 'https://example.com/p.png' });
    expect(Object.keys(users[0]).filter((k) => /token/i.test(k))).toEqual([]);
  });

  it('members of a suspended organisation cannot sign in', async () => {
    const org = await createOrg({ status: 'SUSPENDED' });
    const m = await createMember(org, 'ORG_ADMIN', { email: 'suspended@x.test' });
    const res = await signIn({ email: m.user.email });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ORG_SUSPENDED');
  });

  it('sets the refresh cookie as httpOnly, Secure, SameSite=Strict and scoped to /api/auth', async () => {
    const org = await createOrg();
    const m = await createMember(org, 'ORG_ADMIN', { email: 'cookie@x.test' });
    const res = await signIn({ email: m.user.email });
    const raw = res.headers['set-cookie'].find((c) => c.startsWith('tt_refresh='));
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/Secure/i);
    expect(raw).toMatch(/SameSite=Strict/i);
    expect(raw).toMatch(/Path=\/api\/auth/);
  });

  it('issues a 15-minute access token with userId, organizationId and role', async () => {
    const org = await createOrg();
    const m = await createMember(org, 'FLEET_MANAGER', { email: 'claims@x.test' });
    const res = await signIn({ email: m.user.email });
    const claims = verifyAccessToken(res.body.accessToken);
    expect(claims).toMatchObject({ userId: m.user.id, organizationId: org.id, role: 'FLEET_MANAGER' });
    expect(claims.exp - claims.iat).toBe(15 * 60);
    expect(res.body.session.roleLabel).toBe('Transport officer');
  });
});

describe('legacy user migration', () => {
  it('links an existing account by verified email on first Google sign-in', async () => {
    const org = await createOrg();
    const legacy = await db.user.create({
      data: {
        username: 'legacy1', password: 'hash', firstName: 'Old', lastName: 'User', email: 'legacy@x.test',
        memberships: { create: { organizationId: org.id, role: 'ORG_ADMIN' } },
      },
    });
    const res = await signIn({ email: 'legacy@x.test' });
    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.session.user.id).toBe(legacy.id);
    expect((await db.user.findUnique({ where: { id: legacy.id } })).googleSub).toBeTruthy();
  });

  it('DEFAULT_ORG_ADMIN_EMAIL attaches an email to the migrated default-org admin', async () => {
    const org = await db.organization.create({ data: { name: 'Default Organisation', slug: 'default', profile: 'UNIVERSITY', status: 'ACTIVE' } });
    const admin = await db.user.create({
      data: { username: 'admin', firstName: 'Sys', lastName: 'Admin', memberships: { create: { organizationId: org.id, role: 'ORG_ADMIN' } } },
    });
    await linkDefaultOrgAdmin('owner@x.test');
    const res = await signIn({ email: 'owner@x.test' });
    expect(res.body.session.user.id).toBe(admin.id);
    expect(res.body.session.organization.slug).toBe('default');
  });

  it('an admin can attach an email to a migrated member, but not to someone in another org', async () => {
    const org = await createOrg();
    const admin = await createMember(org, 'ORG_ADMIN');
    const legacy = await db.user.create({
      data: { firstName: 'No', lastName: 'Email', memberships: { create: { organizationId: org.id, role: 'DRIVER' } } },
      include: { memberships: true },
    });
    const ok = await request(app).put(`/api/org/members/${legacy.memberships[0].id}/email`)
      .set('Authorization', bearer(admin)).send({ email: 'claimed@x.test' });
    expect(ok.status).toBe(200);

    const other = await createOrg();
    const shared = await db.user.create({
      data: { firstName: 'Two', lastName: 'Orgs', memberships: { create: [{ organizationId: org.id, role: 'DRIVER' }, { organizationId: other.id, role: 'DRIVER' }] } },
      include: { memberships: true },
    });
    const mine = shared.memberships.find((m) => m.organizationId === org.id);
    const res = await request(app).put(`/api/org/members/${mine.id}/email`)
      .set('Authorization', bearer(admin)).send({ email: 'takeover@x.test' });
    expect(res.status).toBe(409);
  });
});

describe('invitations', () => {
  it('a matching invitation creates the membership on first Google sign-in', async () => {
    const org = await createOrg({ profile: 'UNIVERSITY' });
    const admin = await createMember(org, 'ORG_ADMIN');
    const inv = await request(app).post('/api/org/invitations').set('Authorization', bearer(admin))
      .send({ email: 'Invitee@X.test', role: 'STUDENT' });
    expect(inv.status).toBe(201);

    const res = await signIn({ email: 'invitee@x.test' });
    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.session).toMatchObject({ role: 'STUDENT', organization: { id: org.id } });
    const user = await db.user.findUnique({ where: { email: 'invitee@x.test' } });
    expect(await db.student.findFirst({ where: { organizationId: org.id, userId: user.id } })).toBeTruthy();
    expect((await db.invitation.findUnique({ where: { id: inv.body.invitation.id } })).status).toBe('ACCEPTED');
  });

  it('only allows roles permitted by the organisation profile', async () => {
    const school = await createOrg({ profile: 'SCHOOL' });
    const admin = await createMember(school, 'ORG_ADMIN');
    const invite = (role) => request(app).post('/api/org/invitations').set('Authorization', bearer(admin))
      .send({ email: `${role}@school.test`, role });
    expect((await invite('STUDENT')).status).toBe(400);
    expect((await invite('SUPER_ADMIN')).status).toBe(400);
    expect((await invite('PARENT')).status).toBe(201);
    expect((await invite('FLEET_MANAGER')).status).toBe(201);
  });

  it('ignores expired or revoked invitations', async () => {
    const org = await createOrg();
    await db.invitation.create({
      data: { organizationId: org.id, email: 'late@x.test', role: 'DRIVER', expiresAt: new Date(Date.now() - 1000) },
    });
    await db.invitation.create({
      data: { organizationId: org.id, email: 'revoked@x.test', role: 'DRIVER', status: 'REVOKED', expiresAt: new Date(Date.now() + 1e6) },
    });
    expect((await signIn({ email: 'late@x.test' })).body.status).toBe('NEEDS_ONBOARDING');
    expect((await signIn({ email: 'revoked@x.test' })).body.status).toBe('NEEDS_ONBOARDING');
  });

  it('only ORG_ADMIN can manage invitations', async () => {
    const org = await createOrg();
    const officer = await createMember(org, 'FLEET_MANAGER');
    const res = await request(app).post('/api/org/invitations').set('Authorization', bearer(officer))
      .send({ email: 'x@x.test', role: 'DRIVER' });
    expect(res.status).toBe(403);
  });
});

describe('onboarding', () => {
  it('a registered organisation stays PENDING and cannot sign in until a SUPER_ADMIN approves it', async () => {
    const sub = nextSub();
    const first = await signIn({ sub, email: 'founder@x.test' });
    const reg = await request(app).post('/api/onboarding/organizations')
      .set('Authorization', `Bearer ${first.body.onboardingToken}`)
      .send({ name: 'Nairobi Academy', profile: 'SCHOOL' });
    expect(reg.status).toBe(201);

    const pending = await signIn({ sub, email: 'founder@x.test' });
    expect(pending.status).toBe(403);
    expect(pending.body.code).toBe('ORG_PENDING');
    expect(refreshCookie(pending)).toBeUndefined();

    await ensureSuperAdmin();
    const root = await signIn({ email: env.superAdminEmail });
    expect(root.body.session.superAdmin).toBe(true);
    const org = await db.organization.findFirst({ where: { name: 'Nairobi Academy' } });
    const approve = await request(app).post(`/api/platform/organizations/${org.id}/approve`)
      .set('Authorization', `Bearer ${root.body.accessToken}`);
    expect(approve.status).toBe(200);

    const active = await signIn({ sub, email: 'founder@x.test' });
    expect(active.body.status).toBe('ACTIVE');
    expect(active.body.session).toMatchObject({ role: 'ORG_ADMIN', organization: { profile: 'SCHOOL' } });
  });

  it('an access request becomes a membership when an admin approves it', async () => {
    const org = await createOrg({ profile: 'COMPANY' });
    const admin = await createMember(org, 'ORG_ADMIN');
    const sub = nextSub();
    const first = await signIn({ sub, email: 'driver-wannabe@x.test' });
    const asked = await request(app).post('/api/onboarding/access-requests')
      .set('Authorization', `Bearer ${first.body.onboardingToken}`)
      .send({ organizationCode: org.slug, message: 'I drive bus 4' });
    expect(asked.status).toBe(201);

    const list = await request(app).get('/api/org/access-requests').set('Authorization', bearer(admin));
    expect(list.body.requests).toHaveLength(1);
    const id = list.body.requests[0].id;
    expect((await request(app).post(`/api/org/access-requests/${id}/approve`).set('Authorization', bearer(admin)).send({ role: 'STUDENT' })).status).toBe(400);
    expect((await request(app).post(`/api/org/access-requests/${id}/approve`).set('Authorization', bearer(admin)).send({ role: 'DRIVER' })).status).toBe(200);

    const res = await signIn({ sub, email: 'driver-wannabe@x.test' });
    expect(res.body.session.role).toBe('DRIVER');
  });

  it('the onboarding token cannot be used as an access token', async () => {
    const first = await signIn({ email: 'probe@x.test' });
    const res = await request(app).get('/api/admin/buses').set('Authorization', `Bearer ${first.body.onboardingToken}`);
    expect(res.status).toBe(401);
  });

  it('only SUPER_ADMIN can use platform routes', async () => {
    const org = await createOrg();
    const admin = await createMember(org, 'ORG_ADMIN');
    expect((await request(app).get('/api/platform/organizations').set('Authorization', bearer(admin))).status).toBe(403);
  });
});

describe('refresh tokens', () => {
  async function activeSession(email) {
    const org = await createOrg();
    const m = await createMember(org, 'ORG_ADMIN', { email });
    const res = await signIn({ email });
    return { org, member: m, cookie: refreshCookie(res) };
  }

  it('requires the app header (CSRF protection)', async () => {
    const { cookie } = await activeSession('csrf@x.test');
    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('rotates on every use and revokes the family when an old token is reused', async () => {
    const { cookie: c1, member } = await activeSession('rotate@x.test');
    const r1 = await refresh(c1);
    expect(r1.status).toBe(200);
    expect(verifyAccessToken(r1.body.accessToken).userId).toBe(member.user.id);
    const c2 = refreshCookie(r1);
    expect(c2).not.toBe(c1);

    const reuse = await refresh(c1);
    expect(reuse.status).toBe(401);
    // Reuse is treated as theft: the newer token is revoked too.
    expect((await refresh(c2)).status).toBe(401);
  });

  it('tolerates a concurrent refresh of the same token within the grace window', async () => {
    const original = env.refreshReuseGraceSeconds;
    env.refreshReuseGraceSeconds = 30;
    try {
      const { cookie } = await activeSession('tabs@x.test');
      const [a, b] = await Promise.all([refresh(cookie), refresh(cookie)]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect((await refresh(refreshCookie(a))).status).toBe(200);
    } finally {
      env.refreshReuseGraceSeconds = original;
    }
  });

  it('logout revokes the refresh token', async () => {
    const { cookie } = await activeSession('logout@x.test');
    const out = await request(app).post('/api/auth/logout').set(...APP_HEADER).set('Cookie', cookie);
    expect(out.status).toBe(200);
    expect((await refresh(cookie)).status).toBe(401);
  });

  it('refresh fails once the organisation is suspended', async () => {
    const { cookie, org } = await activeSession('later-suspended@x.test');
    await db.organization.update({ where: { id: org.id }, data: { status: 'SUSPENDED' } });
    const res = await refresh(cookie);
    expect(res.status).toBe(403);
  });

  it('rejects an unknown refresh token', async () => {
    expect((await refresh('tt_refresh=forged')).status).toBe(401);
  });
});

describe('organisation switching', () => {
  it('switches only to organisations the user belongs to', async () => {
    const orgA = await createOrg({ name: 'Switch A' });
    const orgB = await createOrg({ name: 'Switch B', profile: 'COMPANY' });
    const stranger = await createOrg({ name: 'Not mine' });
    const m = await createMember(orgA, 'ORG_ADMIN', { email: 'multi@x.test' });
    await db.membership.create({ data: { userId: m.user.id, organizationId: orgB.id, role: 'DRIVER' } });
    await db.driver.create({ data: { userId: m.user.id, organizationId: orgB.id } });

    const res = await signIn({ email: 'multi@x.test' });
    expect(res.body.session.memberships).toHaveLength(2);
    const cookie = refreshCookie(res);

    const denied = await request(app).post('/api/auth/switch-org').set(...APP_HEADER)
      .set('Authorization', `Bearer ${res.body.accessToken}`).set('Cookie', cookie)
      .send({ organizationId: stranger.id });
    expect(denied.status).toBe(404);

    const switched = await request(app).post('/api/auth/switch-org').set(...APP_HEADER)
      .set('Authorization', `Bearer ${res.body.accessToken}`).set('Cookie', cookie)
      .send({ organizationId: orgB.id });
    expect(switched.status).toBe(200);
    expect(verifyAccessToken(switched.body.accessToken)).toMatchObject({ organizationId: orgB.id, role: 'DRIVER' });

    // The refreshed session stays in the organisation switched to.
    const again = await refresh(refreshCookie(switched));
    expect(again.body.session.organization.id).toBe(orgB.id);
  });
});

describe('Google redirect mode (installed PWA fallback)', () => {
  it('rejects a post whose CSRF cookie does not match', async () => {
    const res = await request(app).post('/api/auth/google/redirect').type('form')
      .set('Cookie', 'g_csrf_token=abc').send({ credential: googleToken({ email: 'r@x.test' }), g_csrf_token: 'xyz' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toMatch(/login\?error=CSRF/);
  });

  it('sets the refresh cookie and returns to the app on success', async () => {
    const org = await createOrg();
    await createMember(org, 'ORG_ADMIN', { email: 'redirect@x.test' });
    const res = await request(app).post('/api/auth/google/redirect').type('form')
      .set('Cookie', 'g_csrf_token=abc').send({ credential: googleToken({ email: 'redirect@x.test' }), g_csrf_token: 'abc' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toMatch(/\/auth\/callback$/);
    expect(refreshCookie(res)).toBeTruthy();
  });
});
