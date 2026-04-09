/**
 * Settings component tests.
 * Tests KNX config, room CRUD, scene CRUD, generate base scenes, Hue pairing flows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Settings from '../Settings';
import * as api from '../configApi';

vi.mock('../configApi', () => ({
  updateConfig: vi.fn(),
  discoverHueBridge: vi.fn(),
  pairHueBridge: vi.fn(),
  unpairHueBridge: vi.fn(),
  getHueLights: vi.fn(),
  getHueRooms: vi.fn(),
  getHueScenes: vi.fn(),
  linkHueRoom: vi.fn(),
  unlinkHueRoom: vi.fn(),
  linkHueScene: vi.fn(),
  unlinkHueScene: vi.fn(),
}));

const addToast = vi.fn();
const fetchConfig = vi.fn();

const BASE_CONFIG = {
  knxIp: '192.168.1.85',
  knxPort: 3671,
  hue: { bridgeIp: '', apiKey: '' },
  rooms: [],
};

const CONFIG_WITH_ROOM = {
  ...BASE_CONFIG,
  rooms: [{
    id: 'r1',
    name: 'Living Room',
    sceneGroupAddress: '3/5/0',
    scenes: [{ id: 's1', name: 'Relax', sceneNumber: 5, category: 'light' }],
    functions: [],
  }],
};

function renderSettings(config = BASE_CONFIG, hueStatus = { paired: false, bridgeIp: '' }) {
  return render(
    <Settings
      config={config}
      fetchConfig={fetchConfig}
      addToast={addToast}
      hueStatus={hueStatus}
      setHueStatus={vi.fn()}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.updateConfig.mockResolvedValue({ success: true, config: BASE_CONFIG });
  api.discoverHueBridge.mockResolvedValue({ success: true, bridges: [{ internalipaddress: '192.168.1.65' }] });
  api.pairHueBridge.mockResolvedValue({ success: true, apiKey: 'new-api-key' });
  api.unpairHueBridge.mockResolvedValue({ success: true });
  api.getHueLights.mockResolvedValue({ success: true, lights: [{ id: '1', name: 'Leselampe', on: false, reachable: true }] });
  api.getHueRooms.mockResolvedValue({ success: true, rooms: [{ id: '1', name: 'Wohnzimmer', lights: [] }] });
  api.getHueScenes.mockResolvedValue({ success: true, scenes: [{ id: 'abc', name: 'Relax', group: '1' }] });
  api.linkHueRoom.mockResolvedValue({ success: true });
  api.unlinkHueRoom.mockResolvedValue({ success: true });
  api.linkHueScene.mockResolvedValue({ success: true });
  api.unlinkHueScene.mockResolvedValue({ success: true });
});

// ── KNX Interface ─────────────────────────────────────────────────────────────

describe('Settings — KNX Interface', () => {
  it('renders KNX section heading', () => {
    renderSettings();
    expect(screen.getByText('KNX Interface')).toBeInTheDocument();
  });

  it('populates IP input with config value', () => {
    renderSettings();
    const ipInput = screen.getByPlaceholderText('192.168.1.50');
    expect(ipInput.value).toBe('192.168.1.85');
  });

  it('populates port input with config value', () => {
    renderSettings();
    const portInput = screen.getByPlaceholderText('3671');
    expect(portInput.value).toBe('3671');
  });

  it('calls updateConfig with new IP when Save is clicked', async () => {
    const user = userEvent.setup();
    renderSettings();

    const ipInput = screen.getByPlaceholderText('192.168.1.50');
    await user.clear(ipInput);
    await user.type(ipInput, '10.0.0.1');

    const saveBtn = screen.getByRole('button', { name: /save/i });
    await user.click(saveBtn);

    expect(api.updateConfig).toHaveBeenCalledWith(expect.objectContaining({ knxIp: '10.0.0.1' }));
  });

  it('shows success toast after saving KNX settings', async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(addToast).toHaveBeenCalledWith('Connection settings saved', 'success'));
  });
});

// ── Rooms ─────────────────────────────────────────────────────────────────────

describe('Settings — Room management', () => {
  it('renders "Rooms & Functions" section', () => {
    renderSettings();
    expect(screen.getByText(/Rooms & Functions/i)).toBeInTheDocument();
  });

  it('shows "Add Room" input and button', () => {
    renderSettings();
    expect(screen.getByPlaceholderText(/e.g. Living Room/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add room/i })).toBeInTheDocument();
  });

  it('creates a new room when Add Room is clicked', async () => {
    const user = userEvent.setup();
    renderSettings();

    const nameInput = screen.getByPlaceholderText(/e.g. Living Room/i);
    await user.type(nameInput, 'New Room');
    await user.click(screen.getByRole('button', { name: /add room/i }));

    expect(api.updateConfig).toHaveBeenCalledWith(expect.objectContaining({
      rooms: expect.arrayContaining([expect.objectContaining({ name: 'New Room' })]),
    }));
    expect(addToast).toHaveBeenCalledWith('Room added', 'success');
  });

  it('does not create room when name is empty', async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(screen.getByRole('button', { name: /add room/i }));
    expect(api.updateConfig).not.toHaveBeenCalled();
  });

  it('renders existing room card', () => {
    renderSettings(CONFIG_WITH_ROOM);
    expect(screen.getByText('Living Room')).toBeInTheDocument();
  });

  it('deletes room when Delete Room button is clicked', async () => {
    const user = userEvent.setup();
    renderSettings(CONFIG_WITH_ROOM);

    const deleteBtn = screen.getByTitle('Delete Room');
    await user.click(deleteBtn);

    expect(api.updateConfig).toHaveBeenCalledWith(expect.objectContaining({ rooms: [] }));
    expect(addToast).toHaveBeenCalledWith('Room deleted', 'success');
  });
});

// ── Scenes ────────────────────────────────────────────────────────────────────

describe('Settings — Scene management', () => {
  it('renders existing scenes in room', () => {
    renderSettings(CONFIG_WITH_ROOM);
    expect(screen.getByDisplayValue('Relax')).toBeInTheDocument();
  });

  it('adds a light scene when "Add Light Scene" is clicked', async () => {
    const user = userEvent.setup();
    renderSettings(CONFIG_WITH_ROOM);

    await user.click(screen.getByRole('button', { name: /add light scene/i }));

    // A new scene row should now appear (with empty name input)
    const nameInputs = screen.getAllByPlaceholderText('e.g. Off');
    expect(nameInputs.length).toBeGreaterThan(0);
  });

  it('adds a shade scene when "Add Shade Scene" is clicked', async () => {
    const user = userEvent.setup();
    renderSettings(CONFIG_WITH_ROOM);

    const shadeSections = screen.getAllByText(/shade scenes/i);
    const addShadeBtn = screen.getByRole('button', { name: /add shade scene/i });
    await user.click(addShadeBtn);

    // Shade section now has one row
    const deleteButtons = screen.getAllByTitle('Delete scene');
    expect(deleteButtons.length).toBeGreaterThan(0);
  });

  it('removes scene when Delete scene button is clicked', async () => {
    const user = userEvent.setup();
    renderSettings(CONFIG_WITH_ROOM);

    const beforeCount = screen.getAllByDisplayValue('Relax').length;
    await user.click(screen.getByTitle('Delete scene'));

    await waitFor(() => {
      expect(screen.queryByDisplayValue('Relax')).not.toBeInTheDocument();
    });
  });

  it('"Generate Base Scenes" adds Off (scene 1) and Bright (scene 2)', async () => {
    const user = userEvent.setup();
    // Start with empty scenes
    const configEmpty = { ...CONFIG_WITH_ROOM, rooms: [{ ...CONFIG_WITH_ROOM.rooms[0], scenes: [] }] };
    renderSettings(configEmpty);

    await user.click(screen.getByRole('button', { name: /generate base scenes/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('Off')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Bright')).toBeInTheDocument();
    });
    expect(addToast).toHaveBeenCalledWith(expect.stringContaining('Off'), 'success');
  });

  it('"Generate Base Scenes" shows toast when scenes already exist', async () => {
    const user = userEvent.setup();
    // Config has scenes 1 and 2 already
    const configFull = {
      ...CONFIG_WITH_ROOM, rooms: [{
        ...CONFIG_WITH_ROOM.rooms[0],
        scenes: [
          { id: 's1', name: 'Off', sceneNumber: 1, category: 'light' },
          { id: 's2', name: 'Bright', sceneNumber: 2, category: 'light' },
        ],
      }],
    };
    renderSettings(configFull);

    await user.click(screen.getByRole('button', { name: /generate base scenes/i }));
    expect(addToast).toHaveBeenCalledWith(expect.stringContaining('already exist'), 'success');
  });
});

// ── Functions ─────────────────────────────────────────────────────────────────

describe('Settings — Function management', () => {
  it('adds a function card when "Add Function" is clicked', async () => {
    const user = userEvent.setup();
    renderSettings(CONFIG_WITH_ROOM);

    await user.click(screen.getByRole('button', { name: /add function/i }));

    // A new function card should appear
    await waitFor(() => {
      expect(screen.getByPlaceholderText('e.g. Lock Door')).toBeInTheDocument();
    });
  });
});

// ── Philips Hue ───────────────────────────────────────────────────────────────

describe('Settings — Hue: not paired', () => {
  it('renders Philips Hue section', () => {
    renderSettings();
    expect(screen.getByText('Philips Hue')).toBeInTheDocument();
  });

  it('shows Discover and manual IP buttons when not paired', () => {
    renderSettings();
    expect(screen.getByRole('button', { name: /discover/i })).toBeInTheDocument();
  });

  it('discovers bridge and fills IP on success', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole('button', { name: /discover/i }));

    await waitFor(() => {
      expect(api.discoverHueBridge).toHaveBeenCalled();
    });
  });

  it('shows error when no bridges found during discovery', async () => {
    api.discoverHueBridge.mockResolvedValueOnce({ success: true, bridges: [] });
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole('button', { name: /discover/i }));

    await waitFor(() => {
      expect(screen.getByText(/No Hue Bridge found/i)).toBeInTheDocument();
    });
  });
});

describe('Settings — Hue: pairing flow', () => {
  it('shows Pair button after bridge is found', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole('button', { name: /discover/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /pair/i })).toBeInTheDocument();
    });
  });

  it('calls pairHueBridge and shows success toast when pairing succeeds', async () => {
    const user = userEvent.setup();
    renderSettings();

    // Discover first
    await user.click(screen.getByRole('button', { name: /discover/i }));
    await waitFor(() => screen.getByRole('button', { name: /pair/i }));

    await user.click(screen.getByRole('button', { name: /pair/i }));

    await waitFor(() => {
      expect(api.pairHueBridge).toHaveBeenCalled();
      expect(addToast).toHaveBeenCalledWith('Hue Bridge paired!', 'success');
    });
  });

  it('shows pairing error when link button not pressed', async () => {
    api.pairHueBridge.mockResolvedValueOnce({ success: false, error: 'link button not pressed' });
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole('button', { name: /discover/i }));
    await waitFor(() => screen.getByRole('button', { name: /pair/i }));
    await user.click(screen.getByRole('button', { name: /pair/i }));

    await waitFor(() => {
      expect(screen.getByText(/link button not pressed/i)).toBeInTheDocument();
    });
  });
});

describe('Settings — Hue: paired state', () => {
  it('shows "Paired" badge when hueStatus.paired=true', () => {
    renderSettings(BASE_CONFIG, { paired: true, bridgeIp: '192.168.1.65' });
    expect(screen.getByText('Paired')).toBeInTheDocument();
    expect(screen.getByText(/192.168.1.65/)).toBeInTheDocument();
  });

  it('shows Unpair button when paired', () => {
    renderSettings(BASE_CONFIG, { paired: true, bridgeIp: '192.168.1.65' });
    expect(screen.getByRole('button', { name: /unpair/i })).toBeInTheDocument();
  });

  it('calls unpairHueBridge and shows toast when Unpair is clicked', async () => {
    const user = userEvent.setup();
    renderSettings(BASE_CONFIG, { paired: true, bridgeIp: '192.168.1.65' });

    await user.click(screen.getByRole('button', { name: /unpair/i }));

    await waitFor(() => {
      expect(api.unpairHueBridge).toHaveBeenCalled();
      expect(addToast).toHaveBeenCalledWith('Hue Bridge unpaired', 'success');
    });
  });
});

describe('Settings — Hue: Add Hue Lamp', () => {
  it('shows "Add Hue Lamp" button in room when paired', () => {
    renderSettings(CONFIG_WITH_ROOM, { paired: true, bridgeIp: '192.168.1.65' });
    expect(screen.getByRole('button', { name: /add hue lamp/i })).toBeInTheDocument();
  });

  it('opens lamp selection modal on click', async () => {
    const user = userEvent.setup();
    renderSettings(CONFIG_WITH_ROOM, { paired: true, bridgeIp: '192.168.1.65' });

    await user.click(screen.getByRole('button', { name: /add hue lamp/i }));

    await waitFor(() => {
      expect(api.getHueLights).toHaveBeenCalled();
      expect(screen.getByText('Leselampe')).toBeInTheDocument();
    });
  });

  it('adds selected lamp to room functions', async () => {
    const user = userEvent.setup();
    renderSettings(CONFIG_WITH_ROOM, { paired: true, bridgeIp: '192.168.1.65' });

    await user.click(screen.getByRole('button', { name: /add hue lamp/i }));

    await waitFor(() => screen.getByText('Leselampe'));
    await user.click(screen.getByText('Leselampe'));

    expect(addToast).toHaveBeenCalledWith(expect.stringContaining('Leselampe'), 'success');
  });

  it('does not show "Add Hue Lamp" button when not paired', () => {
    renderSettings(CONFIG_WITH_ROOM, { paired: false, bridgeIp: '' });
    expect(screen.queryByRole('button', { name: /add hue lamp/i })).not.toBeInTheDocument();
  });
});
