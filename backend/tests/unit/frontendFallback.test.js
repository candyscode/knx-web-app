'use strict';

const { shouldServeFrontendShell } = require('../../frontendFallback');

describe('shouldServeFrontendShell', () => {
  it('serves the app shell for apartment deep links', () => {
    expect(shouldServeFrontendShell({
      method: 'GET',
      path: '/wohnung-ost/connections',
    })).toBe(true);
  });

  it('serves the app shell for apartment dashboard links', () => {
    expect(shouldServeFrontendShell({
      method: 'GET',
      path: '/wohnung-west',
    })).toBe(true);
  });

  it('does not serve the app shell for API routes', () => {
    expect(shouldServeFrontendShell({
      method: 'GET',
      path: '/api/config',
    })).toBe(false);
  });

  it('does not serve the app shell for socket routes', () => {
    expect(shouldServeFrontendShell({
      method: 'GET',
      path: '/socket.io/',
    })).toBe(false);
  });

  it('does not serve the app shell for non-GET browser mutations', () => {
    expect(shouldServeFrontendShell({
      method: 'POST',
      path: '/wohnung-ost/connections',
    })).toBe(false);
  });

  it('does not serve the app shell for asset requests', () => {
    expect(shouldServeFrontendShell({
      method: 'GET',
      path: '/assets/index-Bn6DoZAu.js',
    })).toBe(false);
  });
});
