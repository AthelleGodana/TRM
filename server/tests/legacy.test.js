import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { createOrg, db, truncateAll } from './helpers.js';

const app = createApp();

beforeAll(async () => {
  await truncateAll();
  const org = await createOrg();
  await db.user.create({
    data: {
      username: 'oldtimer', password: await bcrypt.hash('password123', 10), firstName: 'Old', lastName: 'Timer',
      memberships: { create: { organizationId: org.id, role: 'DRIVER' } },
    },
  });
});
afterAll(() => db.$disconnect());

describe('legacy password login', () => {
  it('is disabled by default', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'oldtimer', password: 'password123' });
    expect(res.status).toBe(410);
  });

  it('self-registration is gone', async () => {
    const res = await request(app).post('/api/auth/register')
      .send({ username: 'newbie', password: 'password123', firstName: 'N', lastName: 'B', role: 'student' });
    expect(res.status).toBe(410);
  });

  it('can be re-enabled for a migration window', async () => {
    env.legacyPasswordLogin = true;
    try {
      const ok = await request(app).post('/api/auth/login').send({ username: 'oldtimer', password: 'password123' });
      expect(ok.status).toBe(200);
      const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${ok.body.token}`);
      expect(me.body.session.role).toBe('DRIVER');
      const bad = await request(app).post('/api/auth/login').send({ username: 'oldtimer', password: 'nope' });
      expect(bad.status).toBe(401);
    } finally {
      env.legacyPasswordLogin = false;
    }
  });
});
