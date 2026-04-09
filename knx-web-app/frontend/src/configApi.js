const API_BASE = `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/api`;

export const getConfig = async () => {
  const res = await fetch(`${API_BASE}/config`);
  return res.json();
};

export const updateConfig = async (data) => {
  const res = await fetch(`${API_BASE}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
};

export const loadDevConfig = async () => {
  const res = await fetch(`${API_BASE}/dev/load-config`, {
    method: 'POST'
  });
  return res.json();
};

export const triggerAction = async (actionData) => {
  const res = await fetch(`${API_BASE}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(actionData)
  });
  return res.json();
};

// ── Hue API ──

export const discoverHueBridge = async () => {
  const res = await fetch(`${API_BASE}/hue/discover`, { method: 'POST' });
  return res.json();
};

export const pairHueBridge = async (bridgeIp) => {
  const res = await fetch(`${API_BASE}/hue/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bridgeIp })
  });
  return res.json();
};

export const unpairHueBridge = async () => {
  const res = await fetch(`${API_BASE}/hue/unpair`, { method: 'POST' });
  return res.json();
};

export const getHueLights = async () => {
  const res = await fetch(`${API_BASE}/hue/lights`);
  return res.json();
};

export const getHueRooms = async () => {
  const res = await fetch(`${API_BASE}/hue/rooms`);
  return res.json();
};

export const getHueScenes = async () => {
  const res = await fetch(`${API_BASE}/hue/scenes`);
  return res.json();
};

export const linkHueRoom = async (roomId, hueRoomId) => {
  const res = await fetch(`${API_BASE}/config/rooms/${roomId}/hue-room`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hueRoomId })
  });
  return res.json();
};

export const unlinkHueRoom = async (roomId) => {
  const res = await fetch(`${API_BASE}/config/rooms/${roomId}/hue-room`, { method: 'DELETE' });
  return res.json();
};

export const linkHueScene = async (sceneId, hueSceneId) => {
  const res = await fetch(`${API_BASE}/config/scenes/${sceneId}/hue-scene`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hueSceneId })
  });
  return res.json();
};

export const unlinkHueScene = async (sceneId) => {
  const res = await fetch(`${API_BASE}/config/scenes/${sceneId}/hue-scene`, { method: 'DELETE' });
  return res.json();
};

export const triggerHueAction = async (lightId, on) => {
  const res = await fetch(`${API_BASE}/hue/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lightId, on })
  });
  return res.json();
};
