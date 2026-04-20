import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Settings from '../Settings';
import * as api from '../configApi';
import { buildApartmentView } from '../appModel';

vi.mock('../configApi', () => ({
  updateConfig: vi.fn(),
  getHueLights: vi.fn(),
  getHueRooms: vi.fn(),
  getHueScenes: vi.fn(),
  linkHueRoom: vi.fn(),
  unlinkHueRoom: vi.fn(),
  linkHueScene: vi.fn(),
  unlinkHueScene: vi.fn(),
}));

vi.mock('../components/FloorTabs', () => ({
  default: ({ floors, activeFloorId, onSelectFloor, onAddButtonClick, onDeleteFloor, onReorderFloors }) => (
    <div data-testid="floor-tabs-mock">
      {floors.map((floor) => (
        <button
          key={floor.id}
          data-active={floor.id === activeFloorId}
          onClick={() => onSelectFloor?.(floor.id)}
        >
          {floor.name}{floor.isShared ? ' (shared)' : ''}
        </button>
      ))}
      <button onClick={() => onAddButtonClick?.()}>Add Area</button>
      {floors[0] && <button onClick={() => onDeleteFloor?.(floors[0].id)}>Delete First Area</button>}
      {floors.length > 1 && <button onClick={() => onReorderFloors?.([...floors].reverse())}>Reverse Areas</button>}
    </div>
  ),
}));

vi.mock('../components/CollapsibleRoomCard', () => ({
  default: ({ room, floorId, handleDeleteRoom }) => (
    <div data-testid={`room-${room.id}`}>
      <span>{room.name}</span>
      <button onClick={() => handleDeleteRoom?.(floorId, room.id)}>Delete Room</button>
    </div>
  ),
}));

vi.mock('../components/KNXGroupAddressModal', () => ({
  KNXGroupAddressModal: ({ isOpen, importedFileName, addresses }) => (
    isOpen ? (
      <div data-testid="knx-group-address-modal">
        <div>file:{importedFileName || 'none'}</div>
        <div>count:{addresses.length}</div>
      </div>
    ) : null
  ),
}));

const addToast = vi.fn();
const fetchConfig = vi.fn();
const applyConfig = vi.fn();

const FULL_CONFIG = {
  version: 2,
  building: {
    sharedAccessApartmentId: 'apartment_1',
    sharedUsesApartmentImportedGroupAddresses: false,
    sharedInfos: [
      {
        id: 'info-1',
        name: 'Outside Temperature',
        type: 'info',
        category: 'temperature',
        statusGroupAddress: '1/1/1',
      },
    ],
    sharedAreas: [
      {
        id: 'shared-garden',
        name: 'Garden',
        rooms: [{ id: 'shared-room-1', name: 'Garden Lights', scenes: [], functions: [] }],
      },
    ],
    sharedImportedGroupAddresses: [{ address: '1/6/3', name: 'Shared Weather', supported: true }],
    sharedImportedGroupAddressesFileName: 'shared.xml',
  },
  apartments: [
    {
      id: 'apartment_1',
      name: 'Wohnung Ost',
      slug: 'wohnung-ost',
      knxIp: '192.168.1.10',
      knxPort: 3671,
      hue: { bridgeIp: '', apiKey: '' },
      floors: [
        {
          id: 'east-living',
          name: 'Living',
          rooms: [{ id: 'room-1', name: 'Living Room', scenes: [], functions: [] }],
        },
      ],
      areaOrder: ['east-living', 'shared-garden'],
      alarms: [
        {
          id: 'alarm-1',
          name: 'Rain Alarm',
          type: 'alarm',
          category: 'alarm',
          statusGroupAddress: '2/1/1',
        },
      ],
      importedGroupAddresses: [{ address: '3/6/1', name: 'Apartment Weather', supported: true }],
      importedGroupAddressesFileName: 'apartment.xml',
    },
    {
      id: 'apartment_2',
      name: 'Wohnung West',
      slug: 'wohnung-west',
      knxIp: '192.168.1.20',
      knxPort: 3671,
      hue: { bridgeIp: '', apiKey: '' },
      floors: [{ id: 'west-living', name: 'West Living', rooms: [] }],
      areaOrder: ['west-living', 'shared-garden'],
      alarms: [],
      importedGroupAddresses: [],
      importedGroupAddressesFileName: '',
    },
  ],
};

