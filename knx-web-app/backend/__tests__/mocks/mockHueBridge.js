/**
 * Mock Hue Bridge Server
 * Imitates Philips Hue Bridge v1 API for testing
 */

const express = require('express');
const EventEmitter = require('events');

class MockHueBridge extends EventEmitter {
  constructor(port = 8080) {
    super();
    this.port = port;
    this.app = express();
    this.server = null;
    this.paired = false;
    this.apiKey = null;
    this.linkButtonPressed = false;
    this.linkButtonTimeout = null;
    
    // Mock data store
    this.lights = new Map();
    this.rooms = new Map();
    this.scenes = new Map();
    
    this.setupRoutes();
    this.initializeMockData();
  }

  initializeMockData() {
    // Add some mock lights
    this.lights.set('1', {
      name: 'Living Room Lamp',
      type: 'Extended color light',
      modelid: 'LCT015',
      state: { on: false, reachable: true, bri: 254, hue: 0, sat: 0 }
    });
    this.lights.set('2', {
      name: 'Kitchen Spot 1',
      type: 'Extended color light',
      modelid: 'LCT015',
      state: { on: true, reachable: true, bri: 200, hue: 45000, sat: 254 }
    });
    this.lights.set('3', {
      name: 'Bedroom Ceiling',
      type: 'Dimmable light',
      modelid: 'LWB010',
      state: { on: false, reachable: true, bri: 100 }
    });
    this.lights.set('4', {
      name: 'Outdoor Light',
      type: 'Extended color light',
      modelid: 'LCT015',
      state: { on: false, reachable: false, bri: 0 }
    });

    // Add mock rooms (groups)
    this.rooms.set('1', {
      name: 'Living Room',
      type: 'Room',
      lights: ['1'],
      action: { on: false }
    });
    this.rooms.set('2', {
      name: 'Kitchen',
      type: 'Room',
      lights: ['2'],
      action: { on: true }
    });
    this.rooms.set('3', {
      name: 'Bedroom',
      type: 'Room',
      lights: ['3'],
      action: { on: false }
    });

    // Add mock scenes
    this.scenes.set('scene-1-abc', {
      name: 'Relax',
      type: 'GroupScene',
      group: '1',
      lights: ['1'],
      lightstates: { '1': { on: true, bri: 100 } }
    });
    this.scenes.set('scene-2-def', {
      name: 'Concentrate',
      type: 'GroupScene',
      group: '1',
      lights: ['1'],
      lightstates: { '1': { on: true, bri: 254 } }
    });
    this.scenes.set('scene-3-ghi', {
      name: 'Evening',
      type: 'GroupScene',
      group: '2',
      lights: ['2'],
      lightstates: { '2': { on: true, bri: 50 } }
    });
  }

