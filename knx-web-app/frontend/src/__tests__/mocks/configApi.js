// Mock API responses
export const mockConfig = {
  knxIp: '192.168.1.50',
  knxPort: 3671,
  hue: {
    bridgeIp: '192.168.1.100',
    apiKey: 'test-api-key'
  },
  rooms: [
    {
      id: 'room-1',
      name: 'Living Room',
      sceneGroupAddress: '2/1/0',
      scenes: [
        { id: 'scene-1', name: 'Off', sceneNumber: 1, category: 'light' },
        { id: 'scene-2', name: 'Bright', sceneNumber: 2, category: 'light' }
      ],
      functions: [
        { id: 'func-1', name: 'Main Light', type: 'switch', groupAddress: '1/1/1', statusGroupAddress: '1/1/2' },
        { id: 'func-2', name: 'Blinds', type: 'percentage', groupAddress: '1/2/1', statusGroupAddress: '1/2/2', movingGroupAddress: '1/2/3' }
      ]
    },
    {
      id: 'room-2',
      name: 'Kitchen',
      sceneGroupAddress: '2/2/0',
      scenes: [],
      functions: [
        { id: 'func-3', name: 'Spot 1', type: 'hue', hueLightId: '1' }
      ]
    }
  ]
}

export const mockHueLights = [
  { id: '1', name: 'Kitchen Spot 1', type: 'Extended color light', on: true, reachable: true },
  { id: '2', name: 'Living Room Lamp', type: 'Extended color light', on: false, reachable: true },
  { id: '3', name: 'Bedroom Ceiling', type: 'Dimmable light', on: false, reachable: false }
]

export const mockHueRooms = [
  { id: '1', name: 'Living Room', lights: ['2'] },
  { id: '2', name: 'Kitchen', lights: ['1'] },
  { id: '3', name: 'Bedroom', lights: ['3'] }
]

export const mockHueScenes = [
  { id: 'scene-1', name: 'Relax', group: '1' },
  { id: 'scene-2', name: 'Concentrate', group: '1' },
  { id: 'scene-3', name: 'Evening', group: '2' }
]

// Mock fetch responses
export function setupFetchMock(successData = { success: true }) {
  global.fetch = vi.fn((url, options = {}) => {
    const method = options.method || 'GET'
    
    // Config endpoints
    if (url.includes('/api/config')) {
      if (method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockConfig)
        })
      }
      if (method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, config: { ...mockConfig, ...JSON.parse(options.body) } })
        })
      }
    }
    
    // Action endpoints
    if (url.includes('/api/action')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })
    }
    
    // Hue discovery
    if (url.includes('/api/hue/discover')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          bridges: [{ id: 'bridge-1', internalipaddress: '192.168.1.100' }]
        })
      })
    }
    
    // Hue pair
    if (url.includes('/api/hue/pair')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, apiKey: 'test-api-key-123' })
      })
    }
    
    // Hue unpair
    if (url.includes('/api/hue/unpair')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })
    }
    
    // Hue lights
    if (url.includes('/api/hue/lights')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, lights: mockHueLights })
      })
    }
    
    // Hue rooms
    if (url.includes('/api/hue/rooms')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, rooms: mockHueRooms })
      })
    }
    
    // Hue scenes
    if (url.includes('/api/hue/scenes')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, scenes: mockHueScenes })
      })
    }
    
    // Hue action
    if (url.includes('/api/hue/action')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })
    }
    
    // Default success response
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(successData)
    })
  })
}

// Reset mocks
export function resetFetchMock() {
  if (global.fetch && global.fetch.mockClear) {
    global.fetch.mockClear()
  }
}
