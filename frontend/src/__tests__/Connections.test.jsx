import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Connections from '../Connections';
import * as api from '../configApi';
import { buildApartmentView } from '../appModel';

vi.mock('../configApi', () => ({
  updateConfig: vi.fn(),
  discoverHueBridge: vi.fn(),
  pairHueBridge: vi.fn(),
  unpairHueBridge: vi.fn(),
  loadDevConfig: vi.fn(),
}));

vi.mock('../components/KNXGroupAddressModal', () => ({
  KNXGroupAddressModal: ({ isOpen, title, helperText, onImport, onClear }) => (
    isOpen ? (
      <div data-testid="knx-group-address-modal">
        <div>{title}</div>
        <div>{helperText}</div>
        <button
          onClick={() => onImport?.([{ address: '1/2/3', name: 'Imported Address', supported: true }], `${title}.xml`)}
        >
          Import mock XML
        </button>
        <button onClick={() => onClear?.()}>Clear mock XML</button>
      </div>
    ) : null
  ),
}));

const addToast = vi.fn();
const fetchConfig = vi.fn();
const applyConfig = vi.fn();
const navigateToApartment = vi.fn();

const FULL_CONFIG = {
  version: 2,
  building: {
    sharedAccessApartmentId: 'apartment_1',
    sharedUsesApartmentImportedGroupAddresses: false,
    sharedInfos: [{ id: 'info-1', name: 'Outside Temperature', type: 'info', category: 'temperature' }],
    sharedAreas: [{ id: 'shared-garden', name: 'Garden', rooms: [] }],
    sharedImportedGroupAddresses: [{ address: '1/7/1', name: 'Garden Weather', supported: true }],
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
      floors: [{ id: 'living', name: 'Living', rooms: [] }],
      areaOrder: ['living', 'shared-garden'],
      alarms: [{ id: 'alarm-1', name: 'Rain Alarm', type: 'alarm', category: 'alarm' }],
      importedGroupAddresses: [{ address: '2/1/1', name: 'East Line', supported: true }],
      importedGroupAddressesFileName: 'ost.xml',
    },
    {
      id: 'apartment_2',
      name: 'Wohnung West',
      slug: 'wohnung-west',
      knxIp: '192.168.1.20',
      knxPort: 3671,
      hue: { bridgeIp: '', apiKey: '' },
      floors: [{ id: 'west-floor', name: 'West Floor', rooms: [] }],
      areaOrder: ['west-floor', 'shared-garden'],
      alarms: [],
      importedGroupAddresses: [],
      importedGroupAddressesFileName: '',
    },
  ],
};

function renderConnections(fullConfig = FULL_CONFIG, apartmentSlug = 'wohnung-ost') {
  const { apartment, apartmentConfig } = buildApartmentView(fullConfig, apartmentSlug);

  return render(
    <Connections
      fullConfig={fullConfig}
      apartment={apartment}
      config={apartmentConfig}
      fetchConfig={fetchConfig}
      applyConfig={applyConfig}
      addToast={addToast}
      knxStatus={{ connected: true, msg: 'ok' }}
      sharedKnxStatus={{ connected: false, msg: 'offline' }}
      hueStatus={{ paired: false, bridgeIp: '' }}
      navigateToApartment={navigateToApartment}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.updateConfig.mockImplementation(async (nextConfig) => ({ success: true, config: nextConfig }));
  api.discoverHueBridge.mockResolvedValue({ success: true, bridges: [{ internalipaddress: '192.168.1.65' }] });
  api.pairHueBridge.mockResolvedValue({ success: true, apiKey: 'new-api-key' });
  api.unpairHueBridge.mockResolvedValue({ success: true });
  api.loadDevConfig.mockResolvedValue({ success: true });
});

describe('Connections — multi-apartment setup grouping', () => {
  it('renders the setup page with apartment, shared, and management groups', () => {
    renderConnections();

    expect(screen.getByText('Building Setup')).toBeInTheDocument();
    expect(screen.getByText('Current Apartment')).toBeInTheDocument();
    expect(screen.getByText('Shared Building Setup')).toBeInTheDocument();
    expect(screen.getByText('Manage Apartments')).toBeInTheDocument();
    expect(screen.getByText(/Shared KNX line via Wohnung Ost offline/i)).toBeInTheDocument();
  });
});

