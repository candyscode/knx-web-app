/**
 * App component tests.
 * Tests navigation, KNX status display, toast system, and socket event handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { triggerSocketEvent, resetSocketMock } from '../__mocks__/socket.io-client';

// Mock the configApi module so we don't make real HTTP calls
vi.mock('../configApi', () => ({
  getConfig: vi.fn().mockResolvedValue({
    version: 2,
    building: {
      sharedAccessApartmentId: 'apartment_1',
      sharedInfos: [],
      sharedAreas: [],
      sharedImportedGroupAddresses: [],
      sharedImportedGroupAddressesFileName: '',
    },
    apartments: [{
      id: 'apartment_1',
      name: 'Wohnung 1',
      slug: 'wohnung-1',
      knxIp: '192.168.1.85',
      knxPort: 3671,
      hue: { bridgeIp: '', apiKey: '' },
      floors: [{ id: 'floor-1', name: 'Ground Floor', rooms: [] }],
      alarms: [],
      importedGroupAddresses: [],
      importedGroupAddressesFileName: '',
    }],
  }),
  updateConfig: vi.fn().mockResolvedValue({ success: true }),
  triggerAction: vi.fn().mockResolvedValue({ success: true }),
  triggerHueAction: vi.fn().mockResolvedValue({ success: true }),
  discoverHueBridge: vi.fn().mockResolvedValue({ success: true, bridges: [] }),
  pairHueBridge: vi.fn().mockResolvedValue({ success: true, apiKey: 'key' }),
  unpairHueBridge: vi.fn().mockResolvedValue({ success: true }),
  getHueLights: vi.fn().mockResolvedValue({ success: true, lights: [] }),
  getHueRooms: vi.fn().mockResolvedValue({ success: true, rooms: [] }),
  getHueScenes: vi.fn().mockResolvedValue({ success: true, scenes: [] }),
  linkHueRoom: vi.fn().mockResolvedValue({ success: true }),
  unlinkHueRoom: vi.fn().mockResolvedValue({ success: true }),
  linkHueScene: vi.fn().mockResolvedValue({ success: true }),
  unlinkHueScene: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('socket.io-client', async () => {
  const mock = await import('../__mocks__/socket.io-client');
  return mock;
});

beforeEach(() => {
  resetSocketMock();
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/');
});

describe('App — rendering', () => {
  it('renders the KNX Control header', async () => {
    await act(async () => { render(<App />); });
    expect(screen.getByText(/KNX Control/i)).toBeInTheDocument();
  });

  it('shows Dashboard content by default', async () => {
    await act(async () => { render(<App />); });
    expect(screen.getByText(/No rooms on/i)).toBeInTheDocument();
  });

  it('navigates to Settings when Settings tab is clicked', async () => {
    const user = userEvent.setup();
    await act(async () => { render(<App />); });

    const settingsBtn = screen.getByRole('button', { name: /rooms/i });
    await user.click(settingsBtn);

    expect(screen.getByPlaceholderText(/Add room to/i)).toBeInTheDocument();
  });

  it('navigates back to Dashboard from Settings', async () => {
    const user = userEvent.setup();
    await act(async () => { render(<App />); });

    await user.click(screen.getByRole('button', { name: /rooms/i }));
    await user.click(screen.getByRole('button', { name: /dashboard/i }));

    expect(screen.getByText(/No rooms on/i)).toBeInTheDocument();
  });

  it('loads the bookmarked apartment and section from the URL', async () => {
    vi.mocked((await import('../configApi')).getConfig).mockResolvedValueOnce({
      version: 2,
      building: {
        sharedAccessApartmentId: 'apartment_1',
        sharedInfos: [],
        sharedAreas: [],
        sharedImportedGroupAddresses: [],
        sharedImportedGroupAddressesFileName: '',
      },
      apartments: [
        {
          id: 'apartment_1',
          name: 'Wohnung Ost',
          slug: 'wohnung-ost',
          knxIp: '192.168.1.85',
          knxPort: 3671,
          hue: { bridgeIp: '', apiKey: '' },
          floors: [{ id: 'floor-1', name: 'Living', rooms: [] }],
          alarms: [],
          importedGroupAddresses: [],
          importedGroupAddressesFileName: '',
        },
        {
          id: 'apartment_2',
          name: 'Wohnung West',
          slug: 'wohnung-west',
          knxIp: '192.168.1.86',
          knxPort: 3671,
          hue: { bridgeIp: '', apiKey: '' },
          floors: [{ id: 'west-floor', name: 'West Floor', rooms: [] }],
          alarms: [],
          importedGroupAddresses: [],
          importedGroupAddressesFileName: '',
        },
      ],
    });

    window.history.replaceState({}, '', '/wohnung-west/rooms');
    await act(async () => { render(<App />); });

    expect(screen.getByPlaceholderText(/Add room to West Floor/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Wohnung West')).toBeInTheDocument();
  });

  it('keeps the current section when switching apartments via the switcher', async () => {
    const user = userEvent.setup();
    vi.mocked((await import('../configApi')).getConfig).mockResolvedValueOnce({
      version: 2,
      building: {
        sharedAccessApartmentId: 'apartment_1',
        sharedInfos: [],
        sharedAreas: [],
        sharedImportedGroupAddresses: [],
        sharedImportedGroupAddressesFileName: '',
      },
      apartments: [
        {
          id: 'apartment_1',
          name: 'Wohnung Ost',
          slug: 'wohnung-ost',
          knxIp: '192.168.1.85',
          knxPort: 3671,
          hue: { bridgeIp: '', apiKey: '' },
          floors: [{ id: 'floor-1', name: 'Living', rooms: [] }],
          alarms: [],
          importedGroupAddresses: [],
          importedGroupAddressesFileName: '',
        },
        {
          id: 'apartment_2',
          name: 'Wohnung West',
          slug: 'wohnung-west',
          knxIp: '192.168.1.86',
          knxPort: 3671,
          hue: { bridgeIp: '', apiKey: '' },
          floors: [{ id: 'west-floor', name: 'West Floor', rooms: [] }],
          alarms: [],
          importedGroupAddresses: [],
          importedGroupAddressesFileName: '',
        },
      ],
    });

    window.history.replaceState({}, '', '/wohnung-ost/connections');
    await act(async () => { render(<App />); });

    const switcher = screen.getAllByRole('combobox')[0];
    await user.selectOptions(switcher, 'wohnung-west');

    expect(window.location.pathname).toBe('/wohnung-west/connections');
    expect(screen.getByText('Building Setup')).toBeInTheDocument();
  });
});

describe('App — KNX status badge', () => {
  it('shows offline badge initially', async () => {
    await act(async () => { render(<App />); });
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
  });

  it('updates to Connected when knx_status socket event fires', async () => {
    await act(async () => { render(<App />); });

    await act(async () => {
      triggerSocketEvent('knx_status', { apartmentId: 'apartment_1', scope: 'apartment', connected: true, msg: 'Connected successfully to bus' });
    });

    expect(screen.getByText(/connected/i)).toBeInTheDocument();
  });

  it('shows Offline when knx_status fires with connected=false', async () => {
    await act(async () => { render(<App />); });

    await act(async () => {
      triggerSocketEvent('knx_status', { apartmentId: 'apartment_1', scope: 'apartment', connected: false, msg: 'Disconnected from bus' });
    });

    expect(screen.getByText(/offline/i)).toBeInTheDocument();
  });

  it('shows the current apartment status when multiple apartment statuses exist', async () => {
    const user = userEvent.setup();
    vi.mocked((await import('../configApi')).getConfig).mockResolvedValueOnce({
      version: 2,
      building: {
        sharedAccessApartmentId: 'apartment_1',
        sharedInfos: [],
        sharedAreas: [],
        sharedImportedGroupAddresses: [],
        sharedImportedGroupAddressesFileName: '',
      },
      apartments: [
        {
          id: 'apartment_1',
          name: 'Wohnung Ost',
          slug: 'wohnung-ost',
          knxIp: '192.168.1.85',
          knxPort: 3671,
          hue: { bridgeIp: '', apiKey: '' },
          floors: [{ id: 'floor-1', name: 'Living', rooms: [] }],
          alarms: [],
          importedGroupAddresses: [],
          importedGroupAddressesFileName: '',
        },
        {
          id: 'apartment_2',
          name: 'Wohnung West',
          slug: 'wohnung-west',
          knxIp: '192.168.1.86',
          knxPort: 3671,
          hue: { bridgeIp: '', apiKey: '' },
          floors: [{ id: 'west-floor', name: 'West Floor', rooms: [] }],
          alarms: [],
          importedGroupAddresses: [],
          importedGroupAddressesFileName: '',
        },
      ],
    });

    await act(async () => { render(<App />); });

    await act(async () => {
      triggerSocketEvent('knx_status', { apartmentId: 'apartment_1', scope: 'apartment', connected: false, msg: 'offline' });
      triggerSocketEvent('knx_status', { apartmentId: 'apartment_2', scope: 'apartment', connected: true, msg: 'connected' });
    });

    expect(screen.getByText(/Wohnung Ost Offline/i)).toBeInTheDocument();

    await user.selectOptions(screen.getAllByRole('combobox')[0], 'wohnung-west');
    expect(screen.getByText(/Wohnung West Connected/i)).toBeInTheDocument();
  });
});

describe('App — toast system', () => {
  it('shows error toast when knx_error socket event fires', async () => {
    await act(async () => { render(<App />); });

    await act(async () => {
      triggerSocketEvent('knx_error', { msg: 'Bus access failed: connection refused' });
    });

    expect(screen.getByText(/Bus access failed/i)).toBeInTheDocument();
  });

  it('toast can be dismissed by clicking the close button', async () => {
    const user = userEvent.setup();
    await act(async () => { render(<App />); });

    await act(async () => {
      triggerSocketEvent('knx_error', { msg: 'Test error toast' });
    });

    const closeBtn = screen.getByRole('button', { name: /✕/ });
    await user.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText(/Test error toast/)).not.toBeInTheDocument();
    });
  });
});

describe('App — socket state updates', () => {
  it('updates device state when knx_state_update fires', async () => {
    vi.mocked((await import('../configApi')).getConfig).mockResolvedValueOnce({
      version: 2,
      building: {
        sharedAccessApartmentId: 'apartment_1',
        sharedInfos: [],
        sharedAreas: [],
        sharedImportedGroupAddresses: [],
        sharedImportedGroupAddressesFileName: '',
      },
      apartments: [{
        id: 'apartment_1',
        name: 'Wohnung 1',
        slug: 'wohnung-1',
        knxIp: '192.168.1.85',
        knxPort: 3671,
        hue: { bridgeIp: '', apiKey: '' },
        floors: [{
          id: 'floor-1',
          name: 'Ground Floor',
          rooms: [{
            id: 'r1', name: 'Living Room',
            sceneGroupAddress: '3/5/0',
            scenes: [],
            functions: [{
              id: 'f1', name: 'Main Light', type: 'switch',
              groupAddress: '1/0/0', statusGroupAddress: '1/0/1',
            }],
          }],
        }],
        alarms: [],
        importedGroupAddresses: [],
        importedGroupAddressesFileName: '',
      }],
    });

    await act(async () => { render(<App />); });

    await act(async () => {
      triggerSocketEvent('knx_initial_states', { apartments: { apartment_1: { '1/0/1': false } }, shared: {} });
      triggerSocketEvent('knx_state_update', { apartmentId: 'apartment_1', scope: 'apartment', groupAddress: '1/0/1', value: true });
    });

    // The toggle should now show "active" state  
    await waitFor(() => {
      const toggle = document.querySelector('.toggle-switch.active');
      expect(toggle).toBeTruthy();
    });
  });
});
