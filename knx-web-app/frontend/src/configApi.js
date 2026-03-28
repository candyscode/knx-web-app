const API_BASE = 'http://localhost:3001/api';

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

export const triggerAction = async (actionData) => {
  const res = await fetch(`${API_BASE}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(actionData)
  });
  return res.json();
};