function renderSettings(fullConfig = FULL_CONFIG, apartmentSlug = 'wohnung-ost') {
  const { apartment, apartmentConfig } = buildApartmentView(fullConfig, apartmentSlug);

  return render(
    <Settings
      fullConfig={fullConfig}
      apartment={apartment}
      config={apartmentConfig}
      fetchConfig={fetchConfig}
      applyConfig={applyConfig}
      addToast={addToast}
      hueStatus={{ paired: false, bridgeIp: '' }}
      sharedHueStatus={{ paired: false, bridgeIp: '' }}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.updateConfig.mockImplementation(async (nextConfig) => ({ success: true, config: nextConfig }));
  api.getHueLights.mockResolvedValue({ success: true, lights: [] });
  api.getHueRooms.mockResolvedValue({ success: true, rooms: [] });
  api.getHueScenes.mockResolvedValue({ success: true, scenes: [] });
  api.linkHueRoom.mockResolvedValue({ success: true });
  api.unlinkHueRoom.mockResolvedValue({ success: true });
  api.linkHueScene.mockResolvedValue({ success: true });
  api.unlinkHueScene.mockResolvedValue({ success: true });
});

describe('Settings — merged multi-apartment area view', () => {
  it('shows private and shared areas together for the current apartment', () => {
    renderSettings();

    expect(screen.getByText('Living')).toBeInTheDocument();
    expect(screen.getByText('Garden (shared)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Add room to Living/i)).toBeInTheDocument();
  });
});

describe('Settings — area creation and ordering', () => {
  it('creates a private area from the Add Area modal inside the current apartment only', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole('button', { name: 'Add Area' }));
    await user.type(screen.getByPlaceholderText('e.g. Garden'), 'Bedroom');
    await user.click(screen.getByRole('button', { name: /create area/i }));

    await waitFor(() => {
      expect(api.updateConfig).toHaveBeenCalledWith(expect.objectContaining({
        building: expect.objectContaining({
          sharedAreas: [expect.objectContaining({ id: 'shared-garden', name: 'Garden' })],
        }),
        apartments: expect.arrayContaining([
          expect.objectContaining({
            id: 'apartment_1',
            floors: expect.arrayContaining([
              expect.objectContaining({ id: 'east-living', name: 'Living' }),
              expect.objectContaining({ name: 'Bedroom', rooms: [] }),
            ]),
          }),
          expect.objectContaining({
            id: 'apartment_2',
            floors: [expect.objectContaining({ id: 'west-living', name: 'West Living' })],
          }),
        ]),
      }));
    });
  });

  it('creates a shared area from the Add Area modal in the shared building scope', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole('button', { name: 'Add Area' }));
    await user.type(screen.getByPlaceholderText('e.g. Garden'), 'Garage');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /create area/i }));

    await waitFor(() => {
      expect(api.updateConfig).toHaveBeenCalledWith(expect.objectContaining({
        building: expect.objectContaining({
          sharedAreas: expect.arrayContaining([
            expect.objectContaining({ id: 'shared-garden', name: 'Garden' }),
            expect.objectContaining({ name: 'Garage', rooms: [] }),
          ]),
        }),
        apartments: expect.arrayContaining([
          expect.objectContaining({
            id: 'apartment_1',
            floors: [expect.objectContaining({ id: 'east-living', name: 'Living' })],
          }),
        ]),
      }));
    });
  });

  it('persists mixed private and shared area order back into apartment.areaOrder', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole('button', { name: 'Reverse Areas' }));

    await waitFor(() => {
      expect(api.updateConfig).toHaveBeenCalledWith(expect.objectContaining({
        building: expect.objectContaining({
          sharedAreas: [expect.objectContaining({ id: 'shared-garden', name: 'Garden' })],
        }),
        apartments: expect.arrayContaining([
          expect.objectContaining({
            id: 'apartment_1',
            areaOrder: ['shared-garden', 'east-living'],
            floors: [expect.objectContaining({ id: 'east-living', name: 'Living' })],
          }),
        ]),
      }));
    });
  });
});

