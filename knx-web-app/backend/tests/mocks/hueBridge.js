function createJsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

class MockHueBridge {
  constructor() {
    this.bridgeIp = '192.168.1.20';
    this.discoveryResult = [{ id: 'bridge-1', internalipaddress: this.bridgeIp }];
    this.username = 'test-hue-user';
    this.requests = [];
    this.lights = {
      1: {
        name: 'Living Lamp',
        type: 'Extended color light',
        modelid: 'LCT015',
        state: { on: true, reachable: true },
      },
      2: {
        name: 'Desk Lamp',
        type: 'Dimmable light',
        modelid: 'LWB010',
        state: { on: false, reachable: true },
      },
    };
    this.groups = {
      1: { name: 'Living Room', type: 'Room', lights: ['1', '2'], action: { on: true } },
      2: { name: 'Zone', type: 'Zone', lights: ['2'], action: { on: false } },
    };
    this.scenes = {
      scene-1: { name: 'Bright', group: '1', type: 'GroupScene' },
      scene-2: { name: 'Off', group: '1', type: 'GroupScene' },
      scene-3: { name: 'Global', type: 'LightScene' },
    };
    this.failPairing = false;
  }

  async handleFetch(input, init = {}) {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init.method || 'GET').toUpperCase();
    const parsed = new URL(url);
    this.requests.push({ url, method, body: init.body ? JSON.parse(init.body) : undefined });

    if (url === 'https://discovery.meethue.com') {
      return createJsonResponse(this.discoveryResult);
    }

    if (parsed.hostname !== this.bridgeIp) {
      return createJsonResponse({ error: 'Bridge not found' }, 404);
    }

    const path = parsed.pathname;

    if (method === 'POST' && path === '/api') {
      if (this.failPairing) {
        return createJsonResponse([{ error: { description: 'link button not pressed' } }], 200);
      }
      return createJsonResponse([{ success: { username: this.username } }], 200);
    }

    if (method === 'GET' && path === `/api/${this.username}/lights`) {
      return createJsonResponse(this.lights);
    }

    if (method === 'PUT' && path.match(new RegExp(`^/api/${this.username}/lights/[^/]+/state$`))) {
      const lightId = path.split('/')[4];
      const body = JSON.parse(init.body || '{}');
      if (this.lights[lightId]) {
        this.lights[lightId].state.on = !!body.on;
      }
      return createJsonResponse([{ success: { [`/lights/${lightId}/state/on`]: !!body.on } }]);
    }

    if (method === 'GET' && path === `/api/${this.username}/groups`) {
      return createJsonResponse(this.groups);
    }

    if (method === 'GET' && path === `/api/${this.username}/scenes`) {
      return createJsonResponse(this.scenes);
    }

    if (method === 'GET' && path.match(new RegExp(`^/api/${this.username}/scenes/[^/]+$`))) {
      const sceneId = path.split('/')[4];
      return createJsonResponse(this.scenes[sceneId] || {}, this.scenes[sceneId] ? 200 : 404);
    }

    if (method === 'PUT' && path.match(new RegExp(`^/api/${this.username}/groups/[^/]+/action$`))) {
      const groupId = path.split('/')[4];
      const body = JSON.parse(init.body || '{}');
      if (this.groups[groupId]) {
        this.groups[groupId].action = { ...this.groups[groupId].action, ...body };
        if (typeof body.on === 'boolean') {
          this.groups[groupId].lights.forEach((lightId) => {
            if (this.lights[lightId]) {
              this.lights[lightId].state.on = body.on;
            }
          });
        }
      }
      return createJsonResponse([{ success: { [`/groups/${groupId}/action`]: body } }]);
    }

    return createJsonResponse({ error: 'Unhandled mock endpoint' }, 404);
  }
}

module.exports = MockHueBridge;
