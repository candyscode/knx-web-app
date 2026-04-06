const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const KnxService = require('./knxService');
const HueService = require('./hueService');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(cors());
app.use(bodyParser.json());

const CONFIG_FILE = path.join(__dirname, 'config.json');

const knxService = new KnxService(io);
const hueService = new HueService();

// Floor options constant
const FLOOR_OPTIONS = [
  { value: 'KG', label: 'KG', fullLabel: 'Keller' },
  { value: 'UG', label: 'UG', fullLabel: 'Untergeschoss' },
  { value: 'EG', label: 'EG', fullLabel: 'Erdgeschoss' },
  { value: 'OG', label: 'OG', fullLabel: 'Obergeschoss' }
];
const FLOOR_VALUES = FLOOR_OPTIONS.map(f => f.value);
// Default empty config
let config = {
  knxIp: '',
  knxPort: 3671,
  hue: { bridgeIp: '', apiKey: '' },
  rooms: [],
  ui: { expandedFloors: ['EG'] }
};

function establishConnection() {
  if (config.knxIp) {
    knxService.connect(config.knxIp, config.knxPort, () => {
      console.log('Orchestrating read requests for status GAs...');
      const statusGAs = new Set();
      const gaToType = {};
      
      config.rooms.forEach(room => {
        if (!room.functions) return;
        room.functions.forEach(func => {
          if (func.statusGroupAddress) {
            statusGAs.add(func.statusGroupAddress);
            gaToType[func.statusGroupAddress] = func.type;
          }
          if (func.groupAddress) {
            gaToType[func.groupAddress] = func.type;
          }
          // Register the "is moving" GA as a 1-bit type
          if (func.movingGroupAddress) {
            gaToType[func.movingGroupAddress] = 'moving';
          }
        });

        // Register room scene GA as 'scene' type for bus listener
        if (room.sceneGroupAddress) {
          gaToType[room.sceneGroupAddress] = 'scene';
        }
      });
      
      knxService.setGaToType(gaToType);
      knxService.setSceneTriggerCallback(handleExternalSceneTrigger);
      
      let delay = 0;
      statusGAs.forEach(ga => {
        setTimeout(() => knxService.readStatus(ga), delay);
        delay += 50; // Delay reads to prevent bus flooding
      });
    });
  }
}

/**
 * Called by KnxService when an external scene telegram is received on the bus
 * (e.g. from a wall-mounted switch).
 */
async function handleExternalSceneTrigger(groupAddress, sceneNumber) {
  console.log(`External scene trigger: GA=${groupAddress} scene=${sceneNumber}`);
  await triggerLinkedHueScene(groupAddress, sceneNumber);
}

// Load config
if (fs.existsSync(CONFIG_FILE)) {
  try {
    const data = fs.readFileSync(CONFIG_FILE, 'utf8');
    config = JSON.parse(data);
    if (!config.knxPort) config.knxPort = 3671;
    if (!config.hue) config.hue = { bridgeIp: '', apiKey: '' };
    if (!config.ui) config.ui = { expandedFloors: ['EG'] };
    if (!config.ui.expandedFloors) config.ui.expandedFloors = ['EG'];
    
    // Migration: Add floor field to existing rooms without floor
    if (config.rooms && Array.isArray(config.rooms)) {
      config.rooms.forEach(room => {
        if (!room.floor || !FLOOR_VALUES.includes(room.floor)) {
          room.floor = 'EG';
        }
      });
    }
    
    hueService.init(config.hue);
    establishConnection();
  } catch(e) {
    console.error('Error parsing config.json', e);
  }
}

function saveConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Ensure the local file exists right away
if (!fs.existsSync(CONFIG_FILE)) {
  saveConfig();
}

// API Routes
app.get('/api/config', (req, res) => {
  res.json(config);
});

// Floor API Routes
app.get('/api/floors', (req, res) => {
  res.json(FLOOR_OPTIONS);
});

