# KNX Control

A local web application for controlling a KNX smart home system with support for multiple apartments in one building. Each apartment can have its own KNX IP gateway, its own optional Philips Hue bridge, its own ETS import, and its own private areas and alarms. In addition, the app supports shared building areas such as garden or garage and shared building information such as outside temperature or wind speed.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Docker Deployment](#docker-deployment)
- [Starting the App](#starting-the-app)
- [Configuration](#configuration)
- [Multi-Apartment Model](#multi-apartment-model)
- [Philips Hue Integration](#philips-hue-integration)
- [Using the Dashboard](#using-the-dashboard)
- [Using Rooms](#using-rooms)
- [Using Setup](#using-setup)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Known Issues & Notes](#known-issues--notes)

---

## Architecture Overview

```text
┌─────────────────────┐      HTTP / WebSocket      ┌─────────────────────┐
│ Browser (React UI)  │ ◄────────────────────────► │ Backend (Node.js)   │
│ Apartment URLs      │                            │ Port 3001           │
└─────────────────────┘                            └──────────┬──────────┘
                                                              │
                                            KNX IP (UDP 3671) │ HTTP (local LAN)
                                                      ┌───────┴───────┐
                                                      │               │
                                            ┌─┴───────────────┐ ┌─────────────┴─┐
                                            │ Apartment KNX   │ │ Apartment Hue │
                                            │ Gateways        │ │ Bridges       │
                                            └─────────────────┘ └───────────────┘
```

- **Frontend**: React + Vite UI with apartment-aware routes like `/wohnung-ost` or `/wohnung-west/rooms`
- **Backend**: Express + Socket.IO serving the API, WebSocket updates, and the production frontend on port `3001`
- **KNX**: One KNX context per apartment, each connecting to that apartment's KNX IP gateway
- **Hue**: One optional Hue context per apartment
- **Shared building scope**: Shared areas and shared information are stored once on building level and accessed through the selected apartment gateway that can reach the other/shared KNX line
- **Persistence**: All configuration is stored in `backend/config.json`

---

## Prerequisites

Before running this app, you need:

1. **Node.js** v18 or later — [nodejs.org](https://nodejs.org)
2. **npm** (comes with Node.js)
3. A **KNX IP Interface** (e.g. MDT SCN-IP000.03) connected to your local network
4. _(Optional)_ A **Philips Hue Bridge** on the same local network

> **Important:** The backend and the KNX interface must be on the **same local network**. KNX communication uses UDP multicast and does not work across network boundaries (e.g. VPN).

---

## Installation

We provide a script to securely install Node.js, npm, and the KNX Web App via a single command onto a Raspberry Pi, or any Debian-based Linux OS. This script can also be used to seamlessly upgrade an existing install when a new release is passed to the main branch.

Run the following command in your terminal to download and start the installation:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/candyscode/AI/main/install.sh)
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

## Docker Deployment

If you prefer a containerized setup, the repository now includes first-class Docker files for a production deployment that serves the built frontend from the backend on **port `3001`**.

### Quick start

```bash
mkdir -p data
docker compose up -d --build
```

Then open:

- On the same machine: `http://localhost:3001`
- From another device on your LAN: `http://<docker-host-ip>:3001`

The app configuration is persisted in `./data/config.json` on the host, so rebuilds and upgrades do not wipe your rooms, apartments, KNX settings, or Hue pairing.

### What the container needs

- **Published TCP port `3001`** for the UI, API, and Socket.IO
- **Outbound UDP `3671`** reachability from the container to the KNX gateway
- **Outbound HTTP access on your LAN** to reach a Philips Hue bridge, if used

Useful commands:

```bash
docker compose logs -f
docker compose ps
docker compose up -d --build
docker compose down
```

### Docker notes

- The app is still a **local-network** application. The Docker host must be able to reach the KNX gateway and Hue bridge directly.
- Keep the `./data:/app/data` bind mount if you want configuration to survive container rebuilds.
- If port `3001` is already in use, either stop the conflicting service or change the host-side port mapping in `compose.yaml`.
- If you change the published port, use the new host-side port in the browser URL. For example, `8080:3001` means browsing to `http://<host-ip>:8080`.

---

## Starting the App

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

### Multi-Apartment Model

The app uses a `building + apartments` configuration model:

- `apartments[]`: each apartment has its own name, URL slug, KNX gateway, optional Hue bridge, private areas, apartment alarms, and apartment ETS import
- `building.sharedAreas[]`: areas shared by all apartments, for example garden or garage
- `building.sharedInfos[]`: shared building values configured once, for example outside temperature or wind speed
- `building.sharedAccessApartmentId`: which apartment gateway is used to listen to KNX telegrams from the other/shared KNX line

This means:

- shared information is configured once for the whole building
- alarms stay apartment-specific
- shared areas are not copied into apartments, but shown together with private areas in the UI
- each apartment can be bookmarked directly via its own URL

Examples:

- `/wohnung-ost`
- `/wohnung-west`
- `/wohnung-ost/rooms`
- `/wohnung-west/connections`

### Setup vs Rooms

- **Dashboard**: live control view for the current apartment and its shared areas
- **Rooms**: area, room, scene, function, and global/shared information configuration
- **Setup**: apartment identity, KNX, Hue, ETS imports, shared building access, and apartment management

### Apartment KNX Interface

1. Open **Setup**
2. In **Current Apartment → Identity & KNX Gateway**, enter the apartment name, URL slug, KNX IP address, and port
3. Click **Save Apartment**

The header always shows the connection state for the currently selected apartment.

### Shared Building KNX Access

If your shared building values or shared areas are on another KNX line and there is no separate IP gateway for that line, configure which apartment gateway can listen to those telegrams:

1. Open **Setup**
2. Go to **Shared Building Setup**
3. In **Shared KNX Access**, choose the apartment whose KNX gateway can receive the shared/main-line telegrams
4. Click **Save Shared Setup**

This is the apartment gateway used for:

- shared building information such as outside temperature or wind
- shared areas such as garden or garage
- shared KNX state updates and shared Hue polling

### Rooms & Functions

| Type | Description | DPT |
|------|-------------|-----|
| **Switch** | On/off toggle (e.g. lights, sockets) | DPT 1.001 |
| **Blind** | Position slider 0–100% | DPT 5.001 |
| **Scene** | Standalone scene trigger | DPT 17.001 |
| **Hue Lamp** | Philips Hue light toggle | — |
| **Room Temperature** | Optional room temperature badge in the dashboard header | DPT 9.001 |

---

## Philips Hue Integration

Hue lamps are controlled alongside KNX functions. Hue control uses **HTTP** to the local Hue Bridge, not the Hue cloud.

### Pairing the Bridge

1. Open **Setup**
2. In **Current Apartment → Philips Hue**, click **Discover Bridge**
3. If discovery does not find a bridge, enter the bridge IP manually
4. Press the physical link button on the bridge
5. Click **Pair**

Hue credentials are stored per apartment inside `backend/config.json`.

### Adding Hue Lamps to Rooms

1. Open **Rooms** and find the desired room
2. Click **+ Add Hue Lamp**
3. Select a lamp from the popup list (fetched live from the bridge)
4. The lamp appears inside the room functions for that apartment or shared area scope

### Hue Cards in the Dashboard

Hue lamps render as toggle buttons alongside KNX functions. Clicking toggles the lamp on/off. The UI updates immediately while the command is sent to the bridge in the background. If the command fails, the toggle reverts and an error toast appears.

---

## Using the Dashboard

Each apartment dashboard shows:

- the current apartment selected in the header switcher
- shared information for the whole building
- apartment-specific alarms
- private apartment areas and shared areas as tabs
- all rooms of the selected area in a card grid

### Room Card Layout

Each room card contains:
- **Scene buttons** for KNX scenes
- **Shade scenes** for blind presets
- **Function widgets** for switches, blinds, and Hue lamps
- **Optional room temperature badge** in the top right if a room temperature GA is configured and a valid value is available

### Switch / Hue Toggle

- Clicking the widget sends the command immediately (optimistic UI)
- The toggle reflects the real state once WebSocket confirmation arrives
- Shared areas automatically trigger actions in `shared` scope, apartment areas in `apartment` scope

### Blind Widget

- Drag the slider to set the blind position (0% = open, 100% = closed)
- The thin indicator bar on the right shows the **actual reported position** from the bus
- Wall-switch movements update the indicator automatically without moving the slider

---

## Using Rooms

### Areas

- Areas are shown as tabs
- Tabs can be reordered with drag and drop
- Use the tab-shaped **Add Area** button on the right to create a new area
- In the **Add Area** modal, choose whether the area is private or shared with all apartments
- Shared areas appear in every apartment

### Rooms

- Add rooms inside the currently selected area
- Rooms can be moved between areas
- Deleting areas or rooms uses the app's custom confirm dialog, not the native browser confirm

### Room Configuration

- Each room can contain KNX functions, Hue functions, scenes, and an optional room temperature GA
- Room temperature uses a filtered ETS picker for DPT `9.x`
- If no room temperature GA is configured, no temperature badge is shown on the dashboard

### Scene Configuration
- Each room has a single **Scene GA** (group address) shared by all scenes
- Add scenes with **+ Add Scene** for light or shade categories
- Each scene has a number (1–64) and a label that appears as a pill on the dashboard
- Scene numbers must match the scene numbers programmed in the KNX actuator

### Global Information & Alarms

The `Global Info & Alarms` panel inside **Rooms** is split into:

- **Shared Information**: building-wide values such as outside temperature, wind, or brightness
- **Apartment Alarms**: alarms that belong only to the currently selected apartment

Important behavior:

- shared information is stored under `building.sharedInfos`
- apartment alarms are stored under `apartments[n].alarms`
- global information GA pickers filter to DPT `9.x`
- alarm GA pickers filter to DPT `1.x`

---

## Using Setup

### Current Apartment

Use this section for apartment-specific data only:

- apartment name
- bookmarkable URL slug
- KNX gateway IP and port
- apartment ETS XML
- apartment Hue bridge

### Shared Building Setup

Use this section for building-level shared data:

- which apartment gateway provides access to the shared/other KNX line
- shared ETS XML for shared group addresses such as outside temperature, wind, garden, or garage

### Manage Apartments

- switch directly to another apartment from the list
- create a new apartment from the same page
- new apartments get their own slug, private areas, alarms, KNX, Hue, and ETS context

---

## Project Structure

```
knx-web-app/  (repo root)
├── install.sh
├── backend/
│   ├── server.js          # Express API + Socket.IO server (port 3001)
│   ├── knxService.js      # KNX IP connection & group address handling
│   ├── hueService.js      # Philips Hue bridge discovery, pairing, control
│   ├── configModel.js     # Config normalization and multi-apartment helpers
│   ├── config.json        # Runtime config (auto-created, not in git)
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── App.jsx         # Root component: routing, socket setup, apartment context
    │   ├── appModel.js     # Frontend helpers for apartment routing and config views
    │   ├── Dashboard.jsx   # Apartment dashboard with private + shared areas
    │   ├── Settings.jsx    # Rooms view: areas, rooms, scenes, globals/alarms
    │   ├── Connections.jsx # Setup view: apartment, shared building, apartment management
    │   ├── configApi.js    # Backend REST helpers
    │   ├── components/     # Floor tabs, modals, room cards, globals UI
    │   ├── __tests__/      # Frontend regression tests
    │   ├── index.css       # App styling
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
| `GET` | `/api/config` | Returns the full multi-apartment config |
| `POST` | `/api/config` | Saves config (partial updates supported) |
| `POST` | `/api/dev/load-config` | Loads `backend/config.dev.json` for development |

### KNX

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/api/action` | `{ apartmentId, scope, groupAddress, type, value, sceneNumber }` | Send a value to a KNX group address |

### Philips Hue

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/api/hue/discover` | `{ apartmentId }` | Auto-discover a bridge for an apartment |
| `POST` | `/api/hue/pair` | `{ apartmentId, bridgeIp }` | Pair an apartment with a bridge |
| `POST` | `/api/hue/unpair` | `{ apartmentId }` | Remove Hue credentials for an apartment |
| `GET` | `/api/hue/lights` | `?apartmentId&scope` | List lights for apartment or shared scope |
| `GET` | `/api/hue/rooms` | `?apartmentId&scope` | List Hue rooms for apartment or shared scope |
| `GET` | `/api/hue/scenes` | `?apartmentId&scope` | List Hue scenes for apartment or shared scope |
| `POST` | `/api/hue/action` | `{ apartmentId, scope, lightId, on }` | Turn a Hue light on or off |
| `POST` | `/api/config/rooms/:roomId/hue-room` | `{ apartmentId, scope, hueRoomId }` | Link a room to a Hue room |
| `DELETE` | `/api/config/rooms/:roomId/hue-room` | `?apartmentId&scope` | Unlink a room from a Hue room |
| `POST` | `/api/config/scenes/:sceneId/hue-scene` | `{ apartmentId, scope, hueSceneId }` | Link a KNX scene to a Hue scene |
| `DELETE` | `/api/config/scenes/:sceneId/hue-scene` | `?apartmentId&scope` | Unlink a KNX scene from a Hue scene |

### WebSocket Events (Socket.IO)

The backend emits the following events to all connected clients:

| Event | Payload | Description |
|-------|---------|-------------|
| `knx_status` | `{ apartmentId, scope, connected, msg }` | KNX connection state change for apartment or shared scope |
| `knx_initial_states` | `{ apartments, shared }` | Full KNX state snapshot on connect |
| `knx_state_update` | `{ apartmentId, scope, groupAddress, value }` | Single GA state change from bus |
| `knx_error` | `{ apartmentId, scope, msg }` | KNX error message |
| `hue_status` | `{ apartmentId, scope, paired, bridgeIp }` | Hue pairing state change for apartment or shared scope |
| `hue_states` | `{ apartmentId, scope, states }` | Full Hue state snapshot |
| `hue_state_update` | `{ apartmentId, scope, lightId, on }` | Single Hue light state change |

---

## Testing

Run the frontend tests:

```bash
cd frontend
npm test
```

Run the backend tests:

```bash
cd backend
npm test
```

There is dedicated regression coverage for:

- apartment routing and bookmarkable URLs
- config migration from the old single-apartment format
- shared vs apartment setup persistence
- area ordering across private and shared areas
- dashboard shared-scope actions
- backend multi-apartment config normalization

---

## Known Issues & Notes

### Shared scope depends on the selected apartment gateway
Shared building information and shared areas do not use their own KNX IP gateway. They are reachable through the apartment selected in `Shared Access via Apartment`. If that apartment gateway is offline or cannot hear the shared/main-line telegrams, shared values and shared rooms will also be offline.

### ⚠️ Port conflicts when restarting
If Vite starts on port 5174 instead of 5173, a stale process is occupying the port. Fix:
```bash
pkill -f "vite"; pkill -f "node server.js"
```
Then restart both servers.

### ℹ️ Hue Bridge uses HTTP (not HTTPS)
The backend communicates with the Hue Bridge via **HTTP** on the local network. HTTPS was intentionally disabled because the bridge uses a self-signed certificate which causes Node.js `fetch` to reject the connection.

### ℹ️ Optimistic UI for toggles
Switches and Hue toggles update instantly in the UI before the backend confirms the change. If the action fails, the UI reverts and shows an error toast.

### ℹ️ KNX scene numbers are 0-indexed on the bus
The app automatically subtracts 1 from the scene number you enter (e.g. scene `1` → bus value `0`). This is the KNX DPT 17.001 standard.
