/**
 * Dashboard component tests.
 * Tests all room card features: scenes, switches, Hue lamps, blind sliders.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dashboard from '../Dashboard';
import * as api from '../configApi';

vi.mock('../configApi', () => ({
  triggerAction: vi.fn(),
  triggerHueAction: vi.fn(),
}));

const addToast = vi.fn();

// ── Test data fixtures ────────────────────────────────────────────────────────

const SWITCH_FUNC = {
  id: 'f1', name: 'Main Light', type: 'switch',
  groupAddress: '1/0/0', statusGroupAddress: '1/0/1',
  iconType: 'lightbulb',
};

const HUE_FUNC = {
  id: 'f2', name: 'Ambient Light', type: 'hue',
  hueLightId: '1', iconType: 'lightbulb',
};

const BLIND_FUNC = {
  id: 'f3', name: 'Blinds', type: 'percentage',
  groupAddress: '2/0/0', statusGroupAddress: '2/0/1',
};

const NEW_TYPES_FUNCS = [
  { id: 'f_light', name: 'Ceiling Light', type: 'light', groupAddress: '4/0/0', statusGroupAddress: '4/0/1' },
  { id: 'f_lock', name: 'Front Door', type: 'lock', groupAddress: '4/1/0', statusGroupAddress: '4/1/1' },
  { id: 'f_socket', name: 'TV Socket', type: 'socket', groupAddress: '4/2/0', statusGroupAddress: '4/2/1' },
  { id: 'f_scene', name: 'Movie Mode', type: 'scene', groupAddress: '4/3/0', sceneNumber: 3 },
];

const ROOM_WITH_NEW_TYPES = {
  id: 'r_new', name: 'New Types Room',
  sceneGroupAddress: '', scenes: [],
  functions: NEW_TYPES_FUNCS,
};

const ROOM_WITH_SCENES = {
  id: 'r1',
  name: 'Living Room',
  roomTemperatureGroupAddress: '',
  sceneGroupAddress: '3/5/0',
  scenes: [
    { id: 's1', name: 'Relax', sceneNumber: 5, category: 'light' },
    { id: 's2', name: 'Bright', sceneNumber: 2, category: 'light' },
    { id: 's3', name: 'Offen', sceneNumber: 6, category: 'shade' },
  ],
  functions: [SWITCH_FUNC],
};

const ROOM_WITH_HUE = {
  id: 'r2', name: 'Kitchen',
  sceneGroupAddress: '', scenes: [],
  functions: [HUE_FUNC],
};

const ROOM_WITH_BLIND = {
  id: 'r3', name: 'Study',
  sceneGroupAddress: '', scenes: [],
  functions: [BLIND_FUNC],
};

function renderDashboard(props = {}) {
  const floors = props.floors
    || ((props.rooms && props.rooms.length > 0)
      ? [{ id: 'floor-1', name: 'Ground Floor', rooms: props.rooms }]
      : []);

  return render(
    <Dashboard
      apartment={{ id: 'apartment_1', name: 'Wohnung 1', slug: 'wohnung-1' }}
      config={{
        apartmentId: 'apartment_1',
        floors,
        sharedInfos: props.sharedInfos || [],
        alarms: props.alarms || [],
      }}
      deviceStates={props.deviceStates || {}}
      hueStates={props.hueStates || {}}
      setDeviceStates={props.setDeviceStates || vi.fn()}
      setHueStates={props.setHueStates || vi.fn()}
      setSharedDeviceStates={props.setSharedDeviceStates || vi.fn()}
      setSharedHueStates={props.setSharedHueStates || vi.fn()}
      addToast={addToast}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.triggerAction.mockResolvedValue({ success: true });
  api.triggerHueAction.mockResolvedValue({ success: true });
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Dashboard — empty state', () => {
  it('shows "No rooms configured" when rooms array is empty', () => {
    renderDashboard({ rooms: [] });
    expect(screen.getByText(/No rooms configured/i)).toBeInTheDocument();
  });
});

describe('Dashboard — room card', () => {
  it('renders room name in card header', () => {
    renderDashboard({ rooms: [ROOM_WITH_SCENES] });
    expect(screen.getByText('Living Room')).toBeInTheDocument();
  });

  it('renders room temperature badge when a room temperature GA has a value', () => {
    renderDashboard({
      rooms: [{ ...ROOM_WITH_SCENES, roomTemperatureGroupAddress: '5/1/1' }],
      deviceStates: { '5/1/1': 22.6 },
    });

    expect(screen.getByText('22.6 °C')).toBeInTheDocument();
  });

  it('hides room temperature badge when no room temperature GA is configured', () => {
    renderDashboard({ rooms: [ROOM_WITH_SCENES] });
    expect(screen.queryByText(/°C/)).not.toBeInTheDocument();
  });

  it('shows "No functions available" when room has no scenes or functions', () => {
    const emptyRoom = { id: 'empty', name: 'Garage', scenes: [], functions: [], sceneGroupAddress: '' };
    renderDashboard({ rooms: [emptyRoom] });
    expect(screen.getByText(/No functions available/i)).toBeInTheDocument();
  });

  it('does not crash when a legacy room is missing scenes and functions arrays', () => {
    const legacyRoom = { id: 'legacy', name: 'Garage', sceneGroupAddress: '' };
    renderDashboard({ rooms: [legacyRoom] });
    expect(screen.getByText('Garage')).toBeInTheDocument();
    expect(screen.getByText(/No functions available/i)).toBeInTheDocument();
  });
});

describe('Dashboard — globals widget', () => {
  it('renders shared info values and apartment alarms', () => {
    renderDashboard({
      rooms: [ROOM_WITH_SCENES],
      sharedInfos: [
        { id: 'g1', name: 'Outside Temperature', type: 'info', category: 'temperature', statusGroupAddress: '9/1/1' },
      ],
      alarms: [
        { id: 'g2', name: 'Rain Alarm', type: 'alarm', category: 'alarm', statusGroupAddress: '1/7/1' },
      ],
      deviceStates: {
        '9/1/1': 21.4,
        '1/7/1': true,
      },
    });

    expect(screen.getByText('Outside Temperature')).toBeInTheDocument();
    expect(screen.getByText('21.4 °C')).toBeInTheDocument();
    expect(screen.getByText('Active Alarms')).toBeInTheDocument();
    const rainAlarmPill = screen.getByText('Rain Alarm');
    expect(rainAlarmPill).toBeInTheDocument();
    expect(rainAlarmPill.className).toContain('active-alarm-pill');
  });

  it('does not render NaN for invalid shared info values', () => {
    renderDashboard({
      rooms: [ROOM_WITH_SCENES],
      sharedInfos: [
        { id: 'g1', name: 'Outside Temperature', type: 'info', category: 'temperature', statusGroupAddress: '1/6/3' },
        { id: 'g2', name: 'Wind Speed', type: 'info', category: 'wind', statusGroupAddress: '1/6/4' },
      ],
      deviceStates: {
        '1/6/3': 'not-a-number',
        '1/6/4': {},
      },
    });

    expect(screen.queryByText(/NaN/i)).not.toBeInTheDocument();
    expect(screen.getAllByText('--')).toHaveLength(2);
  });

  it('renders wind speed with a single decimal place', () => {
    renderDashboard({
      rooms: [ROOM_WITH_SCENES],
      sharedInfos: [
        { id: 'g1', name: 'Wind Speed', type: 'info', category: 'wind', statusGroupAddress: '1/6/4' },
      ],
      deviceStates: {
        '1/6/4': 0,
      },
    });

    expect(screen.getByText('0.0 m/s')).toBeInTheDocument();
  });
});

describe('Dashboard — shared area behavior', () => {
  it('triggers KNX actions in shared areas with shared scope', async () => {
    const user = userEvent.setup();
    const setDeviceStates = vi.fn();
    const setSharedDeviceStates = vi.fn();

    renderDashboard({
      floors: [
        { id: 'private-floor', name: 'Living', rooms: [] },
        {
          id: 'shared-garden',
          name: 'Garden',
          isShared: true,
          rooms: [{
            id: 'shared-room',
            name: 'Garden Lights',
            sceneGroupAddress: '',
            scenes: [],
            functions: [SWITCH_FUNC],
          }],
        },
      ],
      deviceStates: { '1/0/1': false },
      setDeviceStates,
      setSharedDeviceStates,
    });

    await user.click(screen.getByText('Garden'));
    await user.click(screen.getByText('Main Light').closest('button'));

    expect(api.triggerAction).toHaveBeenCalledWith(expect.objectContaining({
      apartmentId: 'apartment_1',
      scope: 'shared',
      type: 'switch',
    }));
    expect(setSharedDeviceStates).toHaveBeenCalled();
    expect(setDeviceStates).not.toHaveBeenCalled();
  });

  it('triggers Hue actions in shared areas with shared scope', async () => {
    const user = userEvent.setup();
    const setHueStates = vi.fn();
    const setSharedHueStates = vi.fn();

    renderDashboard({
      floors: [
        { id: 'private-floor', name: 'Living', rooms: [] },
        {
          id: 'shared-garden',
          name: 'Garden',
          isShared: true,
          rooms: [{ ...ROOM_WITH_HUE, id: 'shared-hue-room' }],
        },
      ],
      hueStates: { hue_1: false },
      setHueStates,
      setSharedHueStates,
    });

    await user.click(screen.getByText('Garden'));
    await user.click(screen.getByText('Ambient Light').closest('button'));

    expect(api.triggerHueAction).toHaveBeenCalledWith('1', true, expect.objectContaining({
      apartmentId: 'apartment_1',
      scope: 'shared',
    }));
    expect(setSharedHueStates).toHaveBeenCalled();
    expect(setHueStates).not.toHaveBeenCalled();
  });
});

describe('Dashboard — light scenes', () => {
  it('renders light scene pills', () => {
    renderDashboard({ rooms: [ROOM_WITH_SCENES] });
    expect(screen.getByText('Relax')).toBeInTheDocument();
    expect(screen.getByText('Bright')).toBeInTheDocument();
  });

  it('light scenes appear under "Lights" section heading', () => {
    renderDashboard({ rooms: [ROOM_WITH_SCENES] });
    expect(screen.getByText('Lights')).toBeInTheDocument();
  });

  it('clicking a light scene calls triggerAction with correct args', async () => {
    const user = userEvent.setup();
    renderDashboard({ rooms: [ROOM_WITH_SCENES] });

    await user.click(screen.getByText('Relax'));

    expect(api.triggerAction).toHaveBeenCalledWith({
      apartmentId: 'apartment_1',
      scope: 'apartment',
      groupAddress: '3/5/0',
      type: 'scene',
      sceneNumber: 5,
    });
  });

  it('shows error toast when scene trigger fails', async () => {
    api.triggerAction.mockRejectedValueOnce(new Error('Network error'));
    const user = userEvent.setup();
    renderDashboard({ rooms: [ROOM_WITH_SCENES] });
    await user.click(screen.getByText('Relax'));
    await waitFor(() => expect(addToast).toHaveBeenCalledWith(
      expect.stringContaining('backend'), 'error'
    ));
  });
});

describe('Dashboard — shade scenes', () => {
  it('renders shade scene pills under "Shades" heading', () => {
    renderDashboard({ rooms: [ROOM_WITH_SCENES] });
    expect(screen.getByText('Shades')).toBeInTheDocument();
    expect(screen.getByText('Offen')).toBeInTheDocument();
  });
});

describe('Dashboard — switch function', () => {
  it('renders switch button with function name', () => {
    renderDashboard({ rooms: [{ ...ROOM_WITH_SCENES, scenes: [] }] });
    expect(screen.getByText('Main Light')).toBeInTheDocument();
  });

  it('renders toggle switch element', () => {
    renderDashboard({ rooms: [{ ...ROOM_WITH_SCENES, scenes: [] }] });
    expect(document.querySelector('.toggle-switch')).toBeTruthy();
  });

  it('shows active state when switch is ON in deviceStates', () => {
    renderDashboard({
      rooms: [{ ...ROOM_WITH_SCENES, scenes: [] }],
      deviceStates: { '1/0/1': true },
    });
    expect(document.querySelector('.toggle-switch.active')).toBeTruthy();
  });

  it('optimistically toggles state on click', async () => {
    const user = userEvent.setup();
    const setDeviceStates = vi.fn();
    renderDashboard({
      rooms: [{ ...ROOM_WITH_SCENES, scenes: [] }],
      deviceStates: { '1/0/1': false },
      setDeviceStates,
    });

    await user.click(screen.getByText('Main Light').closest('button'));

    expect(setDeviceStates).toHaveBeenCalled();
    expect(api.triggerAction).toHaveBeenCalledWith(expect.objectContaining({
      apartmentId: 'apartment_1',
      scope: 'apartment',
      type: 'switch'
    }));
  });

  it('reverts optimistic state on API failure', async () => {
    api.triggerAction.mockResolvedValueOnce({ success: false, error: 'KNX offline' });
    const user = userEvent.setup();
    const setDeviceStates = vi.fn();
    renderDashboard({
      rooms: [{ ...ROOM_WITH_SCENES, scenes: [] }],
      deviceStates: { '1/0/1': false },
      setDeviceStates,
    });

    await user.click(screen.getByText('Main Light').closest('button'));

    await waitFor(() => {
      // Should be called twice: optimistic update + revert
      expect(setDeviceStates).toHaveBeenCalledTimes(2);
    });
    expect(addToast).toHaveBeenCalledWith(expect.stringContaining('Failed'), 'error');
  });
});

describe('Dashboard — new widget types', () => {
  it('renders light, lock, socket, and scene widgets', () => {
    renderDashboard({ rooms: [ROOM_WITH_NEW_TYPES] });
    expect(screen.getByText('Ceiling Light')).toBeInTheDocument();
    expect(screen.getByText('Front Door')).toBeInTheDocument();
    expect(screen.getByText('TV Socket')).toBeInTheDocument();
    expect(screen.getByText('Movie Mode')).toBeInTheDocument();
  });

  it('shows the "Tap to apply" hint for scene widgets instead of a toggle', () => {
    renderDashboard({ rooms: [ROOM_WITH_NEW_TYPES] });
    expect(screen.getByText('Tap to apply')).toBeInTheDocument();
    
    // Light, lock, socket should have a toggle (they are binary types)
    // The scene does not have a toggle class (we test this indirectly by counting toggles if needed, 
    // or just asserting the hint is present).
    const sceneBtn = screen.getByText('Movie Mode').closest('button');
    expect(sceneBtn.querySelector('.toggle-switch')).not.toBeInTheDocument();
  });
});

describe('Dashboard — Hue lamp function', () => {
  it('renders Hue lamp button with name', () => {
    renderDashboard({ rooms: [ROOM_WITH_HUE] });
    expect(screen.getByText('Ambient Light')).toBeInTheDocument();
  });

  it('shows active state when Hue lamp is ON', () => {
    renderDashboard({
      rooms: [ROOM_WITH_HUE],
      hueStates: { 'hue_1': true },
    });
    const btn = screen.getByText('Ambient Light').closest('button');
    expect(btn).toHaveClass('active');
  });

  it('optimistically toggles Hue light on click', async () => {
    const user = userEvent.setup();
    const setHueStates = vi.fn();
    renderDashboard({
      rooms: [ROOM_WITH_HUE],
      hueStates: { 'hue_1': false },
      setHueStates,
    });

    await user.click(screen.getByText('Ambient Light').closest('button'));

    expect(setHueStates).toHaveBeenCalled();
    expect(api.triggerHueAction).toHaveBeenCalledWith('1', true, { apartmentId: 'apartment_1', scope: 'apartment' });
  });

  it('reverts Hue optimistic update on API failure', async () => {
    api.triggerHueAction.mockResolvedValueOnce({ success: false, error: 'Bridge unreachable' });
    const user = userEvent.setup();
    const setHueStates = vi.fn();
    renderDashboard({
      rooms: [ROOM_WITH_HUE],
      hueStates: { 'hue_1': false },
      setHueStates,
    });

    await user.click(screen.getByText('Ambient Light').closest('button'));

    await waitFor(() => {
      expect(setHueStates).toHaveBeenCalledTimes(2);
    });
    expect(addToast).toHaveBeenCalledWith(expect.stringContaining('Hue error'), 'error');
  });
});

describe('Dashboard — blind slider', () => {
  it('shows blind function name', () => {
    renderDashboard({ rooms: [ROOM_WITH_BLIND] });
    expect(screen.getByText('Blinds')).toBeInTheDocument();
  });

  it('shows current position label from deviceStates', () => {
    renderDashboard({
      rooms: [ROOM_WITH_BLIND],
      deviceStates: { '2/0/1': 75 },
    });
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('opens modal when frame is clicked', async () => {
    renderDashboard({
      rooms: [ROOM_WITH_BLIND],
      deviceStates: { '2/0/1': 0 },
    });

    fireEvent.click(screen.getByText('Blinds'));

    await waitFor(() => {
      expect(document.querySelector('.widget-modal-overlay')).toBeInTheDocument();
    });
  });

  it('sends percentage action when dragging the blind widget inside modal', async () => {
    renderDashboard({ rooms: [ROOM_WITH_BLIND], deviceStates: { '2/0/1': 0 } });

    fireEvent.click(screen.getByText('Blinds'));
    await waitFor(() => {
      expect(document.querySelector('.widget-modal-content')).toBeInTheDocument();
    });

    const track = document.querySelector('.blinds-widget.interactive .blinds-window');
    track.setPointerCapture = vi.fn();
    track.releasePointerCapture = vi.fn();
    track.hasPointerCapture = vi.fn(() => true);
    track.getBoundingClientRect = vi.fn(() => ({
      top: 0, left: 0, width: 160, height: 160, right: 160, bottom: 160,
    }));

    fireEvent.pointerDown(track, { pointerId: 1, clientY: 0 });
    fireEvent.pointerMove(track, { pointerId: 1, clientY: 80 }); // dy=80, 80/160 = 50%
    fireEvent.pointerUp(track, { pointerId: 1, clientY: 80 });

    await waitFor(() => {
      expect(api.triggerAction).toHaveBeenCalledWith(expect.objectContaining({
        type: 'percentage',
        value: 50,
      }));
    });
  });
});

// ── DimmerCard ────────────────────────────────────────────────────────────────

const DIMMER_FUNC = {
  id: 'f4', name: 'Ceiling Dimmer', type: 'dimmer',
  groupAddress: '3/0/0', statusGroupAddress: '3/0/1',
};

const ROOM_WITH_DIMMER = {
  id: 'r4', name: 'Bedroom',
  sceneGroupAddress: '', scenes: [],
  functions: [DIMMER_FUNC],
};

describe('Dashboard — dimmer widget', () => {
  it('renders dimmer widget with function name', () => {
    renderDashboard({ rooms: [ROOM_WITH_DIMMER] });
    expect(screen.getByText('Ceiling Dimmer')).toBeInTheDocument();
  });

  it('shows current position label from deviceStates', () => {
    renderDashboard({
      rooms: [ROOM_WITH_DIMMER],
      deviceStates: { '3/0/1': 40 },
    });
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('opens modal when frame is clicked', async () => {
    renderDashboard({
      rooms: [ROOM_WITH_DIMMER],
      deviceStates: { '3/0/1': 0 },
    });

    fireEvent.click(screen.getByText('Ceiling Dimmer'));

    await waitFor(() => {
      expect(document.querySelector('.widget-modal-overlay')).toBeInTheDocument();
    });
  });

  it('sends dimmer action when dragging the dimmer widget inside modal', async () => {
    renderDashboard({ rooms: [ROOM_WITH_DIMMER], deviceStates: { '3/0/1': 0 } });

    fireEvent.click(screen.getByText('Ceiling Dimmer'));
    await waitFor(() => {
      expect(document.querySelector('.widget-modal-content')).toBeInTheDocument();
    });

    const track = document.querySelector('.dimmer-widget.interactive .dimmer-track');
    track.setPointerCapture = vi.fn();
    track.releasePointerCapture = vi.fn();
    track.hasPointerCapture = vi.fn(() => true);
    track.getBoundingClientRect = vi.fn(() => ({
      top: 0, left: 0, width: 200, height: 160, right: 200, bottom: 160,
    }));

    fireEvent.pointerDown(track, { pointerId: 1, clientY: 160 });
    fireEvent.pointerMove(track, { pointerId: 1, clientY: 80 }); // dy=-80, 80/160 = 50% up
    fireEvent.pointerUp(track, { pointerId: 1, clientY: 80 });

    await waitFor(() => {
      expect(api.triggerAction).toHaveBeenCalledWith(expect.objectContaining({
        type: 'dimmer',
        value: 50,
      }));
    });
  });
});

describe('Dashboard — Room Temperature Control', () => {
  const HEATING_ROOM = {
    id: 'heating_1',
    name: 'Bathroom',
    roomTemperatureGroupAddress: '4/1/1',
    roomSetpointShiftGroupAddress: '4/1/2',
    roomSetpointStatusGroupAddress: '4/1/3',
    roomSetpointShiftStatusGroupAddress: '4/1/5',
    roomHeatingCoolingStatusGroupAddress: '4/1/4',
    scenes: [],
    functions: [],
  };

  it('renders interactive badge when room temperature is available', () => {
    renderDashboard({
      rooms: [HEATING_ROOM],
      deviceStates: { '4/1/1': 22.5 }
    });
    const badge = screen.getByText('22.5 °C');
    expect(badge).toHaveClass('interactive');
  });

  it('shows toast when clicking badge if heating control GAs are missing', async () => {
    const user = userEvent.setup();
    renderDashboard({
      rooms: [{ id: 'r1', name: 'R1', roomTemperatureGroupAddress: '4/1/1' }],
      deviceStates: { '4/1/1': 22.5 }
    });
    
    await user.click(screen.getByText('22.5 °C'));
    
    expect(addToast).toHaveBeenCalledWith('Temperature control not set up for this room', 'info');
    expect(document.querySelector('.widget-modal-overlay')).not.toBeInTheDocument();
  });

  it('opens modal and triggers read request if heating/cooling status is undefined', async () => {
    const user = userEvent.setup();
    renderDashboard({
      rooms: [HEATING_ROOM],
      deviceStates: { '4/1/1': 22.5, '4/1/3': 21.0 } // 4/1/4 missing
    });
    
    await user.click(screen.getByText('22.5 °C'));
    
    expect(document.querySelector('.widget-modal-overlay')).toBeInTheDocument();
    expect(api.triggerAction).toHaveBeenCalledWith(expect.objectContaining({
      type: 'read',
      groupAddress: '4/1/4'
    }));
  });

  it('shows Heating Mode UI and sends correct shift on + click', async () => {
    const user = userEvent.setup();
    renderDashboard({
      rooms: [HEATING_ROOM],
      // currentShift is undefined here, fallback is 0
      deviceStates: { '4/1/1': 22.5, '4/1/3': 21.0, '4/1/4': 1 }
    });
    
    await user.click(screen.getByText('22.5 °C'));
    
    expect(screen.getByText('Bathroom Temperature Control')).toBeInTheDocument();
    expect(screen.getByText('Heating Mode')).toBeInTheDocument();
    
    // Check background color applied via style in modal content
    const modalContent = document.querySelector('.widget-modal-content');
    expect(modalContent.style.backgroundColor).toBe('rgb(79, 42, 50)'); // #4f2a32

    // Click +
    const plusBtn = document.querySelector('button .lucide-plus').parentElement;
    await user.click(plusBtn);
    
    expect(api.triggerAction).toHaveBeenCalledWith(expect.objectContaining({
      type: 'temperature_shift',
      groupAddress: '4/1/2',
      value: 0.5
    }));
  });

  it('shows Cooling Mode UI and handles undefined target temp gracefully', async () => {
    const user = userEvent.setup();
    renderDashboard({
      rooms: [HEATING_ROOM],
      deviceStates: { '4/1/1': 22.5, '4/1/4': 0 } // target setpoint missing
    });
    
    await user.click(screen.getByText('22.5 °C'));
    
    expect(screen.getByText('Cooling Mode')).toBeInTheDocument();
    const modalContent = document.querySelector('.widget-modal-content');
    expect(modalContent.style.backgroundColor).toBe('rgb(28, 38, 54)'); // #1c2636
    
    // Minus and Plus buttons should be disabled because targetTemp is undefined
    const minusBtn = document.querySelector('button .lucide-minus').parentElement;
    expect(minusBtn).toBeDisabled();
  });
});


