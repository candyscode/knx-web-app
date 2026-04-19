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
  globals: [],
  importedGroupAddresses: [],
  importedGroupAddressesFileName: '',
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

const CONFIG_WITH_EXISTING_FUNCTIONS = {
  ...BASE_CONFIG,
  rooms: [{
    id: 'r1',
    name: 'Living Room',
    sceneGroupAddress: '3/5/0',
    scenes: [{ id: 's1', name: 'Relax', sceneNumber: 5, category: 'light' }],
    functions: [
      {
        id: 'f1',
        name: 'Ceiling Light',
        type: 'switch',
        groupAddress: '1/1/1',
        statusGroupAddress: '',
      },
      {
        id: 'f2',
        name: 'Blind Position',
        type: 'percentage',
        groupAddress: '2/1/5',
        statusGroupAddress: '',
        movingGroupAddress: '',
      },
    ],
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

// ── Rooms ─────────────────────────────────────────────────────────────────────

describe('Settings — Room management', () => {


  it('shows "Add Room" input and button', () => {
    renderSettings();
    expect(screen.getByPlaceholderText(/Add room to/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add room/i })).toBeInTheDocument();
  });

  it('creates a new room when Add Room is clicked', async () => {
    const user = userEvent.setup();
    renderSettings();

    const nameInput = screen.getByPlaceholderText(/Add room to/i);
    await user.type(nameInput, 'New Room');
    await user.click(screen.getByRole('button', { name: /add room/i }));

    expect(api.updateConfig).toHaveBeenCalledWith(expect.objectContaining({
      floors: expect.arrayContaining([expect.objectContaining({ rooms: expect.arrayContaining([expect.objectContaining({ name: 'New Room' })]) })]),
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
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
    const user = userEvent.setup();
    renderSettings(CONFIG_WITH_ROOM);

    const deleteBtn = screen.getByTitle('Delete Room');
    await user.click(deleteBtn);

    expect(api.updateConfig).toHaveBeenCalledWith(expect.objectContaining({ floors: expect.arrayContaining([expect.objectContaining({ rooms: [] })]) }));
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

  it('uses search icon buttons for imported ETS address lookup on GA fields', async () => {
    const user = userEvent.setup();
    renderSettings(CONFIG_WITH_ROOM);

    await user.click(screen.getByRole('button', { name: /add function/i }));

    expect(await screen.findByRole('button', { name: /search ets addresses for action ga/i })).toBeInTheDocument();
  });
});

describe('Settings — Global information & alarms', () => {
  it('saves the GA field on blur without showing a generic success toast for each keystroke', async () => {
    const user = userEvent.setup();
    renderSettings({
      ...BASE_CONFIG,
      globals: [
        {
          id: 'global_1',
          name: 'Outside Temperature',
          type: 'info',
          category: 'temperature',
          statusGroupAddress: '1/2/3',
          dpt: 'DPT9.001',
        },
      ],
    });

    await user.click(screen.getByRole('button', { name: /global info & alarms/i }));

    const gaInput = screen.getByDisplayValue('1/2/3');
    await user.clear(gaInput);
    await user.type(gaInput, '1/2/30');

    expect(api.updateConfig).not.toHaveBeenCalled();
    expect(addToast).not.toHaveBeenCalledWith('Globals saved', 'success');

    await user.tab();

    await waitFor(() => {
      expect(api.updateConfig).toHaveBeenCalledWith({
        globals: [
          expect.objectContaining({
            id: 'global_1',
            statusGroupAddress: '1/2/30',
          }),
        ],
      });
    });
    expect(addToast).not.toHaveBeenCalledWith('Globals saved', 'success');
  });
});

describe('Settings — ETS modal filtering', () => {
  const CONFIG_WITH_ETS = {
    ...CONFIG_WITH_EXISTING_FUNCTIONS,
    importedGroupAddressesFileName: 'ets-export.xml',
    importedGroupAddresses: [
      { address: '1/1/2', name: 'Living Room - Ceiling Light Status', functionType: 'switch', supported: true },
      { address: '2/1/6', name: 'Living Room - Blind Position Status', functionType: 'percentage', supported: true },
      { address: '2/1/7', name: 'Living Room - Blind Moving', functionType: 'percentage', supported: true },
      { address: '3/5/4', name: 'Living Room - Scene Control', functionType: 'scene', supported: true },
    ]
  };

  it('assigns imported ETS status and moving addresses to existing function fields', async () => {
    const user = userEvent.setup();
    renderSettings(CONFIG_WITH_ETS);

    const feedbackButtons = screen.getAllByRole('button', { name: /search ets addresses for feedback ga/i });
    await user.click(feedbackButtons[0]);
    expect(await screen.findByText(/filtered list: switch\/status group addresses only/i)).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /living room - ceiling light status/i }));
    expect(screen.getByDisplayValue('1/1/2')).toBeInTheDocument();

    const movingButtons = screen.getAllByRole('button', { name: /search ets addresses for moving ga/i });
    await user.click(movingButtons[0]);
    expect(await screen.findByText(/filtered list: blind\/percentage group addresses only/i)).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /living room - blind moving/i }));
    expect(screen.getByDisplayValue('2/1/7')).toBeInTheDocument();
  });

  it('assigns imported scene GA to room scene GA', async () => {
    const user = userEvent.setup();
    renderSettings(CONFIG_WITH_ETS);

    await user.click(screen.getByRole('button', { name: /search ets addresses for scene ga/i }));
    expect(await screen.findByText(/filtered list: scene group addresses only/i)).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /living room - scene control/i }));
    expect(screen.getByDisplayValue('3/5/4')).toBeInTheDocument();
  });
});


// ── Philips Hue ───────────────────────────────────────────────────────────────

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
