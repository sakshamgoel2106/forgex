import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { LocalDevAuthAdapter } from '../src/auth/localDevAuthAdapter.js';
import { InMemoryDataStore } from '../src/db/inMemoryDataStore.js';
import { HACKATHON_DEMO_CREDENTIALS, seedHackathonDemo } from '../src/db/hackathonDemo.js';
import { config } from '../src/config/env.js';

describe('Hackathon demo seed', () => {
  it('creates the demo company, nine machine categories, and login accounts for each role', async () => {
    const dataStore = new InMemoryDataStore();
    const summary = await seedHackathonDemo(dataStore);
    const app = createApp({
      dataStore,
      authAdapter: new LocalDevAuthAdapter(config.JWT_SECRET),
    });

    expect(summary.machineCount).toBe(9);
    expect(summary.organizationName).toBe('ForgeX Hackathon Demo');

    for (const account of HACKATHON_DEMO_CREDENTIALS) {
      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: account.email, password: account.password });

      expect(login.status).toBe(200);
      expect(login.body.data.membership.role).toBe(account.role);
    }

    const seededAgain = await seedHackathonDemo(dataStore);
    expect(seededAgain.organizationId).toBe(summary.organizationId);
    expect(seededAgain.machineCount).toBe(9);
  });
});