describe('Settings — custom confirmations', () => {
  it('uses the custom confirm dialog instead of window.confirm when deleting an area', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm');
    renderSettings();

    await user.click(screen.getByRole('button', { name: 'Delete First Area' }));

    expect(screen.getByText('Delete Area')).toBeInTheDocument();
    expect(screen.getByText('"Living" contains 1 room(s). Delete everything?')).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(api.updateConfig).toHaveBeenCalledWith(expect.objectContaining({
        apartments: expect.arrayContaining([
          expect.objectContaining({
            id: 'apartment_1',
            floors: [],
            areaOrder: ['shared-garden'],
          }),
        ]),
      }));
    });
  });
});

describe('Settings — shared information and apartment alarms', () => {
  it('stores new shared information in the building scope only', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole('button', { name: /global info & alarms/i }));
    await user.click(screen.getByRole('button', { name: /add shared information/i }));
    await user.type(screen.getByPlaceholderText('Name (e.g. Outside Temperature)'), 'Wind');
    await user.click(screen.getByRole('button', { name: /save item/i }));

    await waitFor(() => {
      expect(api.updateConfig).toHaveBeenCalledWith(expect.objectContaining({
        building: expect.objectContaining({
          sharedInfos: expect.arrayContaining([
            expect.objectContaining({ id: 'info-1', name: 'Outside Temperature' }),
            expect.objectContaining({ name: 'Wind', type: 'info', category: 'temperature' }),
          ]),
        }),
        apartments: expect.arrayContaining([
          expect.objectContaining({
            id: 'apartment_1',
            alarms: [expect.objectContaining({ id: 'alarm-1', name: 'Rain Alarm' })],
          }),
        ]),
      }));
    });
  });

  it('stores new apartment alarms only inside the active apartment', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole('button', { name: /global info & alarms/i }));
    await user.click(screen.getByRole('button', { name: /add alarm/i }));
    await user.type(screen.getByPlaceholderText('Name (e.g. Rain Alarm)'), 'Window Alarm');
    await user.click(screen.getByRole('button', { name: /save item/i }));

    await waitFor(() => {
      expect(api.updateConfig).toHaveBeenCalledWith(expect.objectContaining({
        building: expect.objectContaining({
          sharedInfos: [expect.objectContaining({ id: 'info-1', name: 'Outside Temperature' })],
        }),
        apartments: expect.arrayContaining([
          expect.objectContaining({
            id: 'apartment_1',
            alarms: expect.arrayContaining([
              expect.objectContaining({ id: 'alarm-1', name: 'Rain Alarm' }),
              expect.objectContaining({ name: 'Window Alarm', type: 'alarm' }),
            ]),
          }),
          expect.objectContaining({
            id: 'apartment_2',
            alarms: [],
          }),
        ]),
      }));
    });
  });

  it('uses the apartment ETS XML for shared GA browsing when configured', async () => {
    const user = userEvent.setup();
    renderSettings({
      ...FULL_CONFIG,
      building: {
        ...FULL_CONFIG.building,
        sharedUsesApartmentImportedGroupAddresses: true,
      },
    });

    await user.click(screen.getByRole('button', { name: /global info & alarms/i }));
    await user.click(screen.getAllByTitle('Browse ETS addresses')[0]);

    expect(screen.getByTestId('knx-group-address-modal')).toBeInTheDocument();
    expect(screen.getByText('file:apartment.xml')).toBeInTheDocument();
    expect(screen.getByText('count:1')).toBeInTheDocument();
  });
});
