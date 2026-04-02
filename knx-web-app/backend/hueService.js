// Hue Bridge local API v1 allows HTTP on port 80

class HueService {
  constructor() {
    this.bridgeIp = null;
    this.apiKey = null;
  }

  /**
   * Initialize from persisted config
   */
  init(hueConfig) {
    if (hueConfig) {
      this.bridgeIp = hueConfig.bridgeIp || null;
      this.apiKey = hueConfig.apiKey || null;
    }
  }

  get isPaired() {
    return !!(this.bridgeIp && this.apiKey);
  }

  /**
   * Discover Hue Bridges on the LAN via Philips cloud discovery
   * Returns array of { id, internalipaddress }
   */
  async discoverBridges() {
    try {
      const res = await fetch('https://discovery.meethue.com', { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`Discovery returned ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('Hue bridge discovery failed:', err.message);
      return [];
    }
  }

  /**
   * Pair with a Hue Bridge (push-link).
   * User must press the Link button on the bridge within 30s before calling this.
   * Returns { success, apiKey?, error? }
   */
  async pairBridge(bridgeIp) {
    try {
      const res = await fetch(`http://${bridgeIp}/api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devicetype: 'knx_web_app#home_controller', generateclientkey: true }),
        signal: AbortSignal.timeout(10000),
      });

      const data = await res.json();

      // Hue API returns an array
      if (Array.isArray(data) && data.length > 0) {
        const entry = data[0];
        if (entry.error) {
          return { success: false, error: entry.error.description || 'Pairing failed' };
        }
        if (entry.success && entry.success.username) {
          this.bridgeIp = bridgeIp;
          this.apiKey = entry.success.username;
          return { success: true, apiKey: this.apiKey };
        }
      }

      return { success: false, error: 'Unexpected response from bridge' };
    } catch (err) {
      console.error('Hue pairing error:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Unpair — clear stored credentials
   */
  unpair() {
    this.bridgeIp = null;
    this.apiKey = null;
  }

  /**
   * Get all lights from the paired bridge.
   * Returns { id, name, on, reachable } for each light.
   */
  async getLights() {
    if (!this.isPaired) return { success: false, error: 'Not paired', lights: [] };

    try {
      const res = await fetch(`http://${this.bridgeIp}/api/${this.apiKey}/lights`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) throw new Error(`Bridge returned ${res.status}`);
      const data = await res.json();

      // data is an object keyed by light ID
      const lights = Object.entries(data).map(([id, light]) => ({
        id,
        name: light.name,
        on: light.state?.on ?? false,
        reachable: light.state?.reachable ?? false,
        type: light.type,
        modelid: light.modelid,
      }));

      return { success: true, lights };
    } catch (err) {
      console.error('Failed to get Hue lights:', err.message);
      return { success: false, error: err.message, lights: [] };
    }
  }

  /**
   * Set a single light's on/off state
   */
  async setLightState(lightId, on) {
    if (!this.isPaired) return { success: false, error: 'Not paired' };

    try {
      const res = await fetch(`http://${this.bridgeIp}/api/${this.apiKey}/lights/${lightId}/state`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ on: !!on }),
        signal: AbortSignal.timeout(5000),
      });

      const data = await res.json();
      return { success: true, data };
    } catch (err) {
      console.error(`Failed to set Hue light ${lightId}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Get states for multiple lights at once (used for polling).
   * Returns a map: { lightId: boolean (on/off) }
   */
  async getLightStates(lightIds) {
    if (!this.isPaired || lightIds.length === 0) return {};

    try {
      const res = await fetch(`http://${this.bridgeIp}/api/${this.apiKey}/lights`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) return {};
      const data = await res.json();

      const states = {};
      for (const id of lightIds) {
        if (data[id]) {
          states[`hue_${id}`] = data[id].state?.on ?? false;
        }
      }
      return states;
    } catch (err) {
      console.error('Failed to poll Hue light states:', err.message);
      return {};
    }
  }

  /**
   * Get all rooms (groups of type Room) from the paired bridge.
   * Returns array of { id, name, lights }
   */
  async getRooms() {
    if (!this.isPaired) return { success: false, error: 'Not paired', rooms: [] };

    try {
      const res = await fetch(`http://${this.bridgeIp}/api/${this.apiKey}/groups`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) throw new Error(`Bridge returned ${res.status}`);
      const data = await res.json();

      const rooms = Object.entries(data)
        .filter(([, g]) => g.type === 'Room')
        .map(([id, g]) => ({
          id,
          name: g.name,
          lights: g.lights || [],
        }));

      return { success: true, rooms };
    } catch (err) {
      console.error('Failed to get Hue rooms:', err.message);
      return { success: false, error: err.message, rooms: [] };
    }
  }

  /**
   * Get all scenes from the paired bridge.
   * Returns array of { id, name, group, type }
   */
  async getScenes() {
    if (!this.isPaired) return { success: false, error: 'Not paired', scenes: [] };

    try {
      const res = await fetch(`http://${this.bridgeIp}/api/${this.apiKey}/scenes`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) throw new Error(`Bridge returned ${res.status}`);
      const data = await res.json();

      const scenes = Object.entries(data).map(([id, s]) => ({
        id,
        name: s.name,
        group: s.group || null,
        type: s.type || 'LightScene',
      }));

      return { success: true, scenes };
    } catch (err) {
      console.error('Failed to get Hue scenes:', err.message);
      return { success: false, error: err.message, scenes: [] };
    }
  }

  /**
   * Trigger a Hue scene by scene ID.
   */
  async triggerScene(sceneId) {
    if (!this.isPaired) return { success: false, error: 'Not paired' };

    try {
      // Scenes are triggered via the group endpoint
      // We need to find the group associated with the scene
      const scenesRes = await fetch(`http://${this.bridgeIp}/api/${this.apiKey}/scenes/${sceneId}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!scenesRes.ok) throw new Error(`Bridge returned ${scenesRes.status}`);
      const sceneData = await scenesRes.json();

      const groupId = sceneData.group;
      if (!groupId) {
        // Fallback: use group 0 (all lights)
        const res = await fetch(`http://${this.bridgeIp}/api/${this.apiKey}/groups/0/action`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scene: sceneId }),
          signal: AbortSignal.timeout(5000),
        });
        const data = await res.json();
        return { success: true, data };
      }

      const res = await fetch(`http://${this.bridgeIp}/api/${this.apiKey}/groups/${groupId}/action`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene: sceneId }),
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json();
      return { success: true, data };
    } catch (err) {
      console.error(`Failed to trigger Hue scene ${sceneId}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Turn off an entire Hue room (group) by group ID.
   */
  async turnOffRoom(groupId) {
    if (!this.isPaired) return { success: false, error: 'Not paired' };

    try {
      const res = await fetch(`http://${this.bridgeIp}/api/${this.apiKey}/groups/${groupId}/action`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ on: false }),
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json();
      return { success: true, data };
    } catch (err) {
      console.error(`Failed to turn off Hue room ${groupId}:`, err.message);
      return { success: false, error: err.message };
    }
  }
}

module.exports = HueService;
