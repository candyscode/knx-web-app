const path = require('path');
const express = require('express');

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

function mountFrontendShell(app, distPath) {
  const serveFrontendShell = (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  };

  app.use((req, res, next) => {
    if (req.path === '/' || APARTMENT_SHELL_ROUTE_PATTERN.test(req.path)) {
      serveFrontendShell(req, res);
      return;
    }

    next();
  });

  app.use(express.static(distPath));

  app.get(APARTMENT_SHELL_ROUTE_PATTERN, serveFrontendShell);
  app.head(APARTMENT_SHELL_ROUTE_PATTERN, serveFrontendShell);

  app.use((req, res, next) => {
    if (!shouldServeFrontendShell(req)) {
      next();
      return;
    }

    serveFrontendShell(req, res);
  });
}

module.exports = {
  APARTMENT_SHELL_ROUTE_PATTERN,
  mountFrontendShell,
  shouldServeFrontendShell,
};
