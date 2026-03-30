const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const KnxService = require('./knxService');

const app = express();
const server = http.createServer(app);
const corsOrigin = process.env.CORS_ORIGIN || '*';
const io = new Server(server, {
  cors: { origin: corsOrigin }
});

app.use(cors({ origin: corsOrigin }));
app.use(bodyParser.json());

const CONFIG_FILE = path.join(__dirname, 'config.json');
const PORT = parseInt(process.env.PORT, 10) || 3001;

const knxService = new KnxService(io);

// Default empty config
let config = {
  knxIp: '',
  knxPort: 3671,
  rooms: []
};

function establishConnection() {
  const knxIp = process.env.KNX_IP || config.knxIp;
  const knxPort = parseInt(process.env.KNX_PORT, 10) || config.knxPort;

  if (knxIp) {
    knxService.connect(knxIp, knxPort, () => {
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
      });
      
      knxService.setGaToType(gaToType);
      
      let delay = 0;
      statusGAs.forEach(ga => {
        setTimeout(() => knxService.readStatus(ga), delay);
        delay += 50; // Delay reads to prevent bus flooding
      });
    });
  }
}

// Load config
if (fs.existsSync(CONFIG_FILE)) {
  try {
    const data = fs.readFileSync(CONFIG_FILE, 'utf8');
    config = JSON.parse(data);
    if (!config.knxPort) config.knxPort = 3671;
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
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    port: PORT,
    knxConnected: knxService.isConnected
  });
});

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
  
  if (knxPort !== undefined && config.knxPort !== parseInt(knxPort)) {
    config.knxPort = parseInt(knxPort) || 3671;
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

// Action trigger
app.post('/api/action', (req, res) => {
  const { groupAddress, type, sceneNumber, value } = req.body;
  
  try {
    if (type === 'scene') {
      knxService.writeScene(groupAddress, sceneNumber);
    } else if (type === 'percentage') {
      // 0-100% -> 'DPT5.001'
      knxService.writeGroupValue(groupAddress, value, 'DPT5.001');
    } else {
      // type === 'switch' or other mapped to boolean True/False 1-bit
      knxService.writeGroupValue(groupAddress, !!value, 'DPT1');
    }
    
    res.json({ success: true, message: `Sent to bus` });
  } catch (error) {
    console.error("Failed to execute action:", error.message);
    io.emit('knx_error', { msg: `Action failed on bus: ${error.message}` });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected to UI');
  // Send current status to the newly connected frontend
  socket.emit('knx_status', { 
    connected: knxService.isConnected, 
    msg: knxService.isConnected ? 'Connected to bus' : (config.knxIp ? 'Disconnected from bus' : 'No KNX IP Configured') 
  });
  
  // Broadcast initial parsed KNX values (persisted + live)
  socket.emit('knx_initial_states', knxService.deviceStates);
});

server.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down backend...`);

  server.close(() => {
    if (knxService.connection) {
      try {
        knxService.connection.Disconnect();
      } catch (error) {
        console.error('Error while disconnecting KNX session during shutdown:', error.message);
      }
    }

    process.exit(0);
  });

  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
