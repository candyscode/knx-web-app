/**
 * Manual mock for socket.io-client.
 * Used by Vitest when components call `io(...)`.
 * 
 * Returns a mock socket object with jest-like spy functions.
 * Tests can interact via: import { getMockSocket } from './__mocks__/socket.io-client'
 */

const listeners = {};

const mockSocket = {
  on: (event, cb) => {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(cb);
  },
  off: (event, cb) => {
    if (listeners[event]) {
      listeners[event] = listeners[event].filter(fn => fn !== cb);
    }
  },
  disconnect: vi.fn(),
  connect: vi.fn(),
  emit: vi.fn(),
  connected: true,
};

// Helper to fire an event from "the server" in tests
export function triggerSocketEvent(event, data) {
  (listeners[event] || []).forEach(cb => cb(data));
}

// Helper to reset all listeners between tests
export function resetSocketMock() {
  Object.keys(listeners).forEach(k => delete listeners[k]);
  mockSocket.disconnect.mockClear();
  mockSocket.emit.mockClear();
}

export function io() {
  return mockSocket;
}

export { mockSocket };
export default { io };
