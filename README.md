# KNX Control

A local web application for controlling a KNX smart home system via a KNX IP interface. Supports KNX switches, blinds, lighting scenes, and Philips Hue lights — all in a single dashboard optimized for both desktop and mobile use.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Starting the App](#starting-the-app)
- [Configuration](#configuration)
- [Philips Hue Integration](#philips-hue-integration)
- [Using the Dashboard](#using-the-dashboard)
- [Using the Settings](#using-the-settings)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Known Issues & Notes](#known-issues--notes)

---

## Architecture Overview

```text
┌─────────────────────┐      HTTP / WebSocket      ┌─────────────────────┐
│ Browser (React UI)  │ ◄────────────────────────► │ Backend (Node.js)   │
│ Any device in WLAN  │                            │ Port 3001           │
└─────────────────────┘                            └──────────┬──────────┘
                                                              │
                                            KNX IP (UDP 3671) │ HTTP (local LAN)
                                                      ┌───────┴───────┐
                                                      │               │
                                              ┌───────┴───────┐ ┌─────┴───────┐
                                              │ KNX IP        │ │ Philips     │
                                              │ Interface     │ │ Hue Bridge  │
                                              └───────────────┘ └─────────────┘
```

- **Frontend**: React + Vite UI (served automatically by the backend in production)
- **Backend**: Express + Socket.IO (serves API, Websockets and the Frontend on Port 3001)
- **KNX**: Communicates via UDP to the KNX IP interface on port 3671
- **Hue**: Communicates via HTTP to the Philips Hue Bridge on the local LAN
- **Persistence**: All configuration (rooms, functions, IP settings, Hue credentials) is stored in `backend/config.json`

---

## Prerequisites

Before running this app, you need:

1. **Node.js** v18 or later — [nodejs.org](https://nodejs.org)
2. **npm** (comes with Node.js)
3. A **KNX IP Interface** (e.g. MDT SCN-IP000.03) connected to your local network
4. _(Optional)_ A **Philips Hue Bridge** on the same local network

> **Important:** The backend and the KNX interface must be on the **same local network**. KNX communication uses UDP multicast and does not work across network boundaries (e.g. VPN).

---

## Installation & Deployment

## Installation & Upgrades

We provide a script to securely install Node.js, npm, and the KNX Web App via a single command onto a Raspberry Pi, or any Debian-based Linux OS. This script can also be used to seamlessly upgrade an existing install when a new release is passed to the main branch.

Run the following command in your terminal to download and start the installation:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/candyscode/knx-web-app/main/install.sh)
```

This script will explain what it's about to do and pause to let you confirm. Under the hood, it performs the following:
* If no Node.js is detected, it automatically installs Node.js v20 LTS securely via NodeSource.
* Clones (or updates) the application safely into a dedicated `~/.knx-web-app` home directory.
* Compiles the React frontend into an optimized production-build bundle.
* Automatically registers the application as a `systemd` background service so it will survive reboots and keep running effortlessly.

---

## 🛠️ Working with the background service (CLI)

Because the app is registered on the OS level, you no longer need to keep a terminal running to keep your smart home alive. The installer also sets up several convenient global commands in your terminal:

* `knx-start` - Starts the web app service in the background.
* `knx-stop` - Stops the web app service.
* `knx-restart` - Restarts the service.
* `knx-log` - Displays the live logs (press `Ctrl-C` to close logs, the app will keep running).

### Upgrading the App
When a new version is pushed to GitHub, simply type:
* `knx-update` - This automatically downloads the newest version, rebuilds the frontend, updates all Node.js dependencies, and restarts the background service. **Your configurations (rooms, IPs) will remain securely untouched!**

### Uninstalling
If you no longer wish to run the app on this device, simply type:
* `knx-uninstall` - You will be prompted to confirm. If you type 'y', the process will completely remove the background services, delete the `~/.knx-web-app` installation folder, and erase all CLI shortcuts from your system effortlessly.

**Autostart on boot**  
The installation automatically enabled autostart. If you ever need to turn this off, you can manually disable the systemd feature using:
```bash
sudo systemctl disable knx-web-app.service
```

---

## Development / Manual Setup

If you prefer to run it manually or hack on the features, just clone the repo and launch the frontend and backend manually in two separate terminal tabs:

```bash
# 1. Start the Backend
cd backend
npm install
node server.js
# Runs on :3001

# 2. Start the Frontend
cd ../frontend
npm install
npm run dev
# Vite runs on :5173
```
```
VITE v8.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
```

> **Note:** The frontend must be started **after** the backend. If port 5173 is already in use, Vite will automatically try the next available port (e.g. 5174). Kill old processes first if this happens:
> ```bash
> pkill -f "vite"; pkill -f "node server.js"
> ```

### 3. Open in Browser (Development)

Navigate to: **http://localhost:5173** (In production via the daemon, use `http://<Raspberry-IP>:3001`)

---

## Configuration

All configuration is saved automatically to `backend/config.json`. This file is created on first run.

### KNX Interface

1. Go to **Settings**
2. Under **KNX Interface**, enter the IP address of your KNX IP interface and the port (default: `3671`)
3. Click **Save** — the backend will immediately attempt to connect

The connection status is shown in the header (green = connected, red = offline).

### Rooms & Functions

Rooms group your KNX devices for display on the dashboard. Each room can have:

| Type | Description | DPT |
|------|-------------|-----|
| **Switch** | On/off toggle (e.g. lights, sockets) | DPT 1.001 |
| **Blind** | Position slider 0–100% | DPT 5.001 |
| **Scene** | Standalone scene trigger | DPT 17.001 |
| **Hue Lamp** | Philips Hue light toggle | — |

---

## Philips Hue Integration

Hue lamps are controlled alongside KNX functions. Hue control uses **HTTP** to the local Hue Bridge (not the Hue cloud).

### Pairing the Bridge

1. Go to **Settings → Philips Hue**
2. Click **Discover** — the app tries to auto-discover your bridge via `discovery.meethue.com`
3. If discovery fails (common in isolated networks), click **Enter IP manually** and type the bridge IP (e.g. `192.168.1.65`)
4. Press the **physical link button** on the top of your Hue Bridge
5. Click **Pair** within 30 seconds

Once paired, the bridge IP and API key are saved to `backend/config.json` under the `hue` key.

### Adding Hue Lamps to Rooms

1. Open **Settings** and find the desired room
2. Click **+ Add Hue Lamp**
3. Select a lamp from the popup list (fetched live from the bridge)
4. The lamp appears as a purple-tinted card in the room with a **HUE** badge
5. You can rename the lamp — the original bridge name is shown below the input

### Hue Cards in the Dashboard

Hue lamps render as toggle buttons alongside KNX functions. Clicking toggles the lamp on/off. The UI updates **immediately** (optimistic update) while the command is sent to the bridge in the background. If the command fails, the toggle reverts and an error toast appears.

---

## Using the Dashboard

The dashboard shows all configured rooms in a card grid.

### Room Card Layout

Each room card contains:
- **Scene buttons** (colored pills) — one click triggers the KNX scene
- **Shade scenes** (purple pills) — for blind presets
- **Function widgets** — switches, blinds, and Hue lamps

### Switch / Hue Toggle

- Clicking the widget sends the command immediately (optimistic UI)
- The toggle reflects the real state once WebSocket confirmation arrives
- If KNX is offline, a toast error is shown

### Blind Widget

- Drag the slider to set the blind position (0% = open, 100% = closed)
- The thin indicator bar on the right shows the **actual reported position** from the bus
- Wall-switch movements update the indicator automatically without moving the slider

---

## Using the Settings

### KNX Interface Section
- Set the IP and port of your KNX IP interface
- Changes take effect immediately after clicking Save

### Philips Hue Section
- Shows pairing status and bridge IP
- Unpair button removes all credentials from config

### Rooms & Functions Section

**Room management:**
- Add a new room by typing a name and clicking **+ Add Room**
- Rooms can be reordered with the ↑↓ arrows
- Delete a room (and all its functions/scenes) with **Delete Room**

**Scene configuration:**
- Each room has a single **Scene GA** (group address) shared by all scenes
- Add scenes with **+ Add Scene** (Light or Shade category)
- Each scene has a number (1–64) and a label that appears as a pill on the dashboard
- Scene numbers must match the scene numbers programmed in the KNX actuator

**Function configuration (KNX):**
- Each function needs:
  - A **Name** (display label)
  - A **Type** (Switch, Blind, Scene)
  - An **Action GA** — the address written to when triggered
  - _(Switch/Blind)_ A **Feedback GA** — the address the actuator reports status to
  - _(Blind only)_ A **Moving GA** — signals when the blind is in motion

**Function configuration (Hue):**
- Only the display **Name** is editable
- The original Hue lamp name from the bridge is shown for reference
- No group addresses needed

> **Important:** Click **Save Configuration** at the bottom of the Settings page to persist all changes. Changes are not autosaved.

---

## Project Structure

```
knx-web-app/  (repo root)
├── install.sh
├── backend/
│   ├── server.js          # Express API + Socket.IO server (port 3001)
│   ├── knxService.js      # KNX IP connection & group address handling
│   ├── hueService.js      # Philips Hue bridge discovery, pairing, control
│   ├── config.json        # Runtime config (auto-created, not in git)
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── App.jsx         # Root component: socket setup, global state
    │   ├── Dashboard.jsx   # Dashboard view: room cards, switches, blinds
    │   ├── Settings.jsx    # Settings view: rooms, functions, Hue setup
    │   ├── configApi.js    # All fetch calls to the backend REST API
    │   ├── index.css       # All styles (dark theme, responsive)
    │   └── main.jsx        # React entry point
    ├── index.html
    └── package.json
```

---

## API Reference

All endpoints are provided by the backend service (default port `3001`).

### Config

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/config` | Returns full application config (rooms, IP, Hue) |
| `POST` | `/api/config` | Saves config (partial updates supported) |

### KNX

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/api/action` | `{ groupAddress, type, value, sceneNumber }` | Send a value to a KNX group address |

### Philips Hue

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/api/hue/discover` | — | Auto-discover bridge via meethue.com |
| `POST` | `/api/hue/pair` | `{ bridgeIp }` | Pair with bridge at given IP (user must press link button first) |
| `POST` | `/api/hue/unpair` | — | Remove Hue credentials from config |
| `GET` | `/api/hue/lights` | — | List all lights from paired bridge |
| `POST` | `/api/hue/action` | `{ lightId, on }` | Turn a light on or off |

### WebSocket Events (Socket.IO)

The backend emits the following events to all connected clients:

| Event | Payload | Description |
|-------|---------|-------------|
| `knx_status` | `{ connected, msg }` | KNX connection state change |
| `knx_initial_states` | `{ [groupAddress]: value }` | Full state snapshot on connect |
| `knx_state_update` | `{ groupAddress, value }` | Single GA state change from bus |
| `knx_error` | `{ msg }` | KNX error message |
| `hue_status` | `{ paired, bridgeIp }` | Hue pairing state change |
| `hue_states` | `{ [hue_<id>]: boolean }` | Full Hue state snapshot (polled every 5s) |
| `hue_state_update` | `{ lightId, on }` | Single Hue light state change (after action) |

---

## Known Issues & Notes

### ⚠️ `socket={io(...)}` in JSX causes infinite re-renders
Never pass `io(...)` as a JSX prop directly. Socket connections must only be created inside `useEffect`. This was a regression that caused the app to hang on load.

### ⚠️ Port conflicts when restarting
If Vite starts on port 5174 instead of 5173, a stale process is occupying the port. Fix:
```bash
pkill -f "vite"; pkill -f "node server.js"
```
Then restart both servers.

### ℹ️ Hue Bridge uses HTTP (not HTTPS)
The backend communicates with the Hue Bridge via **HTTP** on the local network. HTTPS was intentionally disabled because the bridge uses a self-signed certificate which causes Node.js `fetch` to reject the connection.

### ℹ️ Optimistic UI for toggles
Switch and Hue toggles update instantly in the UI before the backend confirms the change. If the action fails, the UI reverts and shows an error toast.

### ℹ️ KNX scene numbers are 0-indexed on the bus
The app automatically subtracts 1 from the scene number you enter (e.g. scene `1` → bus value `0`). This is the KNX DPT 17.001 standard.
