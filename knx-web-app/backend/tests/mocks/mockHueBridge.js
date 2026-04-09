'use strict';
/**
 * Mock Philips Hue Bridge v1 HTTP server.
 *
 * Starts an Express server on a dynamic port that faithfully mimics the
 * Hue Bridge local REST API used by hueService.js.
 *
 * Usage:
 *   const bridge = new MockHueBridge();
 *   await bridge.start();
 *   // bridge.baseUrl  — e.g. "http://127.0.0.1:54321"
 *   // bridge.apiKey   — the hardcoded test key to use in requests
 *   bridge.setLinkButtonPressed(true); // allow pairing
 *   bridge.recordedActions            // inspect PUT /groups/:id/action calls
 *   await bridge.stop();
 */

const express = require('express');
const http = require('http');
const { HUE_LIGHTS, HUE_GROUPS, HUE_SCENES } = require('../fixtures/hueFixtures');

const TEST_API_KEY = 'test-api-key-12345';

class MockHueBridge {
  constructor() {
    this._app = express();
    this._app.use(express.json());
    this._server = null;
    this._linkButtonPressed = false;
    this.recordedActions = [];
    this.recordedLightStates = {};
    this.apiKey = TEST_API_KEY;
    this.baseUrl = '';

    this._setupRoutes();
  }

  _setupRoutes() {
    const app = this._app;

    // ── Discovery endpoint (Hue cloud — used by meethue.com mock) ──
    // Not on the bridge itself; the backend fetches https://discovery.meethue.com
    // We test that separately via fetch mocking.

    // ── Pairing ──
    app.post('/api', (req, res) => {
      if (this._linkButtonPressed) {
        res.json([{ success: { username: TEST_API_KEY, clientkey: 'clientkey123' } }]);
      } else {
        res.json([{ error: { type: 101, address: '/api', description: 'link button not pressed' } }]);
      }
    });

    // ── Lights ──
    app.get('/api/:key/lights', (req, res) => {
      if (req.params.key !== TEST_API_KEY) return res.status(403).json({ error: 'unauthorized' });
      res.json(HUE_LIGHTS);
    });

    app.put('/api/:key/lights/:id/state', (req, res) => {
      if (req.params.key !== TEST_API_KEY) return res.status(403).json({ error: 'unauthorized' });
      const id = req.params.id;
      this.recordedLightStates[id] = req.body;
      res.json([{ success: { [`/lights/${id}/state/on`]: req.body.on } }]);
    });

    // ── Groups (Rooms) ──
    app.get('/api/:key/groups', (req, res) => {
      if (req.params.key !== TEST_API_KEY) return res.status(403).json({ error: 'unauthorized' });
      res.json(HUE_GROUPS);
    });

    app.put('/api/:key/groups/:id/action', (req, res) => {
      if (req.params.key !== TEST_API_KEY) return res.status(403).json({ error: 'unauthorized' });
      this.recordedActions.push({ groupId: req.params.id, body: req.body });
      res.json([{ success: { 'address': `/groups/${req.params.id}/action/on`, 'value': req.body.on } }]);
    });

    // ── Scenes ──
    app.get('/api/:key/scenes', (req, res) => {
      if (req.params.key !== TEST_API_KEY) return res.status(403).json({ error: 'unauthorized' });
      res.json(HUE_SCENES);
    });

    app.get('/api/:key/scenes/:id', (req, res) => {
      if (req.params.key !== TEST_API_KEY) return res.status(403).json({ error: 'unauthorized' });
      const scene = HUE_SCENES[req.params.id];
      if (!scene) return res.status(404).json({ error: 'not found' });
      res.json(scene);
    });
  }

  /** Allow or deny pairing (simulates pressing/not pressing the link button) */
  setLinkButtonPressed(pressed) {
    this._linkButtonPressed = pressed;
  }

  /** Reset all recorded call history */
  resetRecordings() {
    this.recordedActions = [];
    this.recordedLightStates = {};
  }

  start() {
    return new Promise((resolve) => {
      this._server = http.createServer(this._app);
      this._server.listen(0, '127.0.0.1', () => {
        const port = this._server.address().port;
        this.baseUrl = `http://127.0.0.1:${port}`;
        resolve(this.baseUrl);
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (!this._server) return resolve();
      this._server.close(resolve);
    });
  }
}

module.exports = MockHueBridge;
