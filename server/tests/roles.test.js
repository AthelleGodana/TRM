import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { isRoleAllowed, rolesForProfile } from '../src/config/roles.js';
import { signAccessToken } from '../src/services/token.service.js';
import { bearer, createMember, createOrg, truncateAll, db as prisma } from './helpers.js';

const app = createApp();

beforeAll(truncateAll);
afterAll(() => prisma.$disconnect());

describe('profile role map', () => {
  it('allows only the roles defined for each profile', () => {
    expect(rolesForProfile('UNIVERSITY').map((r) => r.role)).toEqual(['ORG_ADMIN', 'FLEET_MANAGER', 'DRIVER', 'STUDENT']);
    expect(rolesForProfile('SCHOOL').map((r) => r.role)).toEqual(['ORG_ADMIN', 'FLEET_MANAGER', 'DRIVER', 'PARENT']);
    expect(rolesForProfile('COMPANY').map((r) => r.role)).toEqual(['ORG_ADMIN', 'FLEET_MANAGER', 'DRIVER']);
    expect(isRoleAllowed('SCHOOL', 'STUDENT')).toBe(false);
    expect(isRoleAllowed('COMPANY', 'PARENT')).toBe(false);
    expect(isRoleAllowed('UNIVERSITY', 'SUPER_ADMIN')).toBe(false);
  });

  it('labels FLEET_MANAGER as "Transport officer" for universities and schools', () => {
    const label = (p) => rolesForProfile(p).find((r) => r.role === 'FLEET_MANAGER').label;
    expect(label('UNIVERSITY')).toBe('Transport officer');
    expect(label('SCHOOL')).toBe('Transport officer');
    expect(label('COMPANY')).toBe('Fleet manager');
  });
});

describe('access token checks', () => {
  it('rejects tokens signed with another secret or expired', async () => {
    const forged = jwt.sign({ typ: 'access', userId: 1, organizationId: 1, role: 'ORG_ADMIN' }, 'wrong', { issuer: 'transtrack' });
    expect((await request(app).get('/api/admin/buses').set('Authorization', `Bearer ${forged}`)).status).toBe(401);

    const expired = jwt.sign(
      { typ: 'access', userId: 1, organizationId: 1, role: 'ORG_ADMIN', exp: Math.floor(Date.now() / 1000) - 10 },
      process.env.JWT_SECRET, { issuer: 'transtrack' }
    );
    expect((await request(app).get('/api/admin/buses').set('Authorization', `Bearer ${expired}`)).status).toBe(401);
  });

  it('rejects a token whose role no longer matches the membership', async () => {
    const org = await createOrg();
    const member = await createMember(org, 'FLEET_MANAGER');
    const token = signAccessToken({ userId: member.user.id, organizationId: org.id, role: 'ORG_ADMIN' });
    expect((await request(app).get('/api/admin/payments').set('Authorization', `Bearer ${token}`)).status).toBe(401);
  });

  it('rejects members of a suspended organisation immediately', async () => {
    const org = await createOrg();
    const admin = await createMember(org, 'ORG_ADMIN');
    expect((await request(app).get('/api/admin/buses').set('Authorization', bearer(admin))).status).toBe(200);
    await prisma.organization.update({ where: { id: org.id }, data: { status: 'SUSPENDED' } });
    const res = await request(app).get('/api/admin/buses').set('Authorization', bearer(admin));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ORG_SUSPENDED');
  });

  it('rejects a role that the organisation profile does not allow', async () => {
    const org = await createOrg({ profile: 'COMPANY' });
    const student = await createMember(org, 'STUDENT');
    expect((await request(app).get('/api/students/profile').set('Authorization', bearer(student))).status).toBe(403);
  });

  it('keeps billing for ORG_ADMIN only', async () => {
    const org = await createOrg();
    const officer = await createMember(org, 'FLEET_MANAGER');
    const admin = await createMember(org, 'ORG_ADMIN');
    expect((await request(app).get('/api/admin/buses').set('Authorization', bearer(officer))).status).toBe(200);
    expect((await request(app).get('/api/admin/billing/overview').set('Authorization', bearer(officer))).status).toBe(403);
    expect((await request(app).get('/api/admin/billing/overview').set('Authorization', bearer(admin))).status).toBe(200);
  });
});
