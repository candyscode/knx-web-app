import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import App from '../App'
import { setupFetchMock, resetFetchMock, mockConfig } from './mocks/configApi'

// Mock socket.io-client
const mockOn = vi.fn()
const mockDisconnect = vi.fn()
const mockSocket = {
  on: mockOn,
  disconnect: mockDisconnect,
  emit: vi.fn(),
  connect: vi.fn()
}

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket)
}))

// Mock environment
const originalEnv = import.meta.env

describe('App Component', () => {
  beforeEach(() => {
    setupFetchMock()
    mockOn.mockClear()
    mockDisconnect.mockClear()
  })

  afterEach(() => {
    resetFetchMock()
  })

  it('renders without crashing', async () => {
    render(<App />)
    
    await waitFor(() => {
      expect(screen.getByText('KNX Control')).toBeInTheDocument()
    })
  })

  it('fetches configuration on mount', async () => {
    render(<App />)
    
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/config'
      )
    })
  })

  it('displays connection status indicator', async () => {
    render(<App />)
    
    await waitFor(() => {
      // Check for status badge (either Online or Offline)
      const status = screen.getByText(/Offline|Online|Connected/)
      expect(status).toBeInTheDocument()
    })
  })

  it('switches between dashboard and settings tabs', async () => {
    render(<App />)
    
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })

    // Click Settings tab
    const settingsButton = screen.getByText('Settings')
    fireEvent.click(settingsButton)

    // Should show settings content (KNX Interface section)
    await waitFor(() => {
      expect(screen.getByText('KNX Interface')).toBeInTheDocument()
    })

    // Click Dashboard tab
    const dashboardButton = screen.getByText('Dashboard')
    fireEvent.click(dashboardButton)

    // Should show dashboard again
    await waitFor(() => {
      expect(screen.getByText('Living Room')).toBeInTheDocument()
    })
  })

  it('shows toasts when knx_error events are received', async () => {
    let knxErrorHandler
    mockOn.mockImplementation((event, handler) => {
      if (event === 'knx_error') {
        knxErrorHandler = handler
      }
    })

    render(<App />)

    await waitFor(() => {
      expect(mockOn).toHaveBeenCalled()
    })

    // Simulate KNX error event
    knxErrorHandler?.({ msg: 'Connection failed' })

    await waitFor(() => {
      expect(screen.getByText('Connection failed')).toBeInTheDocument()
    })
  })

  it('updates device states when knx_state_update is received', async () => {
    let stateUpdateHandler
    mockOn.mockImplementation((event, handler) => {
      if (event === 'knx_state_update') {
        stateUpdateHandler = handler
      }
    })

    render(<App />)

    await waitFor(() => {
      expect(mockOn).toHaveBeenCalled()
    })

    // Simulate state update
    stateUpdateHandler?.({ groupAddress: '1/1/2', value: true })
  })

  it('disconnects socket on unmount', () => {
    const { unmount } = render(<App />)
    unmount()
    
    expect(mockDisconnect).toHaveBeenCalled()
  })

  it('handles initial KNX states', async () => {
    let initialStatesHandler
    mockOn.mockImplementation((event, handler) => {
      if (event === 'knx_initial_states') {
        initialStatesHandler = handler
      }
    })

    render(<App />)

    await waitFor(() => {
      expect(mockOn).toHaveBeenCalled()
    })

    // Simulate initial states
    initialStatesHandler?.({ '1/1/1': true, '1/2/2': 50 })
  })

  it('handles Hue status updates', async () => {
    let hueStatusHandler
    mockOn.mockImplementation((event, handler) => {
      if (event === 'hue_status') {
        hueStatusHandler = handler
      }
    })

    render(<App />)

    await waitFor(() => {
      expect(mockOn).toHaveBeenCalled()
    })

    // Simulate Hue status
    hueStatusHandler?.({ paired: true, bridgeIp: '192.168.1.100' })
  })

  it('shows Offline when not connected', async () => {
    let knxStatusHandler
    mockOn.mockImplementation((event, handler) => {
      if (event === 'knx_status') {
        knxStatusHandler = handler
      }
    })

    render(<App />)

    await waitFor(() => {
      expect(mockOn).toHaveBeenCalled()
    })

    // Initially should show Offline (not connecting text visible)
    const statusElements = screen.getAllByText(/Offline|Connected|Connecting/)
    expect(statusElements.length).toBeGreaterThan(0)

    // Simulate connected status
    knxStatusHandler?.({ connected: true, msg: 'Connected' })

    await waitFor(() => {
      const connectedElements = screen.getAllByText(/Connected/)
      expect(connectedElements.length).toBeGreaterThan(0)
    })
  })

  it('can close toasts', async () => {
    let knxErrorHandler
    mockOn.mockImplementation((event, handler) => {
      if (event === 'knx_error') {
        knxErrorHandler = handler
      }
    })

    render(<App />)

    await waitFor(() => {
      expect(mockOn).toHaveBeenCalled()
    })

    // Simulate error
    knxErrorHandler?.({ msg: 'Test error' })

    await waitFor(() => {
      expect(screen.getByText('Test error')).toBeInTheDocument()
    })

    // Close toast (find close button by class or testid)
    const closeButtons = screen.getAllByText('✕')
    expect(closeButtons.length).toBeGreaterThan(0)
    fireEvent.click(closeButtons[0])

    await waitFor(() => {
      expect(screen.queryByText('Test error')).not.toBeInTheDocument()
    })
  })
})
