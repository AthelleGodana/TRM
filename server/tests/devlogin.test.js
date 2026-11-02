import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { verifyAccessToken } from '../src/services/token.service.js';
import { createMember, createOrg, db, truncateAll } from './helpers.js';

const app = createApp();
let member;

beforeAll(async () => {
  await truncateAll();
  const org = await createOrg({ name: 'Demo Org' });
  member = await createMember(org, 'FLEET_MANAGER', { email: 'officer@demo.transtrack.local' });
  await createMember(org, 'ORG_ADMIN', { email: 'real.person@gmail.com' });
  const pending = await createOrg({ status: 'PENDING' });
  await createMember(pending, 'ORG_ADMIN', { email: 'pending@demo.transtrack.local' });
});
afterEach(() => { env.devLogin = false; env.nodeEnv = 'test'; });
afterAll(() => db.$disconnect());

const devLogin = (email) => request(app).post('/api/auth/dev-login').send({ email });

describe('development demo login', () => {
  it('is hidden by default', async () => {
    expect((await devLogin('officer@demo.transtrack.local')).status).toBe(404);
    expect((await request(app).get('/api/auth/dev-accounts')).status).toBe(404);
    expect((await request(app).get('/api/auth/config')).body.devLogin).toBe(false);
  });

  it('is never available in production, even with the flag on', async () => {
    env.devLogin = true;
    env.nodeEnv = 'production';
    expect((await devLogin('officer@demo.transtrack.local')).status).toBe(404);
  });

  it('signs in a demo user with a normal session and refresh cookie', async () => {
    env.devLogin = true;
    expect((await request(app).get('/api/auth/config')).body.devLogin).toBe(true);
    const res = await devLogin('Officer@demo.transtrack.local');
    expect(res.status).toBe(200);
    expect(verifyAccessToken(res.body.accessToken)).toMatchObject({ userId: member.user.id, role: 'FLEET_MANAGER' });
    expect(res.headers['set-cookie'].some((c) => c.startsWith('tt_refresh=') && /HttpOnly/i.test(c))).toBe(true);
  });

  it('lists only demo accounts', async () => {
    env.devLogin = true;
    const res = await request(app).get('/api/auth/dev-accounts');
    const emails = res.body.accounts.map((a) => a.email);
    expect(emails).toContain('officer@demo.transtrack.local');
    expect(emails).not.toContain('real.person@gmail.com');
  });

  it('refuses real accounts and unknown demo users', async () => {
    env.devLogin = true;
    expect((await devLogin('real.person@gmail.com')).status).toBe(403);
    expect((await devLogin('nobody@demo.transtrack.local')).status).toBe(404);
  });

  it('applies the same organisation checks as Google sign-in', async () => {
    env.devLogin = true;
    const res = await devLogin('pending@demo.transtrack.local');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ORG_PENDING');
  });
});
