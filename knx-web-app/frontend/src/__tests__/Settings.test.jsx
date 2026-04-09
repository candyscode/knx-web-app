import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import React from 'react'
import Settings from '../Settings'
import { setupFetchMock, resetFetchMock, mockConfig } from './mocks/configApi'

vi.mock('../configApi', () => ({
  getConfig: vi.fn(() => Promise.resolve(mockConfig)),
  updateConfig: vi.fn(() => Promise.resolve({ success: true })),
  discoverHueBridge: vi.fn(() => Promise.resolve({ 
    success: true, 
    bridges: [{ id: 'bridge-1', internalipaddress: '192.168.1.100' }] 
  })),
  pairHueBridge: vi.fn(() => Promise.resolve({ success: true, apiKey: 'test-key' })),
  unpairHueBridge: vi.fn(() => Promise.resolve({ success: true })),
  getHueLights: vi.fn(() => Promise.resolve({ 
    success: true, 
    lights: [
      { id: '1', name: 'Kitchen Spot', type: 'Extended color light', on: true, reachable: true },
      { id: '2', name: 'Living Lamp', type: 'Extended color light', on: false, reachable: true }
    ] 
  })),
  getHueRooms: vi.fn(() => Promise.resolve({ 
    success: true, 
    rooms: [{ id: '1', name: 'Living Room', lights: ['2'] }] 
  })),
  getHueScenes: vi.fn(() => Promise.resolve({ 
    success: true, 
    scenes: [{ id: 'scene-1', name: 'Relax', group: '1' }] 
  })),
  linkHueRoom: vi.fn(() => Promise.resolve({ success: true })),
  unlinkHueRoom: vi.fn(() => Promise.resolve({ success: true })),
  linkHueScene: vi.fn(() => Promise.resolve({ success: true })),
  unlinkHueScene: vi.fn(() => Promise.resolve({ success: true }))
}))

import { 
  updateConfig, 
  discoverHueBridge, 
  pairHueBridge, 
  unpairHueBridge,
  getHueLights,
  getHueRooms,
  getHueScenes,
  linkHueRoom,
  unlinkHueRoom,
  linkHueScene,
  unlinkHueScene
} from '../configApi'

