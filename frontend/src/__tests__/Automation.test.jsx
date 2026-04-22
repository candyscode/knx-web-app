import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Automation from '../Automation';
import * as api from '../configApi';
import { buildApartmentView } from '../appModel';

vi.mock('../configApi', () => ({
  updateConfig: vi.fn(),
}));

const addToast = vi.fn();
const fetchConfig = vi.fn();
const applyConfig = vi.fn();

const FULL_CONFIG = {
  version: 2,
  building: {
    sharedAccessApartmentId: 'apartment_1',
    sharedUsesApartmentImportedGroupAddresses: false,
    sharedInfos: [],
    sharedAreas: [
      {
        id: 'shared-garden',
        name: 'Garden',
        rooms: [
          {
            id: 'shared-room',
            name: 'Garden',
            sceneGroupAddress: '1/2/3',
            scenes: [{ id: 'shared-scene', name: 'Evening', sceneNumber: 7, category: 'light' }],
            functions: [],
          },
        ],
      },
    ],
    sharedImportedGroupAddresses: [],
    sharedImportedGroupAddressesFileName: '',
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
          id: 'living',
          name: 'Living',
          rooms: [
            {
              id: 'living-room',
              name: 'Wohnzimmer',
              sceneGroupAddress: '2/3/4',
              scenes: [{ id: 'scene-1', name: 'Bright', sceneNumber: 3, category: 'light' }],
              functions: [
                { id: 'switch-1', name: 'Shade Lock', type: 'switch', groupAddress: '2/4/1' },
                { id: 'percent-1', name: 'Shade Position', type: 'percentage', groupAddress: '2/4/2' },
              ],
            },
          ],
        },
      ],
      areaOrder: ['living', 'shared-garden'],
      alarms: [],
      automations: [],
      importedGroupAddresses: [],
      importedGroupAddressesFileName: '',
    },
  ],
};

function renderAutomation(config = FULL_CONFIG) {
  const { apartment, apartmentConfig } = buildApartmentView(config, 'wohnung-ost');

  return render(
    <Automation
      fullConfig={config}
      apartment={apartment}
      config={apartmentConfig}
      fetchConfig={fetchConfig}
      applyConfig={applyConfig}
      addToast={addToast}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.updateConfig.mockImplementation(async (nextConfig) => ({ success: true, config: nextConfig }));
});

describe('Automation', () => {
  it('creates a routine with a shared scene action', async () => {
    const user = userEvent.setup();
    renderAutomation();

    await user.click(screen.getByRole('button', { name: /add routine/i }));
    await user.type(screen.getByLabelText(/name/i), 'Garden Evening');
    await user.clear(screen.getByLabelText(/time/i));
    await user.type(screen.getByLabelText(/time/i), '21:15');

    await user.click(screen.getByRole('button', { name: /add action/i }));
    await user.type(screen.getByPlaceholderText(/search for a room/i), 'evening');
    await user.click(screen.getByRole('button', { name: /evening/i }));

    await user.click(screen.getByRole('button', { name: /create routine/i }));

    await waitFor(() => {
      expect(api.updateConfig).toHaveBeenCalledWith(expect.objectContaining({
        apartments: expect.arrayContaining([
          expect.objectContaining({
            id: 'apartment_1',
            automations: [
              expect.objectContaining({
                name: 'Garden Evening',
                time: '21:15',
                actions: [
                  expect.objectContaining({
                    kind: 'scene',
                    scope: 'shared',
                    roomId: 'shared-room',
                    targetId: 'shared-scene',
                  }),
                ],
              }),
            ],
          }),
        ]),
      }));
    });
  });

  it('creates a routine with a percentage function value', async () => {
    const user = userEvent.setup();
    renderAutomation();

    await user.click(screen.getByRole('button', { name: /add routine/i }));
    await user.type(screen.getByLabelText(/name/i), 'Shade Half');

    await user.click(screen.getByRole('button', { name: /add action/i }));
    await user.type(screen.getByPlaceholderText(/search for a room/i), 'shade position');
    await user.click(screen.getByRole('button', { name: /shade position/i }));

    const valueInput = screen.getByLabelText(/value for shade position/i);
    await user.clear(valueInput);
    await user.type(valueInput, '50');

    await user.click(screen.getByRole('button', { name: /create routine/i }));

    await waitFor(() => {
      expect(api.updateConfig).toHaveBeenCalledWith(expect.objectContaining({
        apartments: expect.arrayContaining([
          expect.objectContaining({
            automations: [
              expect.objectContaining({
                actions: [
                  expect.objectContaining({
                    kind: 'function',
                    targetId: 'percent-1',
                    value: '50',
                  }),
                ],
              }),
            ],
          }),
        ]),
      }));
    });
  });

  it('toggles an existing routine enabled state', async () => {
    const user = userEvent.setup();
    const configWithRoutine = {
      ...FULL_CONFIG,
      apartments: [
        {
          ...FULL_CONFIG.apartments[0],
          automations: [
            {
              id: 'routine-1',
              name: 'Morning',
              enabled: true,
              time: '07:30',
              frequency: 'daily',
              actions: [{
                id: 'action-1',
                kind: 'scene',
                scope: 'apartment',
                areaId: 'living',
                roomId: 'living-room',
                targetId: 'scene-1',
                targetType: 'scene',
              }],
            },
          ],
        },
      ],
    };

    renderAutomation(configWithRoutine);

    await user.click(screen.getByRole('checkbox', { name: /enable morning/i }));

    await waitFor(() => {
      expect(api.updateConfig).toHaveBeenCalledWith(expect.objectContaining({
        apartments: expect.arrayContaining([
          expect.objectContaining({
            automations: [
              expect.objectContaining({
                id: 'routine-1',
                enabled: false,
              }),
            ],
          }),
        ]),
      }));
    });
  });

  it('shows validation when trying to save a routine without actions', async () => {
    const user = userEvent.setup();
    renderAutomation();

    await user.click(screen.getByRole('button', { name: /add routine/i }));
    await user.type(screen.getByLabelText(/name/i), 'Invalid');
    await user.click(screen.getByRole('button', { name: /create routine/i }));

    expect(screen.getByText(/add at least one action/i)).toBeInTheDocument();
    expect(api.updateConfig).not.toHaveBeenCalled();
  });
});
