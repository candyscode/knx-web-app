import '@testing-library/jest-dom';

// Mock import.meta.env for Vitest
Object.defineProperty(globalThis, 'import', {
  value: { meta: { env: { VITE_BACKEND_URL: 'http://localhost:3001' } } },
  writable: true,
});