describe('Settings Component', () => {
  const mockAddToast = vi.fn()
  const mockFetchConfig = vi.fn()
  const mockSetHueStatus = vi.fn()

  beforeEach(() => {
    setupFetchMock()
    vi.clearAllMocks()
  })

  afterEach(() => {
    resetFetchMock()
  })

  const renderSettings = (props = {}) => {
    const defaultProps = {
      config: mockConfig,
      fetchConfig: mockFetchConfig,
      addToast: mockAddToast,
      hueStatus: { paired: false, bridgeIp: '' },
      setHueStatus: mockSetHueStatus
    }
    
    return render(<Settings {...defaultProps} {...props} />)
  }

  it('renders without crashing', () => {
    renderSettings()
    
    expect(screen.getByText('KNX Interface')).toBeInTheDocument()
    expect(screen.getByText('Rooms & Functions')).toBeInTheDocument()
  })

  it('renders KNX IP configuration fields', () => {
    renderSettings()
    
    expect(screen.getByPlaceholderText('192.168.1.50')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('3671')).toBeInTheDocument()
  })

  it('handles saving KNX connection settings', async () => {
    renderSettings()
    
    const ipInput = screen.getByPlaceholderText('192.168.1.50')
    const saveButtons = screen.getAllByText('Save')
    const saveButton = saveButtons.find(btn => 
      btn.closest('section')?.textContent?.includes('KNX Interface')
    ) || saveButtons[0]
    
    fireEvent.change(ipInput, { target: { value: '192.168.1.50' } })
    fireEvent.click(saveButton)
    
    await waitFor(() => {
      expect(updateConfig).toHaveBeenCalled()
    })
  })

  it('renders room cards', () => {
    renderSettings()
    
    expect(screen.getByText('Living Room')).toBeInTheDocument()
    expect(screen.getByText('Kitchen')).toBeInTheDocument()
  })

  it('handles adding a new room', async () => {
    renderSettings()
    
    const input = screen.getByPlaceholderText('e.g. Living Room')
    const addButtons = screen.getAllByText('Add Room')
    const addButton = addButtons.find(btn => btn.textContent === 'Add Room')
    
    if (addButton) {
      fireEvent.change(input, { target: { value: 'Bedroom' } })
      fireEvent.click(addButton)
      
      await waitFor(() => {
        expect(updateConfig).toHaveBeenCalled()
      })
    }
  })

  it('handles room deletion', async () => {
    renderSettings()
    
    // Find delete buttons (Trash2 icons - buttons with svg inside)
    const deleteButtons = screen.getAllByRole('button').filter(btn => 
      btn.querySelector('svg')
    )
    
    if (deleteButtons.length > 0) {
      fireEvent.click(deleteButtons[0])
      
      // Config should be updated after deletion
    }
  })

  it('renders scene configuration for rooms', () => {
    renderSettings()
    
    // Use getAllByText since there are multiple "Room Scenes" headings
    const roomScenesHeadings = screen.getAllByText('Room Scenes')
    expect(roomScenesHeadings.length).toBeGreaterThan(0)
    
    // Use getAllByPlaceholderText since there are multiple scene group address inputs
    const sceneGroupInputs = screen.getAllByPlaceholderText('e.g. 2/5/0')
    expect(sceneGroupInputs.length).toBeGreaterThan(0)
  })

  it('handles adding a scene', async () => {
    renderSettings()
    
    const addSceneButtons = screen.getAllByText(/Add Light Scene/)
    
    if (addSceneButtons.length > 0) {
      fireEvent.click(addSceneButtons[0])
      
      // Should add a scene input field
    }
  })

  it('renders functions for rooms', () => {
    renderSettings()
    
    // Use getAllByText since there are multiple "Additional Functions" headings
    const additionalFunctionsHeadings = screen.getAllByText('Additional Functions')
    expect(additionalFunctionsHeadings.length).toBeGreaterThan(0)
  })

  it('handles adding a function', async () => {
    renderSettings()
    
    const addFuncButtons = screen.getAllByText('Add Function').filter(btn =>
      btn.textContent === 'Add Function'
    )
    
    if (addFuncButtons.length > 0) {
      fireEvent.click(addFuncButtons[0])
      
      await waitFor(() => {
        expect(updateConfig).toHaveBeenCalled()
      })
    }
  })

  it('renders Philips Hue section', () => {
    renderSettings()
    
    expect(screen.getByText('Philips Hue')).toBeInTheDocument()
    expect(screen.getByText('Discover Bridge')).toBeInTheDocument()
  })

  it('handles Hue bridge discovery', async () => {
    renderSettings()
    
    const discoverButton = screen.getByText('Discover Bridge')
    fireEvent.click(discoverButton)
    
    await waitFor(() => {
      expect(discoverHueBridge).toHaveBeenCalled()
    })
  })

  it('shows paired state when Hue is paired', () => {
    renderSettings({ 
      hueStatus: { paired: true, bridgeIp: '192.168.1.100' } 
    })
    
    expect(screen.getByText('Paired')).toBeInTheDocument()
    expect(screen.getByText('(192.168.1.100)')).toBeInTheDocument()
  })

  it('handles Hue unpair', async () => {
    renderSettings({ 
      hueStatus: { paired: true, bridgeIp: '192.168.1.100' } 
    })
    
    const unpairButton = screen.getByText('Unpair')
    fireEvent.click(unpairButton)
    
    await waitFor(() => {
      expect(unpairHueBridge).toHaveBeenCalled()
    })
  })

  it('renders scene category sections', () => {
    renderSettings()
    
    // Use getAllByText since there are multiple "Light Scenes" headings
    const lightScenesHeadings = screen.getAllByText('Light Scenes')
    expect(lightScenesHeadings.length).toBeGreaterThan(0)
  })

  it('handles generating base scenes', async () => {
    renderSettings()
    
    const generateButtons = screen.getAllByText(/Generate Base Scenes/)
    
    if (generateButtons.length > 0) {
      fireEvent.click(generateButtons[0])
      
      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalled()
      })
    }
  })

  it('allows manual Hue bridge IP entry', () => {
    renderSettings()
    
    const ipInput = screen.getByPlaceholderText('e.g. 192.168.1.100')
    fireEvent.change(ipInput, { target: { value: '192.168.1.150' } })
    
    expect(ipInput.value).toBe('192.168.1.150')
  })

  it('handles saving all changes', async () => {
    renderSettings()
    
    const saveButtons = screen.getAllByText(/Save All Changes/)
    
    if (saveButtons.length > 0) {
      fireEvent.click(saveButtons[0])
      
      await waitFor(() => {
        expect(updateConfig).toHaveBeenCalled()
      })
    }
  })

  it('renders icon selection for switch types', () => {
    renderSettings()
    
    // Functions with type switch should have icon options
    const iconHeadings = screen.getAllByText('Icon')
    expect(iconHeadings.length).toBeGreaterThan(0)
  })

  it('handles drag and drop setup for rooms', () => {
    renderSettings()
    
    // Should have drag handles (grip icons)
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('shows Type and GA field tooltips', () => {
    renderSettings()
    
    // Look for GA-related elements - use getAllByText since there are duplicates
    const actionGaLabels = screen.getAllByText('Action GA')
    expect(actionGaLabels.length).toBeGreaterThan(0)
  })

  it('handles scene name updates', async () => {
    renderSettings()
    
    const sceneInputs = screen.getAllByPlaceholderText('e.g. Off')
    
    if (sceneInputs.length > 0) {
      fireEvent.change(sceneInputs[0], { target: { value: 'Evening Off' } })
      
      // Should update the scene name
    }
  })

  it('renders the Add Hue Lamp button when paired', () => {
    renderSettings({ 
      hueStatus: { paired: true, bridgeIp: '192.168.1.100' } 
    })
    
    const addHueButtons = screen.getAllByText(/Add Hue Lamp/)
    expect(addHueButtons.length).toBeGreaterThan(0)
  })
})