// Update room floor
app.post('/api/config/rooms/:roomId/floor', (req, res) => {
  const { roomId } = req.params;
  const { floor } = req.body;
  
  if (!floor || !FLOOR_VALUES.includes(floor)) {
    return res.status(400).json({ success: false, error: 'Invalid floor. Must be one of: ' + FLOOR_VALUES.join(', ') });
  }
  
  const room = config.rooms.find(r => r.id === roomId);
  if (!room) return res.status(404).json({ success: false, error: 'Room not found' });
  
  room.floor = floor;
  saveConfig();
  res.json({ success: true, room });
});
app.post('/api/config', (req, res) => {
  const { knxIp, knxPort, rooms } = req.body;
  
  let shouldReconnect = false;

  if (knxIp !== undefined && config.knxIp !== knxIp) {
    config.knxIp = knxIp;
    shouldReconnect = true;
  }
  
  if (knxPort !== undefined && config.knxPort !== parseInt(knxPort)) {
    config.knxPort = parseInt(knxPort) || 3671;
    shouldReconnect = true;
  }

  if (shouldReconnect && config.knxIp) {
    establishConnection();
  }
  
  if (rooms !== undefined) {
    config.rooms = rooms;
    // Ensure all rooms have a floor value
    config.rooms.forEach(room => {
      if (!room.floor || !FLOOR_VALUES.includes(room.floor)) {
        room.floor = 'EG';
      }
    });
  }
  
  saveConfig();
  res.json({ success: true, config });
});

// Load configuration from config.dev.json
app.post('/api/dev/load-config', (req, res) => {
  const DEV_CONFIG_FILE = path.join(__dirname, 'config.dev.json');
  if (fs.existsSync(DEV_CONFIG_FILE)) {
    try {
      const data = fs.readFileSync(DEV_CONFIG_FILE, 'utf8');
      config = JSON.parse(data);
      saveConfig();
      if (config.knxIp) {
        establishConnection();
      }
      res.json({ success: true, config });
    } catch (e) {
      console.error('Error parsing config.dev.json', e);
      res.status(500).json({ success: false, error: 'Internal Server Error reading dev config' });
    }
  } else {
    res.status(404).json({ success: false, error: 'config.dev.json not found' });
  }
});

