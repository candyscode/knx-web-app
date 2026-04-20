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
    expect(screen.getAllByText((_, node) => node?.textContent?.includes('Rain Alarm') ?? false).length).toBeGreaterThan(0);
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

  it('shows success toast after scene triggered', async () => {
    const user = userEvent.setup();
    renderDashboard({ rooms: [ROOM_WITH_SCENES] });
    await user.click(screen.getByText('Relax'));
    await waitFor(() => expect(addToast).toHaveBeenCalledWith('Relax', 'success'));
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
  it('renders blind widget with slider', () => {
    renderDashboard({ rooms: [ROOM_WITH_BLIND] });
    const slider = screen.getByRole('slider');
    expect(slider).toBeInTheDocument();
  });

  it('shows blind function name', () => {
    renderDashboard({ rooms: [ROOM_WITH_BLIND] });
    expect(screen.getByText('Blinds')).toBeInTheDocument();
  });

  it('initializes slider to current ist-position from deviceStates', () => {
    renderDashboard({
      rooms: [ROOM_WITH_BLIND],
      deviceStates: { '2/0/1': 75 },
    });
    const slider = screen.getByRole('slider');
    expect(slider).toHaveValue('75');
  });

  it('sends percentage action when slider is released', async () => {
    renderDashboard({ rooms: [ROOM_WITH_BLIND] });
    const slider = screen.getByRole('slider');

    fireEvent.change(slider, { target: { value: '60' } });
    fireEvent.pointerUp(slider);

    await waitFor(() => {
      expect(api.triggerAction).toHaveBeenCalledWith(expect.objectContaining({
        type: 'percentage',
        value: 60,
      }));
    });
  });
});

describe('Dashboard — Functions section heading', () => {
  it('shows "Functions" section when functions exist', () => {
    renderDashboard({ rooms: [{ ...ROOM_WITH_SCENES, scenes: [] }] });
    expect(screen.getByText('Functions')).toBeInTheDocument();
  });
});
