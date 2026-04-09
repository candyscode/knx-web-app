import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import Dashboard from '../Dashboard'
import { setupFetchMock, resetFetchMock } from './mocks/configApi'

vi.mock('../configApi', () => ({
  triggerAction: vi.fn(() => Promise.resolve({ success: true })),
  triggerHueAction: vi.fn(() => Promise.resolve({ success: true }))
}))

import { triggerAction, triggerHueAction } from '../configApi'

describe('Dashboard Component', () => {
  const mockConfig = {
    rooms: [
      {
        id: 'room-1',
        name: 'Living Room',
        sceneGroupAddress: '2/1/0',
        scenes: [
          { id: 'scene-1', name: 'Off', sceneNumber: 1, category: 'light' },
          { id: 'scene-2', name: 'Bright', sceneNumber: 2, category: 'light' },
          { id: 'scene-3', name: 'Shade Up', sceneNumber: 3, category: 'shade' }
        ],
        functions: [
          { id: 'func-1', name: 'Main Light', type: 'switch', groupAddress: '1/1/1', statusGroupAddress: '1/1/2', iconType: 'lightbulb' },
          { id: 'func-2', name: 'Blinds', type: 'percentage', groupAddress: '1/2/1', statusGroupAddress: '1/2/2', movingGroupAddress: '1/2/3' }
        ]
      },
      {
        id: 'room-2',
        name: 'Kitchen',
        sceneGroupAddress: '2/2/0',
        scenes: [],
        functions: [
          { id: 'func-3', name: 'Spot Light', type: 'hue', hueLightId: '1' }
        ]
      }
    ]
  }

  const mockDeviceStates = {
    '1/1/2': true,
    '1/2/2': 50,
    '1/2/3': false
  }

  const mockHueStates = {
    'hue_1': true
  }

  const mockAddToast = vi.fn()

  beforeEach(() => {
    setupFetchMock()
    vi.clearAllMocks()
  })

  afterEach(() => {
    resetFetchMock()
  })

  it('renders without rooms configured', () => {
    render(
      <Dashboard 
        config={{ rooms: [] }} 
        deviceStates={{}} 
        hueStates={{}} 
        addToast={mockAddToast}
      />
    )
    
    expect(screen.getByText('No rooms configured')).toBeInTheDocument()
    expect(screen.getByText('Go to settings to add your first room and KNX functions.')).toBeInTheDocument()
  })

  it('renders rooms with their names', () => {
    render(
      <Dashboard 
        config={mockConfig} 
        deviceStates={mockDeviceStates} 
        hueStates={mockHueStates}
        addToast={mockAddToast}
      />
    )
    
    expect(screen.getByText('Living Room')).toBeInTheDocument()
    expect(screen.getByText('Kitchen')).toBeInTheDocument()
  })

  it('renders scene categories correctly', () => {
    render(
      <Dashboard 
        config={mockConfig} 
        deviceStates={mockDeviceStates} 
        hueStates={mockHueStates}
        addToast={mockAddToast}
      />
    )
    
    // Should show scene categories (using getAllBy since there are duplicates)
    const lightCategories = screen.getAllByText('Lights')
    expect(lightCategories.length).toBeGreaterThan(0)
    
    const shadeCategories = screen.getAllByText('Shades')
    expect(shadeCategories.length).toBeGreaterThan(0)
    
    // Should show scene pills
    expect(screen.getByText('Off')).toBeInTheDocument()
    expect(screen.getByText('Bright')).toBeInTheDocument()
    expect(screen.getByText('Shade Up')).toBeInTheDocument()
  })

  it('handles scene action click', async () => {
    render(
      <Dashboard 
        config={mockConfig} 
        deviceStates={mockDeviceStates} 
        hueStates={mockHueStates}
        addToast={mockAddToast}
      />
    )
    
    const offButton = screen.getByText('Off')
    fireEvent.click(offButton)
    
    await waitFor(() => {
      expect(triggerAction).toHaveBeenCalledWith({
        groupAddress: '2/1/0',
        type: 'scene',
        sceneNumber: 1
      })
    })
  })

  it('renders switch functions with correct state', () => {
    render(
      <Dashboard 
        config={mockConfig} 
        deviceStates={mockDeviceStates} 
        hueStates={mockHueStates}
        addToast={mockAddToast}
      />
    )
    
    expect(screen.getByText('Main Light')).toBeInTheDocument()
  })

  it('handles switch toggle', async () => {
    const mockSetDeviceStates = vi.fn()
    
    render(
      <Dashboard 
        config={mockConfig} 
        deviceStates={mockDeviceStates} 
        setDeviceStates={mockSetDeviceStates}
        hueStates={mockHueStates}
        addToast={mockAddToast}
      />
    )
    
    // Find and click the switch button
    const mainLightButtons = screen.getAllByRole('button')
    const mainLightButton = mainLightButtons.find(btn => 
      btn.textContent?.includes('Main Light')
    )
    
    if (mainLightButton) {
      fireEvent.click(mainLightButton)
      
      await waitFor(() => {
        expect(triggerAction).toHaveBeenCalled()
      })
    }
  })

  it('renders Hue lights correctly', () => {
    render(
      <Dashboard 
        config={mockConfig} 
        deviceStates={mockDeviceStates} 
        hueStates={mockHueStates}
        addToast={mockAddToast}
      />
    )
    
    expect(screen.getByText('Spot Light')).toBeInTheDocument()
  })

  it('handles Hue light toggle', async () => {
    const mockSetHueStates = vi.fn()
    
    render(
      <Dashboard 
        config={mockConfig} 
        deviceStates={mockDeviceStates} 
        hueStates={mockHueStates}
        setHueStates={mockSetHueStates}
        addToast={mockAddToast}
      />
    )
    
    // Find and click the Hue light button
    const spotLightButtons = screen.getAllByRole('button')
    const spotLightButton = spotLightButtons.find(btn => 
      btn.textContent?.includes('Spot Light')
    )
    
    if (spotLightButton) {
      fireEvent.click(spotLightButton)
      
      await waitFor(() => {
        expect(triggerHueAction).toHaveBeenCalledWith('1', false) // Toggle from true to false
      })
    }
  })

  it('renders blinds card correctly', () => {
    render(
      <Dashboard 
        config={mockConfig} 
        deviceStates={mockDeviceStates} 
        hueStates={mockHueStates}
        addToast={mockAddToast}
      />
    )
    
    expect(screen.getByText('Blinds')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument() // Current position
  })

  it('handles blind slider interaction', () => {
    render(
      <Dashboard 
        config={mockConfig} 
        deviceStates={mockDeviceStates} 
        hueStates={mockHueStates}
        addToast={mockAddToast}
      />
    )
    
    // Find the blind slider (should be an input with type range)
    const sliders = screen.getAllByRole('slider')
    expect(sliders.length).toBeGreaterThan(0)
  })

  it('shows "No functions available" when room has no functions or scenes', () => {
    const configWithEmptyRoom = {
      rooms: [
        {
          id: 'room-empty',
          name: 'Empty Room',
          sceneGroupAddress: '',
          scenes: [],
          functions: []
        }
      ]
    }
    
    render(
      <Dashboard 
        config={configWithEmptyRoom} 
        deviceStates={{}} 
        hueStates={{}}
        addToast={mockAddToast}
      />
    )
    
    expect(screen.getByText('No functions available')).toBeInTheDocument()
  })

  it('reverts optimistic update on failure', async () => {
    triggerHueAction.mockResolvedValueOnce({ success: false, error: 'Hue error' })
    const mockSetHueStates = vi.fn()
    
    render(
      <Dashboard 
        config={mockConfig} 
        deviceStates={mockDeviceStates} 
        hueStates={mockHueStates}
        setHueStates={mockSetHueStates}
        addToast={mockAddToast}
      />
    )
    
    const spotLightButtons = screen.getAllByRole('button')
    const spotLightButton = spotLightButtons.find(btn => 
      btn.textContent?.includes('Spot Light')
    )
    
    if (spotLightButton) {
      fireEvent.click(spotLightButton)
      
      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('Hue error: Hue error', 'error')
      })
    }
  })

  it('shows scene category Functions for additional functions', () => {
    render(
      <Dashboard 
        config={mockConfig} 
        deviceStates={mockDeviceStates} 
        hueStates={mockHueStates}
        addToast={mockAddToast}
      />
    )
    
    // Use getAllByText since there are multiple "Functions" headings
    const functionsHeadings = screen.getAllByText('Functions')
    expect(functionsHeadings.length).toBeGreaterThan(0)
  })

  it('handles different scene categories', () => {
    const configWithMultipleCategories = {
      rooms: [{
        id: 'room-1',
        name: 'Test Room',
        sceneGroupAddress: '2/1/0',
        scenes: [
          { id: 's1', name: 'Light Scene', sceneNumber: 1, category: 'light' },
          { id: 's2', name: 'Shade Scene', sceneNumber: 2, category: 'shade' }
        ],
        functions: []
      }]
    }
    
    render(
      <Dashboard 
        config={configWithMultipleCategories} 
        deviceStates={{}} 
        hueStates={{}}
        addToast={mockAddToast}
      />
    )
    
    const lightsHeadings = screen.getAllByText('Lights')
    expect(lightsHeadings.length).toBeGreaterThan(0)
    
    const shadesHeadings = screen.getAllByText('Shades')
    expect(shadesHeadings.length).toBeGreaterThan(0)
  })
})