// Action trigger
app.post('/api/action', async (req, res) => {
  const { groupAddress, type, sceneNumber, value } = req.body;
  
  try {
    if (type === 'scene') {
      knxService.writeScene(groupAddress, sceneNumber);
      // Trigger linked Hue scene if configured
      await triggerLinkedHueScene(groupAddress, sceneNumber);
    } else if (type === 'percentage') {
      // 0-100% -> 'DPT5.001'
      knxService.writeGroupValue(groupAddress, value, 'DPT5.001');
    } else {
      // type === 'switch' or other mapped to boolean True/False 1-bit
      knxService.writeGroupValue(groupAddress, (value === true || value === 1 || value === '1'), 'DPT1');
    }
    
    res.json({ success: true, message: `Sent to bus` });
  } catch (error) {
    console.error("Failed to execute action:", error.message);
    io.emit('knx_error', { msg: `Action failed on bus: ${error.message}` });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Given a KNX scene group address and scene number, trigger the corresponding Hue scene (if any).
 * If the scene is named 'Aus' or 'Off', turn off the linked Hue room instead.
 */
async function triggerLinkedHueScene(groupAddress, sceneNumber) {
  if (!hueService.isPaired) return;

  for (const room of config.rooms) {
    if (room.sceneGroupAddress !== groupAddress) continue;

    const scene = (room.scenes || []).find(s => s.sceneNumber === sceneNumber && s.category !== 'shade');
    if (!scene) return;

    const isOff = scene.name && /^(aus|off)$/i.test(scene.name.trim());

    if (isOff && room.hueRoomId) {
      console.log(`Turning off Hue room ${room.hueRoomId} for scene "${scene.name}"`);
      await hueService.turnOffRoom(room.hueRoomId);
    } else if (scene.hueSceneId) {
      console.log(`Triggering Hue scene ${scene.hueSceneId} for KNX scene "${scene.name}"`);
      await hueService.triggerScene(scene.hueSceneId);
    }
    return;
  }
}

// ══════ Hue API Routes ══════

app.post('/api/hue/discover', async (req, res) => {
  try {
    const bridges = await hueService.discoverBridges();
    res.json({ success: true, bridges });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/hue/pair', async (req, res) => {
  const { bridgeIp } = req.body;
  if (!bridgeIp) return res.status(400).json({ success: false, error: 'bridgeIp required' });

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
  const result = await hueService.getLights();
  res.json(result);
});

app.get('/api/hue/rooms', async (req, res) => {
  const result = await hueService.getRooms();
  res.json(result);
});

app.get('/api/hue/scenes', async (req, res) => {
  const result = await hueService.getScenes();
  res.json(result);
});

// ── Hue room/scene linking ──

app.post('/api/config/rooms/:roomId/hue-room', (req, res) => {
  const { roomId } = req.params;
  const { hueRoomId } = req.body;
  if (!hueRoomId) return res.status(400).json({ success: false, error: 'hueRoomId required' });

  const room = config.rooms.find(r => r.id === roomId);
  if (!room) return res.status(404).json({ success: false, error: 'Room not found' });

  room.hueRoomId = hueRoomId;
  saveConfig();
  res.json({ success: true });
});

app.delete('/api/config/rooms/:roomId/hue-room', (req, res) => {
  const { roomId } = req.params;
  const room = config.rooms.find(r => r.id === roomId);
  if (!room) return res.status(404).json({ success: false, error: 'Room not found' });

  delete room.hueRoomId;
  saveConfig();
  res.json({ success: true });
});

app.post('/api/config/scenes/:sceneId/hue-scene', (req, res) => {
  const { sceneId } = req.params;
  const { hueSceneId } = req.body;
  if (!hueSceneId) return res.status(400).json({ success: false, error: 'hueSceneId required' });

  let found = false;
  for (const room of config.rooms) {
    const scene = (room.scenes || []).find(s => s.id === sceneId);
    if (scene) {
      scene.hueSceneId = hueSceneId;
      found = true;
      break;
    }
  }

  if (!found) return res.status(404).json({ success: false, error: 'Scene not found' });
  saveConfig();
  res.json({ success: true });
});

app.delete('/api/config/scenes/:sceneId/hue-scene', (req, res) => {
  const { sceneId } = req.params;

  let found = false;
  for (const room of config.rooms) {
    const scene = (room.scenes || []).find(s => s.id === sceneId);
    if (scene) {
      delete scene.hueSceneId;
      found = true;
      break;
    }
  }

  if (!found) return res.status(404).json({ success: false, error: 'Scene not found' });
  saveConfig();
  res.json({ success: true });
});

app.post('/api/hue/action', async (req, res) => {
  const { lightId, on } = req.body;
  if (!lightId) return res.status(400).json({ success: false, error: 'lightId required' });

  const result = await hueService.setLightState(lightId, on);
  if (result.success) {
    // Immediately broadcast the state change to all connected clients
    io.emit('hue_state_update', { lightId: `hue_${lightId}`, on: !!on });
  }
  res.json(result);
});

// ── Hue state polling ──
let huePollingInterval = null;

function startHuePolling() {
  stopHuePolling();
  if (!hueService.isPaired) return;

  huePollingInterval = setInterval(async () => {
    // Collect all Hue light IDs referenced in rooms
    const hueIds = new Set();
    config.rooms.forEach(room => {
      (room.functions || []).forEach(f => {
        if (f.type === 'hue' && f.hueLightId) hueIds.add(f.hueLightId);
      });
    });
    if (hueIds.size === 0) return;

    const states = await hueService.getLightStates([...hueIds]);
    if (Object.keys(states).length > 0) {
      io.emit('hue_states', states);
    }
  }, 5000);
}

function stopHuePolling() {
  if (huePollingInterval) {
    clearInterval(huePollingInterval);
    huePollingInterval = null;
  }
}

// Start polling if already paired on boot
if (hueService.isPaired) {
  startHuePolling();
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected to UI');
  // Send current status to the newly connected frontend
  socket.emit('knx_status', { 
    connected: knxService.isConnected, 
    msg: knxService.isConnected ? 'Connected to bus' : (config.knxIp ? 'Disconnected from bus' : 'No KNX IP Configured') 
  });
  
  // Send Hue pairing status
  socket.emit('hue_status', { paired: hueService.isPaired, bridgeIp: hueService.bridgeIp });
  
  // Broadcast initial parsed KNX values (persisted + live)
  socket.emit('knx_initial_states', knxService.deviceStates);
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
