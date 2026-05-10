const getApiBase = () => {
  if (import.meta.env.VITE_BACKEND_URL) return `${import.meta.env.VITE_BACKEND_URL}/api`;
  if (import.meta.env.DEV) return 'http://localhost:3001/api';
  return '/api';
};

const API_BASE = getApiBase();

const withQuery = (path, params = {}) => {
  const url = new URL(path, 'http://localhost');
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, value);
  });
  return `${API_BASE}${url.pathname}${url.search}`;
};

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

export const verifyConfigPassword = async (password) => {
  const res = await fetch(`${API_BASE}/config-protection/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  return res.json();
};

export const setConfigPassword = async (password) => {
  const res = await fetch(`${API_BASE}/config-protection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  return res.json();
};

export const removeConfigPassword = async (password) => {
  const res = await fetch(`${API_BASE}/config-protection`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
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

export const refreshKnxStatuses = async (apartmentId) => {
  const res = await fetch(`${API_BASE}/knx/refresh-statuses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apartmentId }),
  });
  return res.json();
};

export const discoverHueBridge = async (apartmentId) => {
  const res = await fetch(`${API_BASE}/hue/discover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apartmentId })
  });
  return res.json();
};

export const pairHueBridge = async (apartmentId, bridgeIp) => {
  const res = await fetch(`${API_BASE}/hue/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apartmentId, bridgeIp })
  });
  return res.json();
};

export const unpairHueBridge = async (apartmentId) => {
  const res = await fetch(`${API_BASE}/hue/unpair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apartmentId })
  });
  return res.json();
};

export const getHueLights = async ({ apartmentId, scope = 'apartment' } = {}) => {
  const res = await fetch(withQuery('/hue/lights', { apartmentId, scope }));
  return res.json();
};

export const getHueRooms = async ({ apartmentId, scope = 'apartment' } = {}) => {
  const res = await fetch(withQuery('/hue/rooms', { apartmentId, scope }));
  return res.json();
};

export const getHueScenes = async ({ apartmentId, scope = 'apartment' } = {}) => {
  const res = await fetch(withQuery('/hue/scenes', { apartmentId, scope }));
  return res.json();
};

export const linkHueRoom = async (roomId, hueRoomId, { apartmentId, scope = 'apartment' } = {}) => {
  const res = await fetch(`${API_BASE}/config/rooms/${roomId}/hue-room`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apartmentId, scope, hueRoomId })
  });
  return res.json();
};

export const unlinkHueRoom = async (roomId, { apartmentId, scope = 'apartment' } = {}) => {
  const res = await fetch(withQuery(`/config/rooms/${roomId}/hue-room`, { apartmentId, scope }), {
    method: 'DELETE'
  });
  return res.json();
};

export const linkHueScene = async (sceneId, hueSceneId, { apartmentId, scope = 'apartment', hueSceneName } = {}) => {
  const res = await fetch(`${API_BASE}/config/scenes/${sceneId}/hue-scene`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apartmentId, scope, hueSceneId, hueSceneName })
  });
  return res.json();
};

export const unlinkHueScene = async (sceneId, { apartmentId, scope = 'apartment' } = {}) => {
  const res = await fetch(withQuery(`/config/scenes/${sceneId}/hue-scene`, { apartmentId, scope }), {
    method: 'DELETE'
  });
  return res.json();
};

export const triggerHueAction = async (lightId, on, { apartmentId, scope = 'apartment' } = {}) => {
  const res = await fetch(`${API_BASE}/hue/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apartmentId, scope, lightId, on })
  });
  return res.json();
};
