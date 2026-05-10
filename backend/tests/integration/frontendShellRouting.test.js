'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');
const { mountFrontendShell } = require('../../frontendFallback');

function buildApp(distPath) {
  const app = express();
  mountFrontendShell(app, distPath);

  app.use((req, res) => {
    res.status(404).send('fallback-miss');
  });

  return app;
}

describe('frontend shell routing', () => {
  let distPath;

  beforeEach(() => {
    distPath = fs.mkdtempSync(path.join(os.tmpdir(), 'knx-frontend-shell-'));
    fs.writeFileSync(
      path.join(distPath, 'index.html'),
      '<!doctype html><html><body><div id="root"></div></body></html>',
    );
    fs.writeFileSync(
      path.join(distPath, 'favicon.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    );
  });

  afterEach(() => {
    fs.rmSync(distPath, { recursive: true, force: true });
  });

  it('serves index.html for apartment root urls', async () => {
    const app = buildApp(distPath);
    const res = await request(app).get('/wohnung-ost-neu');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<div id="root"></div>');
  });

  it('serves index.html for apartment section urls', async () => {
    const app = buildApp(distPath);
    const res = await request(app).get('/wohnung-ost-neu/connections');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<div id="root"></div>');
  });

  it('serves static assets normally', async () => {
    const app = buildApp(distPath);
    const res = await request(app).get('/favicon.svg');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/svg\+xml/);
  });

  it('does not turn api-like routes into index.html', async () => {
    const app = buildApp(distPath);
    const res = await request(app).get('/api/config');

    expect(res.status).toBe(404);
    expect(res.text).toBe('fallback-miss');
  });
});