describe('Connections — apartment-specific persistence', () => {
  it('saves only the current apartment identity and gateway settings', async () => {
    const user = userEvent.setup();
    renderConnections();

    const identityHeading = screen.getByText('Identity & KNX Gateway');
    const identityCard = identityHeading.closest('section');
    const [nameInput, slugInput, ipInput] = within(identityCard).getAllByRole('textbox');
    const portInput = within(identityCard).getByRole('spinbutton');

    await user.clear(nameInput);
    await user.type(nameInput, 'Wohnung Ost Neu');
    await user.clear(slugInput);
    await user.type(slugInput, 'wohn-ost-neu');
    await user.clear(ipInput);
    await user.type(ipInput, '192.168.50.10');
    await user.clear(portInput);
    await user.type(portInput, '3675');
    await user.click(screen.getByRole('button', { name: /save apartment/i }));

    await waitFor(() => {
      expect(api.updateConfig).toHaveBeenCalledWith(expect.objectContaining({
        building: expect.objectContaining({
          sharedAccessApartmentId: 'apartment_1',
          sharedImportedGroupAddressesFileName: 'shared.xml',
        }),
        apartments: expect.arrayContaining([
          expect.objectContaining({
            id: 'apartment_1',
            name: 'Wohnung Ost Neu',
            slug: 'wohn-ost-neu',
            knxIp: '192.168.50.10',
            knxPort: 3675,
          }),
          expect.objectContaining({
            id: 'apartment_2',
            name: 'Wohnung West',
            slug: 'wohnung-west',
          }),
        ]),
      }));
    });
    expect(addToast).toHaveBeenCalledWith('Apartment settings saved', 'success');
  });

  it('opens the apartment ETS modal and persists imported addresses in the apartment scope', async () => {
    const user = userEvent.setup();
    renderConnections();

    await user.click(screen.getByRole('button', { name: /manage apartment ets xml/i }));
    expect(screen.getByTestId('knx-group-address-modal')).toBeInTheDocument();
    expect(screen.getByText('Apartment ETS XML import')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /import mock xml/i }));

    await waitFor(() => {
      expect(api.updateConfig).toHaveBeenCalledWith(expect.objectContaining({
        apartments: expect.arrayContaining([
          expect.objectContaining({
            id: 'apartment_1',
            importedGroupAddresses: [expect.objectContaining({ address: '1/2/3', name: 'Imported Address' })],
            importedGroupAddressesFileName: 'Apartment ETS XML import.xml',
          }),
        ]),
        building: expect.objectContaining({
          sharedImportedGroupAddressesFileName: 'shared.xml',
        }),
      }));
    });
  });
});

describe('Connections — shared building setup', () => {
  it('saves which apartment provides shared KNX access', async () => {
    const user = userEvent.setup();
    renderConnections();

    await user.selectOptions(screen.getByRole('combobox'), 'apartment_2');
    await user.click(screen.getByRole('button', { name: /save shared setup/i }));

    await waitFor(() => {
      expect(api.updateConfig).toHaveBeenCalledWith(expect.objectContaining({
        building: expect.objectContaining({
          sharedAccessApartmentId: 'apartment_2',
        }),
      }));
    });
    expect(addToast).toHaveBeenCalledWith('Shared building settings saved', 'success');
  });

  it('opens the shared ETS modal and persists imported addresses in the building scope', async () => {
    const user = userEvent.setup();
    renderConnections();

    await user.click(screen.getByRole('button', { name: /manage shared ets xml/i }));
    expect(screen.getByText('Shared ETS XML import')).toBeInTheDocument();
    expect(screen.getByText(/shared areas and shared information/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /import mock xml/i }));

    await waitFor(() => {
      expect(api.updateConfig).toHaveBeenCalledWith(expect.objectContaining({
        building: expect.objectContaining({
          sharedImportedGroupAddresses: [expect.objectContaining({ address: '1/2/3', name: 'Imported Address' })],
          sharedImportedGroupAddressesFileName: 'Shared ETS XML import.xml',
        }),
        apartments: expect.arrayContaining([
          expect.objectContaining({
            id: 'apartment_1',
            importedGroupAddressesFileName: 'ost.xml',
          }),
        ]),
      }));
    });
  });

  it('can switch shared browsing to the apartment ETS XML and clears dedicated shared XML after confirmation', async () => {
    const user = userEvent.setup();
    renderConnections();

    await user.click(screen.getByRole('checkbox', { name: /use apartment's ets xml/i }));
    expect(screen.getByText('Use Apartment ETS XML')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Use Apartment XML' }));

    expect(screen.queryByRole('button', { name: /manage shared ets xml/i })).not.toBeInTheDocument();
    expect(screen.getByText(/using the current apartment ets xml for shared address browsing/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /save shared setup/i }));

    await waitFor(() => {
      expect(api.updateConfig).toHaveBeenCalledWith(expect.objectContaining({
        building: expect.objectContaining({
          sharedUsesApartmentImportedGroupAddresses: true,
          sharedImportedGroupAddresses: [],
          sharedImportedGroupAddressesFileName: '',
        }),
      }));
    });
  });
});

describe('Connections — apartment management', () => {
  it('navigates to another apartment from the apartment list', async () => {
    const user = userEvent.setup();
    renderConnections();

    await user.click(screen.getByRole('button', { name: /wohnung west/i }));

    expect(navigateToApartment).toHaveBeenCalledWith('wohnung-west');
  });

  it('creates a new apartment with a unique slug and navigates there', async () => {
    const user = userEvent.setup();
    renderConnections();

    await user.type(screen.getByPlaceholderText('e.g. Wohnung West'), 'Wohnung West');
    await user.click(screen.getByRole('button', { name: /create apartment/i }));

    await waitFor(() => {
      expect(api.updateConfig).toHaveBeenCalledWith(expect.objectContaining({
        apartments: expect.arrayContaining([
          expect.objectContaining({ id: 'apartment_1', slug: 'wohnung-ost' }),
          expect.objectContaining({ id: 'apartment_2', slug: 'wohnung-west' }),
          expect.objectContaining({
            name: 'Wohnung West',
            slug: 'wohnung-west-2',
            floors: [expect.objectContaining({ name: 'Ground Floor' })],
          }),
        ]),
      }));
    });

    expect(navigateToApartment).toHaveBeenCalledWith('wohnung-west-2');
    expect(addToast).toHaveBeenCalledWith('Apartment "Wohnung West" created', 'success');
  });
});
