'use strict';

const path = require('path');
const express = require('express');
const request = require('supertest');
const { mountFrontendShell } = require('../../frontendFallback');

function buildApp() {
  const app = express();
  const distPath = path.join(__dirname, '../../../frontend/dist');
  mountFrontendShell(app, distPath);

  app.use((req, res) => {
    res.status(404).send('fallback-miss');
  });

  return app;
}

describe('frontend shell routing', () => {
  it('serves index.html for apartment root urls', async () => {
    const app = buildApp();
    const res = await request(app).get('/wohnung-ost-neu');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<div id="root"></div>');
  });

  it('serves index.html for apartment section urls', async () => {
    const app = buildApp();
    const res = await request(app).get('/wohnung-ost-neu/connections');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<div id="root"></div>');
  });

  it('serves static assets normally', async () => {
    const app = buildApp();
    const res = await request(app).get('/favicon.svg');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/svg\+xml/);
  });

  it('does not turn api-like routes into index.html', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/config');

    expect(res.status).toBe(404);
    expect(res.text).toBe('fallback-miss');
  });
});
