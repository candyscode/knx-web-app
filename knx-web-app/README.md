# KNX Web App

A local-first web UI for controlling KNX smart-home devices with optional Philips Hue bridge integration.

## Features

- Configure KNX rooms and functions through a browser UI
- Control switches, dimmers, blinds, and scenes
- Optional Philips Hue bridge discovery and pairing
- ETS XML import for faster group-address setup
- Production frontend served by the backend on one port

## Requirements

1. A **KNX IP Interface** or **KNX IP Router**
2. A machine on the **same local network** as the KNX bus gateway
3. Node.js 20+ for native/manual installs
4. _(Optional)_ A **Philips Hue Bridge** on the same local network

> **Important:** The backend and the KNX interface must be on the **same local network**. KNX communication uses UDP multicast and does not work across network boundaries (e.g. VPN).

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

## Installation & Deployment

You now have two supported ways to run the app in production:

| Option | Best for | Why choose it |
|------|------|------|
| **Native installer (`install.sh`)** | Raspberry Pi or Debian/Ubuntu hosts that should behave like an appliance | Installs dependencies for you, registers a `systemd` service, starts on boot, and adds `knx-start` / `knx-stop` / `knx-update` commands |
| **Docker (`compose.yaml`)** | Hosts that already use Docker and where you want a contained runtime | Keeps app dependencies isolated, makes upgrades predictable, and only requires Docker + Docker Compose |

If you want the most "plug it in and forget it" setup on a Raspberry Pi, use the native installer. If you already manage services with Docker or want a clean rollback/rebuild path, use Docker.

### Native Install & Upgrades

We provide a script to securely install Node.js, npm, and the KNX Web App via a single command onto a Raspberry Pi, or any Debian-based Linux OS. This script can also be used to seamlessly upgrade an existing install when a new release is passed to the main branch.

Run the following command in your terminal to download and start the installation:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/candyscode/AI/main/knx-web-app/install.sh)
```

This script will explain what it's about to do and pause to let you confirm. Under the hood, it performs the following:
* If no Node.js is detected, it automatically installs Node.js v20 LTS securely via NodeSource.
* Clones (or updates) the application safely into a dedicated `~/.knx-web-app` home directory.
* Compiles the React frontend into an optimized production-build bundle.
* Automatically registers the application as a `systemd` background service so it will survive reboots and keep running effortlessly.

---

### Working with the background service (CLI)

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

### Docker Deployment

The Docker path is an additional deployment option. It uses the same production model as the native install: the backend serves the built frontend on **port `3001`**.

#### What Docker exposes

- **TCP `3001`**: Web UI, API, and Socket.IO traffic
- **Outbound UDP `3671`**: Container talks from the app to your KNX IP interface
- **Outbound HTTP on your LAN**: Container talks to the Philips Hue bridge

You only need to publish **port `3001`** on the Docker host. KNX and Hue communication are outbound connections from the container to devices on your LAN.

#### Quick start

From the `knx-web-app` directory:

```bash
mkdir -p data
docker compose up -d --build
```

Then open:

- On the same machine: `http://localhost:3001`
- From another device on your LAN: `http://<docker-host-ip>:3001`

The app configuration is stored in `./data/config.json` on the host so it survives container rebuilds and upgrades.

Useful commands:

```bash
docker compose logs -f
docker compose ps
docker compose pull
docker compose up -d --build
docker compose down
```

#### LAN access

If the container is running on a Raspberry Pi, mini PC, or NAS, other devices on your local network should access it via the Docker host's LAN IP address, for example:

```text
http://192.168.1.50:3001
```

If that does not work, check the obvious network path first:

1. The browser device and Docker host are on the same LAN/subnet.
2. Port `3001/tcp` is not blocked by the host firewall.
3. You are not trying to use `localhost` from another device. `localhost` only points to the device you are currently using.

#### Common Docker gotchas

- The app is still a **local-network** application. The container must be able to reach the KNX interface IP and Hue bridge IP directly from the Docker host's network.
- Do **not** set `VITE_BACKEND_URL` for the normal Docker deployment. The frontend and backend are served together by the same container already.
- Rebuilding the image does not erase settings as long as you keep the `./data` bind mount.
- If you change the published port in `compose.yaml`, use the new host-side port in the browser URL. Example: `8080:3001` means browse to `http://<host-ip>:8080`.
- If `docker compose up` fails because port `3001` is already in use, stop the native service or any old container first.

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
