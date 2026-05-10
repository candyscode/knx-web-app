'use strict';

const { APARTMENT_SHELL_ROUTE_PATTERN, shouldServeFrontendShell } = require('../../frontendFallback');

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

  it('matches apartment root routes explicitly', () => {
    expect(APARTMENT_SHELL_ROUTE_PATTERN.test('/wohnung-ost')).toBe(true);
    expect(APARTMENT_SHELL_ROUTE_PATTERN.test('/wohnung-west/automation')).toBe(true);
  });

  it('does not match api or asset routes explicitly', () => {
    expect(APARTMENT_SHELL_ROUTE_PATTERN.test('/api/config')).toBe(false);
    expect(APARTMENT_SHELL_ROUTE_PATTERN.test('/assets/index.js')).toBe(false);
  });
});
