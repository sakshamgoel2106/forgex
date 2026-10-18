import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('Health and Diagnostics Endpoints', () => {
  const app = createApp();

  it('GET /healthz returns 200 and liveness status', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'UP');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('GET /livez returns 200 and liveness status', async () => {
    const res = await request(app).get('/livez');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'UP');
  });

  it('GET /readyz returns 200 and readiness status', async () => {
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'READY');
  });

  it('GET /api/v1/health returns detailed health check schema', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'HEALTHY');
    expect(res.body).toHaveProperty('version', '0.1.0');
    expect(res.body).toHaveProperty('checks');
    expect(res.body.checks).toHaveProperty('database');
    expect(res.body.checks).toHaveProperty('vectorStore');
    expect(res.body.checks).toHaveProperty('objectStorage');
    expect(res.body.checks).toHaveProperty('redis');
    expect(res.body.checks).toHaveProperty('inferenceProvider');
  });

  it('GET /non-existent-route returns 404 with structured error envelope', async () => {
    const res = await request(app).get('/api/v1/non-existent');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body.error).toHaveProperty('code', 'NOT_FOUND');
  });
});
