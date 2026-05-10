# KNX Control

A local KNX web app for buildings with one or more apartments.

Each apartment can have:
- its own KNX IP gateway
- its own optional Philips Hue bridge
- its own ETS XML import
- its own private areas, rooms, scenes, functions, and alarms

In addition, the app supports a building-wide **Main Line** scope for:
- **Central Information** such as outside temperature, wind speed, or brightness
- **Shared areas** such as garden or garage that appear in all apartments

The app is designed for installations where the Main Line does **not** have its own IP gateway and is instead reached through one selected apartment gateway.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Starting the App](#starting-the-app)
- [Configuration Model](#configuration-model)
- [Apartment URLs](#apartment-urls)
- [Using the Dashboard](#using-the-dashboard)
- [Using Rooms](#using-rooms)
- [Using Setup](#using-setup)
- [ETS XML Strategy](#ets-xml-strategy)
- [Philips Hue Integration](#philips-hue-integration)
- [Config Export & Import](#config-export--import)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Operational Notes](#operational-notes)

---

## Overview

KNX Control separates the building into two scopes:

- **Apartment scope**
  Each apartment has its own KNX gateway, optional Hue bridge, ETS XML, private areas, and apartment alarms.
- **Main Line scope**
  Central KNX values and shared areas are configured once for the whole building and are accessed through one selected apartment gateway.

This matches real KNX installations where:
- apartments sit on separate lines
- the Main Line contains central values or common areas
- line couplers allow selected telegrams through
- there is no dedicated IP gateway on the Main Line

---

## Architecture

```text
┌─────────────────────┐      HTTP / WebSocket      ┌─────────────────────┐
│ Browser (React UI)  │ ◄────────────────────────► │ Backend (Node.js)   │
│ Apartment URLs      │                            │ Port 3001           │
└─────────────────────┘                            └──────────┬──────────┘
                                                              │
                                            KNX IP (UDP 3671) │ HTTP (local LAN)
                                                      ┌───────┴────────┐
                                                      │                │
                                          ┌───────────┴──────┐ ┌──────┴──────────┐
                                          │ Apartment KNX    │ │ Apartment Hue   │
                                          │ Gateways         │ │ Bridges         │
                                          └──────────────────┘ └─────────────────┘
```

- **Frontend**: React + Vite
- **Backend**: Express + Socket.IO
- **Persistence**: `backend/config.json`
- **KNX**: one live KNX context per apartment
- **Hue**: one optional Hue context per apartment
- **Main Line**: central values and shared areas are stored once on building level and are read through the selected apartment gateway

---

## Prerequisites

You need:

1. **Node.js** v18 or later
2. **npm**
3. A **KNX IP interface or router** per apartment that should be controlled
4. _(Optional)_ A **Philips Hue Bridge** per apartment

Important:

- The backend must run on the same local network as the KNX gateways and Hue bridges.
- If central values come from the **Main Line**, the selected apartment gateway must be able to hear those telegrams through the line coupler configuration.

---

## Installation

For Raspberry Pi or Debian-based Linux, use the installer:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/candyscode/knx-web-app/main/install.sh)
```

What it does:

- installs Node.js if needed
- clones or updates the repo into `~/.knx-web-app`
- builds the frontend
- installs only the backend runtime dependencies needed for the service
- registers the app as a `systemd` service

Convenience commands installed by the script:

- `knx-start`
- `knx-stop`
- `knx-restart`
- `knx-log`
- `knx-update`
- `knx-uninstall`

---

## Starting the App

For development:

```bash
# Backend
cd backend
npm install
node server.js

# Frontend
cd ../frontend
npm install
npm run dev
```

Development URLs:

- frontend: `http://localhost:5173`
- backend: `http://localhost:3001`

Production URL:

- `http://<device-ip>:3001`

If Vite switches to another port because `5173` is occupied:

```bash
pkill -f "vite"; pkill -f "node server.js"
```

---

## Configuration Model

The app uses a `building + apartments` model.

### Apartments

Each apartment stores:

- `name`
- `slug`
- `knxIp` / `knxPort`
- optional `hue`
- private `floors`
- `alarms`
- apartment ETS import

### Building

The building stores:

- `sharedAccessApartmentId`
- `sharedUsesApartmentImportedGroupAddresses`
- `sharedAreas`
- `sharedInfos`
- dedicated Main Line ETS import

### Practical meaning

- **Central Information** is configured once for the whole building
- **Apartment Alarms** stay apartment-specific
- **Shared areas** are shown in every apartment, but stored only once
- the **Main Line** does not have its own gateway in the model
- one apartment gateway is chosen as the technical access path to the Main Line

All config is saved automatically to:

```text
backend/config.json
```

There are no manual save buttons for normal setup fields anymore. Changes are persisted automatically.

---

## Apartment URLs

Every apartment has its own bookmarkable URL.

Examples:

- `/wohnung-ost`
- `/wohnung-west`
- `/wohnung-ost/rooms`
- `/wohnung-west/connections`

This means you can bookmark apartment dashboards directly.

---

## Using the Dashboard

Each apartment dashboard shows:

- the currently selected apartment
- **Central Information**
- **Apartment Alarms**
- private apartment areas
- shared areas

### Room cards

A room card can contain:

- light scenes
- shade scenes
- KNX functions
- Hue functions
- an optional room temperature badge

The room temperature badge is shown only when:

1. a room temperature GA is configured
2. a valid KNX value has been received

If there is no valid value, the badge is hidden completely.

### Central Information

Central information is intended for values like:

- outside temperature
- wind speed
- brightness / lux

These values are configured once and shown in all apartments.

### Shared areas in the dashboard

Shared areas still use the label **Shared** in the area tabs, because that label describes the UX correctly:
the area can be used from multiple apartments.

The underlying KNX setup for these areas is still documented as **Main Line** in Setup and README.

---

## Using Rooms

The `Rooms` section has two modes:

- **Rooms**
- **Global Info & Alarms**

Inside the `Global Info & Alarms` panel, the content is now split into:

- **Central Information**
- **Apartment Alarms**

### Areas

- Areas are displayed as tabs
- Areas can be reordered with drag and drop
- The tab-shaped **Add Area** control opens a modal
- In that modal you can create either:
  - a private area
  - a **Shared area for all apartments**

Shared areas appear in all apartments.

### Rooms

- Rooms belong to the currently selected area
- Rooms can be moved between areas
- Delete confirmations use the app's custom modal, not browser alerts

### Scenes

- Each room has one **Scene GA**
- All scenes in the room share that GA
- Scene numbers are entered as `1-64`
- The app automatically converts them to KNX `DPT 17.001` bus values

### Room temperature

- Every room can have an optional **Room Temperature GA**
- The picker is filtered to `DPT 9.x`
- If a compatible value is available, the dashboard shows it at the top right of the room card

### Group address helpers

Whenever a group address is entered manually or selected via ETS browse:

- the app tries to match it against the imported ETS XML
- the matching ETS name is shown below the field

---

## Using Setup

The Setup page has three groups:

- **Current Apartment**
- **Main Line Setup**
- **Manage Apartments**

### Current Apartment

Use this section for apartment-specific things only:

- apartment name
- bookmarkable slug
- KNX gateway IP / port
- apartment ETS XML
- apartment Hue bridge

### Main Line Setup

Use this section for building-wide KNX data:

- **Main Line Access**
  Choose which apartment gateway can listen to telegrams from the Main Line.
- **Main Line ETS XML**
  Upload the ETS export that contains central group addresses and Main Line addresses.

Examples:

- outside temperature
- wind speed
- garage
- garden

### Important behavior of the Main Line ETS XML card

The Main Line ETS XML is a **building-level** resource.

If the currently selected apartment is also the apartment that provides Main Line access:

- the card is editable
- you can upload a dedicated Main Line ETS XML
- or enable **Use Main Line apartment's ETS XML**

If another apartment provides Main Line access:

- the card becomes **read-only**
- it only shows the current state
- editing is disabled in the current apartment

This avoids confusing situations where, for example, `Wohnung West` tries to define how `Wohnung Ost` provides Main Line ETS browsing.

### Manage Apartments

From here you can:

- switch directly to another apartment
- create a new apartment
- export the full config
- import a full config backup

---

## ETS XML Strategy

There are two ETS XML layers:

### Apartment ETS XML

Used for:

- apartment functions
- apartment room temperature GAs
- apartment alarms

### Main Line ETS XML

Used for:

- Central Information
- shared areas that live on the Main Line
- other central KNX group addresses

### Optional shortcut

Instead of a dedicated Main Line ETS XML, you can choose:

- **Use Main Line apartment's ETS XML**

This is useful when your ETS export already contains:

- apartment addresses
- Main Line addresses
- central values

all in one XML.

---

## Philips Hue Integration

Hue is configured per apartment.

### Pairing

1. Open **Setup**
2. Go to **Current Apartment → Philips Hue**
3. Click **Discover Bridge** or enter the IP manually
4. Press the physical link button on the bridge
5. Click **Pair**

### Hue in shared areas

Shared areas can contain Hue-linked rooms or scenes as well.
Those use the same apartment context that provides the Main Line access.

---

## Config Export & Import

In **Setup → Manage Apartments → Full Config Backup** you can:

- export the complete current config as JSON
- import the complete config into another app instance

The full export includes everything:

- apartments
- slugs
- KNX IPs and ports
- Hue config
- private areas
- shared areas
- rooms
- scenes
- functions
- apartment alarms
- Central Information
- ETS XML imports
- Main Line access settings

Important:

- importing a config **overwrites** the current config
- the app shows a confirmation dialog before importing

---

## Project Structure

```text
knx-web-app/
├── install.sh
├── README.md
├── backend/
│   ├── server.js
│   ├── knxService.js
│   ├── hueService.js
│   ├── configModel.js
│   ├── config.json
│   └── package.json
└── frontend/
    ├── src/
    │   ├── App.jsx
    │   ├── Dashboard.jsx
    │   ├── Settings.jsx
    │   ├── Connections.jsx
    │   ├── appModel.js
    │   ├── configApi.js
    │   ├── components/
    │   ├── __tests__/
    │   ├── index.css
    │   └── main.jsx
    ├── index.html
    └── package.json
```

---

## API Reference

Backend default port: `3001`

### Config

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/config` | Return full config |
| `POST` | `/api/config` | Save full or partial config |
| `POST` | `/api/dev/load-config` | Load `backend/config.dev.json` |

### KNX

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/api/action` | `{ apartmentId, scope, groupAddress, type, value, sceneNumber }` | Send KNX action |

`scope` is still an internal API value:

- `apartment`
- `shared`

In the UI and README, this `shared` scope is presented as:

- **Main Line** for KNX setup
- **Central Information** for building-wide values
- **Shared areas** for areas visible in all apartments

### Hue

| Method | Path | Body / Query | Description |
|--------|------|--------------|-------------|
| `POST` | `/api/hue/discover` | `{ apartmentId }` | Discover bridge |
| `POST` | `/api/hue/pair` | `{ apartmentId, bridgeIp }` | Pair bridge |
| `POST` | `/api/hue/unpair` | `{ apartmentId }` | Unpair bridge |
| `GET` | `/api/hue/lights` | `?apartmentId&scope` | List Hue lights |
| `GET` | `/api/hue/rooms` | `?apartmentId&scope` | List Hue rooms |
| `GET` | `/api/hue/scenes` | `?apartmentId&scope` | List Hue scenes |
| `POST` | `/api/hue/action` | `{ apartmentId, scope, lightId, on }` | Toggle Hue light |
| `POST` | `/api/config/rooms/:roomId/hue-room` | `{ apartmentId, scope, hueRoomId }` | Link Hue room |
| `DELETE` | `/api/config/rooms/:roomId/hue-room` | `?apartmentId&scope` | Unlink Hue room |
| `POST` | `/api/config/scenes/:sceneId/hue-scene` | `{ apartmentId, scope, hueSceneId }` | Link Hue scene |
| `DELETE` | `/api/config/scenes/:sceneId/hue-scene` | `?apartmentId&scope` | Unlink Hue scene |

### WebSocket Events

| Event | Payload | Description |
|-------|---------|-------------|
| `knx_status` | `{ apartmentId, scope, connected, msg }` | KNX connection status |
| `knx_initial_states` | `{ apartments, shared }` | Full KNX snapshot |
| `knx_state_update` | `{ apartmentId, scope, groupAddress, value }` | Single KNX update |
| `knx_error` | `{ apartmentId, scope, msg }` | KNX error |
| `hue_status` | `{ apartmentId, scope, paired, bridgeIp }` | Hue status |
| `hue_states` | `{ apartmentId, scope, states }` | Hue state snapshot |
| `hue_state_update` | `{ apartmentId, scope, lightId, on }` | Single Hue update |

---

## Testing

Frontend:

```bash
cd frontend
npm test
```

Backend:

```bash
cd backend
npm test
```

There is explicit regression coverage for:

- apartment routing and bookmarkable URLs
- migration from the old single-apartment config
- Main Line vs apartment persistence
- ETS XML selection and DPT filtering
- dashboard rendering for central values
- room temperatures
- area ordering across private and shared areas
- config import/export

---

## Operational Notes

### Main Line values depend on the selected apartment gateway

There is no separate Main Line IP gateway in the model.

That means:

- Central Information
- shared areas
- Main Line ETS browsing

all depend on the apartment selected in **Main Line Access**.

If that gateway is offline, or if line couplers do not pass the relevant telegrams, Main Line values will not update.

### Hue uses local HTTP

Hue communication is intentionally local HTTP, not cloud access.
This avoids issues with the bridge's self-signed HTTPS certificate handling in Node.js.

### Optimistic UI

Some actions, especially switches and Hue toggles, update optimistically in the UI first.
If the backend action fails, the UI reverts and shows an error toast.

### Scene numbers

KNX `DPT 17.001` scene values are 0-based on the bus.
The app handles the conversion automatically:

- scene `1` in the UI -> bus value `0`
