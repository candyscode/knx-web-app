const path = require('path');

const APARTMENT_SHELL_ROUTE_PATTERN = /^\/(?!(?:api|socket\.io)(?:\/|$))[^./]+(?:\/(?:rooms|connections|automation))?\/?$/i;

function shouldServeFrontendShell(req) {
  const method = String(req?.method || '').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return false;

  const requestPath = String(req?.path || req?.url || '');
  if (!requestPath) return false;

  if (requestPath.startsWith('/api') || requestPath.startsWith('/socket.io')) {
    return false;
  }

  // Let real asset requests 404 normally instead of returning index.html.
  if (path.extname(requestPath)) return false;

  return true;
}

module.exports = {
  APARTMENT_SHELL_ROUTE_PATTERN,
  shouldServeFrontendShell,
};
