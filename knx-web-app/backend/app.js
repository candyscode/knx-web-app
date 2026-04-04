const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const KnxService = require('./knxService');
const HueService = require('./hueService');

function createBackend(options = {}) {
  const {
    configFile = path.join(__dirname, 'config.json'),
    createKnxService = (io) => new KnxService(io),
    createHueService = () => new HueService(),
    port = 3001,
    huePollingMs = 5000,
  } = options;

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: '*' }
  });

  app.use(cors());
  app.use(bodyParser.json());

  const knxService = createKnxService(io);
  const hueService = createHueService();

  let huePollingInterval = null;

  let config = {
    knxIp: '',
    knxPort: 3671,
    hue: { bridgeIp: '', apiKey: '' },
    rooms: []
  };

  function saveConfig() {
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  }

  async function triggerLinkedHueScene(groupAddress, sceneNumber) {
    if (!hueService.isPaired) return;

    for (const room of config.rooms) {
      if (room.sceneGroupAddress !== groupAddress) continue;

      const scene = (room.scenes || []).find((s) => s.sceneNumber === sceneNumber && s.category !== 'shade');
      if (!scene) return;

      const isOff = scene.name && /^(aus|off)$/i.test(scene.name.trim());

      if (isOff && room.hueRoomId) {
        await hueService.turnOffRoom(room.hueRoomId);
      } else if (scene.hueSceneId) {
        await hueService.triggerScene(scene.hueSceneId);
      }
      return;
    }
  }

  function stopHuePolling() {
    if (huePollingInterval) {
      clearInterval(huePollingInterval);
      huePollingInterval = null;
    }
  }

  function startHuePolling() {
    stopHuePolling();
    if (!hueService.isPaired) return;

    huePollingInterval = setInterval(async () => {
      const hueIds = new Set();
      config.rooms.forEach((room) => {
        (room.functions || []).forEach((func) => {
          if (func.type === 'hue' && func.hueLightId) {
            hueIds.add(func.hueLightId);
          }
        });
      });

      if (hueIds.size === 0) return;

      const states = await hueService.getLightStates([...hueIds]);
      if (Object.keys(states).length > 0) {
        io.emit('hue_states', states);
      }
    }, huePollingMs);
  }

  async function handleExternalSceneTrigger(groupAddress, sceneNumber) {
    await triggerLinkedHueScene(groupAddress, sceneNumber);
  }

  function establishConnection() {
    if (!config.knxIp) return;

    knxService.connect(config.knxIp, config.knxPort, () => {
      const statusGAs = new Set();
      const gaToType = {};

      config.rooms.forEach((room) => {
        if (!room.functions) return;

        room.functions.forEach((func) => {
          if (func.statusGroupAddress) {
            statusGAs.add(func.statusGroupAddress);
            gaToType[func.statusGroupAddress] = func.type;
          }
          if (func.groupAddress) {
            gaToType[func.groupAddress] = func.type;
          }
          if (func.movingGroupAddress) {
            gaToType[func.movingGroupAddress] = 'moving';
          }
        });

        if (room.sceneGroupAddress) {
          gaToType[room.sceneGroupAddress] = 'scene';
        }
      });

      knxService.setGaToType(gaToType);
      knxService.setSceneTriggerCallback(handleExternalSceneTrigger);

      let delay = 0;
      statusGAs.forEach((ga) => {
        setTimeout(() => knxService.readStatus(ga), delay);
        delay += 50;
      });
    });
  }

  if (fs.existsSync(configFile)) {
    try {
      const data = fs.readFileSync(configFile, 'utf8');
      config = JSON.parse(data);
      if (!config.knxPort) config.knxPort = 3671;
      if (!config.hue) config.hue = { bridgeIp: '', apiKey: '' };
      hueService.init(config.hue);
      establishConnection();
    } catch (error) {
      console.error('Error parsing config.json', error);
    }
  }

  if (!fs.existsSync(configFile)) {
    saveConfig();
  }

  if (hueService.isPaired) {
    startHuePolling();
  }

  app.get('/api/config', (req, res) => {
    res.json(config);
  });

  app.post('/api/config', (req, res) => {
    const { knxIp, knxPort, rooms } = req.body;

    let shouldReconnect = false;

    if (knxIp !== undefined && config.knxIp !== knxIp) {
      config.knxIp = knxIp;
      shouldReconnect = true;
    }

    if (knxPort !== undefined && config.knxPort !== parseInt(knxPort, 10)) {
      config.knxPort = parseInt(knxPort, 10) || 3671;
      shouldReconnect = true;
    }

    if (shouldReconnect && config.knxIp) {
      establishConnection();
    }

    if (rooms !== undefined) {
      config.rooms = rooms;
    }

    saveConfig();
    res.json({ success: true, config });
  });

  app.post('/api/action', async (req, res) => {
    const { groupAddress, type, sceneNumber, value } = req.body;

    try {
      if (type === 'scene') {
        knxService.writeScene(groupAddress, sceneNumber);
        await triggerLinkedHueScene(groupAddress, sceneNumber);
      } else if (type === 'percentage') {
        knxService.writeGroupValue(groupAddress, value, 'DPT5.001');
      } else {
        knxService.writeGroupValue(groupAddress, (value === true || value === 1 || value === '1'), 'DPT1');
      }

      res.json({ success: true, message: 'Sent to bus' });
    } catch (error) {
      io.emit('knx_error', { msg: `Action failed on bus: ${error.message}` });
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/hue/discover', async (req, res) => {
    try {
      const bridges = await hueService.discoverBridges();
      res.json({ success: true, bridges });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/hue/pair', async (req, res) => {
    const { bridgeIp } = req.body;
    if (!bridgeIp) {
      return res.status(400).json({ success: false, error: 'bridgeIp required' });
    }

    const result = await hueService.pairBridge(bridgeIp);
    if (result.success) {
      config.hue = { bridgeIp, apiKey: result.apiKey };
      saveConfig();
      startHuePolling();
    }
    res.json(result);
  });

  app.post('/api/hue/unpair', (req, res) => {
    hueService.unpair();
    config.hue = { bridgeIp: '', apiKey: '' };
    saveConfig();
    stopHuePolling();
    res.json({ success: true });
  });

  app.get('/api/hue/lights', async (req, res) => {
    res.json(await hueService.getLights());
  });

  app.get('/api/hue/rooms', async (req, res) => {
    res.json(await hueService.getRooms());
  });

  app.get('/api/hue/scenes', async (req, res) => {
    res.json(await hueService.getScenes());
  });

  app.post('/api/config/rooms/:roomId/hue-room', (req, res) => {
    const { roomId } = req.params;
    const { hueRoomId } = req.body;
    if (!hueRoomId) {
      return res.status(400).json({ success: false, error: 'hueRoomId required' });
    }

    const room = config.rooms.find((entry) => entry.id === roomId);
    if (!room) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    room.hueRoomId = hueRoomId;
    saveConfig();
    res.json({ success: true });
  });

  app.delete('/api/config/rooms/:roomId/hue-room', (req, res) => {
    const { roomId } = req.params;
    const room = config.rooms.find((entry) => entry.id === roomId);
    if (!room) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    delete room.hueRoomId;
    saveConfig();
    res.json({ success: true });
  });

  app.post('/api/config/scenes/:sceneId/hue-scene', (req, res) => {
    const { sceneId } = req.params;
    const { hueSceneId } = req.body;
    if (!hueSceneId) {
      return res.status(400).json({ success: false, error: 'hueSceneId required' });
    }

    let found = false;
    for (const room of config.rooms) {
      const scene = (room.scenes || []).find((entry) => entry.id === sceneId);
      if (scene) {
        scene.hueSceneId = hueSceneId;
        found = true;
        break;
      }
    }

    if (!found) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }

    saveConfig();
    res.json({ success: true });
  });

  app.delete('/api/config/scenes/:sceneId/hue-scene', (req, res) => {
    const { sceneId } = req.params;

    let found = false;
    for (const room of config.rooms) {
      const scene = (room.scenes || []).find((entry) => entry.id === sceneId);
      if (scene) {
        delete scene.hueSceneId;
        found = true;
        break;
      }
    }

    if (!found) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }

    saveConfig();
    res.json({ success: true });
  });

  app.post('/api/hue/action', async (req, res) => {
    const { lightId, on } = req.body;
    if (!lightId) {
      return res.status(400).json({ success: false, error: 'lightId required' });
    }

    const result = await hueService.setLightState(lightId, on);
    if (result.success) {
      io.emit('hue_state_update', { lightId: `hue_${lightId}`, on: !!on });
    }
    res.json(result);
  });

  io.on('connection', (socket) => {
    socket.emit('knx_status', {
      connected: knxService.isConnected,
      msg: knxService.isConnected ? 'Connected to bus' : (config.knxIp ? 'Disconnected from bus' : 'No KNX IP Configured')
    });
    socket.emit('hue_status', { paired: hueService.isPaired, bridgeIp: hueService.bridgeIp });
    socket.emit('knx_initial_states', knxService.deviceStates);
  });

  function start() {
    return new Promise((resolve) => {
      server.listen(port, () => {
        console.log(`Backend server running on http://localhost:${port}`);
        resolve(server);
      });
    });
  }

  function stop() {
    stopHuePolling();
    return new Promise((resolve, reject) => {
      io.close(() => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    });
  }

  return {
    app,
    server,
    io,
    start,
    stop,
    services: {
      knxService,
      hueService,
    },
    getConfig: () => config,
  };
}

module.exports = { createBackend };