  setupRoutes() {
    this.app.use(express.json());

    // Health check
    this.app.get('/', (req, res) => {
      res.json({ status: 'Mock Hue Bridge Running' });
    });

    // Create user (pairing)
    this.app.post('/api', (req, res) => {
      const { devicetype, generateclientkey } = req.body;
      
      if (!this.linkButtonPressed) {
        return res.status(200).json([{
          error: {
            type: 101,
            address: '',
            description: 'link button not pressed'
          }
        }]);
      }

      this.paired = true;
      this.apiKey = 'mock-api-key-' + Date.now();
      
      const response = [{
        success: {
          username: this.apiKey,
          clientkey: generateclientkey ? 'mock-client-key' : undefined
        }
      }];

      // Clear link button after successful pairing
      this.linkButtonPressed = false;
      if (this.linkButtonTimeout) {
        clearTimeout(this.linkButtonTimeout);
      }

      this.emit('paired', { apiKey: this.apiKey });
      res.json(response);
    });

    // API routes requiring authentication - need to match specific paths
    this.app.use('/api/:apiKey', (req, res, next) => {
      // Skip if not a subpath of apiKey
      if (req.path === '' || req.path === '/') {
        return next();
      }
      if (!this.paired) {
        return res.status(200).json([{
          error: {
            type: 1,
            address: req.path,
            description: 'unauthorized user'
          }
        }]);
      }
      
      if (req.params.apiKey !== this.apiKey) {
        return res.status(200).json([{
          error: {
            type: 1,
            address: req.path,
            description: 'unauthorized user'
          }
        }]);
      }
      
      next();
    });

    // Get all lights
    this.app.get('/api/:apiKey/lights', (req, res) => {
      const lightsObj = {};
      this.lights.forEach((light, id) => {
        lightsObj[id] = light;
      });
      res.json(lightsObj);
    });

    // Get single light
    this.app.get('/api/:apiKey/lights/:lightId', (req, res) => {
      const light = this.lights.get(req.params.lightId);
      if (!light) {
        return res.status(404).json({ error: 'Light not found' });
      }
      res.json(light);
    });

    // Set light state
    this.app.put('/api/:apiKey/lights/:lightId/state', (req, res) => {
      const light = this.lights.get(req.params.lightId);
      if (!light) {
        return res.status(404).json([{ error: 'Light not found' }]);
      }

      const updates = [];
      if (req.body.on !== undefined) {
        light.state.on = req.body.on;
        const onKey = '/lights/' + req.params.lightId + '/state/on';
        const onUpdate = { success: {} };
        onUpdate.success[onKey] = req.body.on;
        updates.push(onUpdate);
      }
      if (req.body.bri !== undefined) {
        light.state.bri = req.body.bri;
        const briKey = '/lights/' + req.params.lightId + '/state/bri';
        const briUpdate = { success: {} };
        briUpdate.success[briKey] = req.body.bri;
        updates.push(briUpdate);
      }
      if (req.body.hue !== undefined) {
        light.state.hue = req.body.hue;
      }
      if (req.body.sat !== undefined) {
        light.state.sat = req.body.sat;
      }

      this.emit('lightStateChanged', { 
        lightId: req.params.lightId, 
        state: light.state 
      });

      res.json(updates);
    });

    // Get all groups (rooms)
    this.app.get('/api/:apiKey/groups', (req, res) => {
      const groupsObj = {};
      this.rooms.forEach((room, id) => {
        groupsObj[id] = room;
      });
      res.json(groupsObj);
    });

    // Set group action (for scenes)
    this.app.put('/api/:apiKey/groups/:groupId/action', (req, res) => {
      const room = this.rooms.get(req.params.groupId);
      if (!room) {
        return res.status(404).json([{ error: 'Group not found' }]);
      }

      const updates = [];
      
      if (req.body.on !== undefined) {
        room.action.on = req.body.on;
        // Also update all lights in the room
        room.lights.forEach(lightId => {
          const light = this.lights.get(lightId);
          if (light) {
            light.state.on = req.body.on;
          }
        });
        const onKey = '/groups/' + req.params.groupId + '/action/on';
        const onUpdate = { success: {} };
        onUpdate.success[onKey] = req.body.on;
        updates.push(onUpdate);
      }

      if (req.body.scene) {
        const scene = this.scenes.get(req.body.scene);
        if (scene) {
          // Apply scene light states
          Object.entries(scene.lightstates || {}).forEach(([lightId, state]) => {
            const light = this.lights.get(lightId);
            if (light) {
              Object.assign(light.state, state);
            }
          });
          const sceneKey = '/groups/' + req.params.groupId + '/action/scene';
          const sceneUpdate = { success: {} };
          sceneUpdate.success[sceneKey] = req.body.scene;
          updates.push(sceneUpdate);
        }
      }

      this.emit('groupAction', { 
        groupId: req.params.groupId, 
        action: req.body 
      });

      res.json(updates);
    });

    // Get all scenes
    this.app.get('/api/:apiKey/scenes', (req, res) => {
      const scenesObj = {};
      this.scenes.forEach((scene, id) => {
        scenesObj[id] = scene;
      });
      res.json(scenesObj);
    });

    // Get single scene
    this.app.get('/api/:apiKey/scenes/:sceneId', (req, res) => {
      const scene = this.scenes.get(req.params.sceneId);
      if (!scene) {
        return res.status(404).json({ error: 'Scene not found' });
      }
      res.json(scene);
    });
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, (err) => {
        if (err) return reject(err);
        console.log(`Mock Hue Bridge listening on port ${this.port}`);
        this.emit('ready');
        resolve();
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.paired = false;
          this.apiKey = null;
          this.linkButtonPressed = false;
          console.log('Mock Hue Bridge stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  // Simulate pressing the link button on the bridge
  pressLinkButton() {
    this.linkButtonPressed = true;
    
    if (this.linkButtonTimeout) {
      clearTimeout(this.linkButtonTimeout);
    }
    
    // Link button times out after 30 seconds (per Hue API spec)
    this.linkButtonTimeout = setTimeout(() => {
      this.linkButtonPressed = false;
      this.emit('linkButtonTimeout');
    }, 30000);
    
    this.emit('linkButtonPressed');
  }

  // Simulate link button timeout
  expireLinkButton() {
    this.linkButtonPressed = false;
    if (this.linkButtonTimeout) {
      clearTimeout(this.linkButtonTimeout);
    }
  }

  // Reset pairing state
  unpair() {
    this.paired = false;
    this.apiKey = null;
  }

  // Add a new light
  addLight(id, lightData) {
    this.lights.set(id, lightData);
  }

  // Remove a light
  removeLight(id) {
    this.lights.delete(id);
  }

  // Update light state directly
  setLightState(id, state) {
    const light = this.lights.get(id);
    if (light) {
      Object.assign(light.state, state);
    }
  }

  // Get current API key (for testing)
  getApiKey() {
    return this.apiKey;
  }

  // Check if link button is currently pressed
  isLinkButtonPressed() {
    return this.linkButtonPressed;
  }
}

module.exports = MockHueBridge;
