import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock configApi
vi.mock('../configApi', () => ({
  updateConfig: vi.fn().mockResolvedValue({ config: null }),
  getConfig: vi.fn().mockResolvedValue({}),
}));

import { updateConfig } from '../configApi';
import Automation from '../Automation';
import RoutineCard from '../components/RoutineCard';

const FLOORS = [
  {
    id: 'f1',
    name: 'Ground Floor',
    rooms: [
      {
        id: 'r1',
        name: 'Living Room',
        sceneGroupAddress: '1/0/0',
        scenes: [{ id: 's1', name: 'Bright', sceneNumber: 1 }],
        functions: [
          { id: 'fn1', name: 'Left Blind', type: 'percentage', groupAddress: '1/5/0' },
          { id: 'fn2', name: 'Ceiling Light', type: 'switch', groupAddress: '1/1/0' },
        ],
      },
    ],
  },
];

const BASE_CONFIG = {
  apartmentId: 'apt1',
  apartmentSlug: 'wohnung-ost',
  apartments: [{ id: 'apt1', name: 'Wohnung Ost' }],
  floors: FLOORS,
  automations: [],
};

const BASE_APARTMENT = { id: 'apt1', name: 'Wohnung Ost' };

const mockProps = (overrides = {}) => ({
  apartment: BASE_APARTMENT,
  config: { ...BASE_CONFIG, ...overrides },
  fetchConfig: vi.fn(),
  applyConfig: vi.fn(),
  addToast: vi.fn(),
});

describe('Automation page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state when no routines', () => {
    render(<Automation {...mockProps()} />);
    expect(screen.getByText(/keine routinen/i)).toBeInTheDocument();
  });

  it('renders list of routines from config', () => {
    const props = mockProps({
      automations: [
        {
          id: 'auto1', name: 'Morning Routine', enabled: true,
          time: '07:00', frequency: 'daily', actions: [], lastRunAt: null, lastRunStatus: null,
        },
        {
          id: 'auto2', name: 'Night Mode', enabled: false,
          time: '22:30', frequency: 'daily', actions: [], lastRunAt: null, lastRunStatus: null,
        },
      ],
    });
    render(<Automation {...props} />);
    expect(screen.getByText('Morning Routine')).toBeInTheDocument();
    expect(screen.getByText('Night Mode')).toBeInTheDocument();
  });

  it('"Add Routine" button opens modal', () => {
    render(<Automation {...mockProps()} />);
    fireEvent.click(screen.getAllByRole('button', { name: /routine/i })[0]);
    expect(screen.getByText(/neue routine/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/morgenroutine/i)).toBeInTheDocument();
  });

  it('modal requires name before saving', async () => {
    render(<Automation {...mockProps()} />);
    fireEvent.click(screen.getAllByRole('button', { name: /routine/i })[0]);

    // Try to save without name
    fireEvent.click(screen.getByText(/routine erstellen/i));
    expect(await screen.findByText(/name ist erforderlich/i)).toBeInTheDocument();
    expect(updateConfig).not.toHaveBeenCalled();
  });

  it('modal requires at least 1 action', async () => {
    render(<Automation {...mockProps()} />);
    fireEvent.click(screen.getAllByRole('button', { name: /routine/i })[0]);

    fireEvent.change(screen.getByPlaceholderText(/morgenroutine/i), { target: { value: 'Test' } });
    fireEvent.click(screen.getByText(/routine erstellen/i));
    expect(await screen.findByText(/mindestens eine aktion/i)).toBeInTheDocument();
  });

  it('saves correctly with name + action (scene)', async () => {
    render(<Automation {...mockProps()} />);
    fireEvent.click(screen.getAllByRole('button', { name: /routine/i })[0]);

    fireEvent.change(screen.getByPlaceholderText(/morgenroutine/i), { target: { value: 'Dawn' } });

    // Open action picker
    fireEvent.click(screen.getByRole('button', { name: /aktion hinzufügen/i }));
    await waitFor(() =>
      expect(screen.getByText('Bright')).toBeInTheDocument()
    );

    // Select the scene
    fireEvent.click(screen.getByText('Bright'));

    // Back in modal, save
    fireEvent.click(screen.getByText(/routine erstellen/i));
    await waitFor(() => expect(updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        apartmentId: 'apt1',
        automations: expect.arrayContaining([
          expect.objectContaining({ name: 'Dawn', frequency: 'daily' }),
        ]),
      })
    ));
  });

  it('selects sunrise trigger', async () => {
    // Add sun trigger config so modal doesn't show missing config warnings
    const props = mockProps({ sunTrigger: { groupAddress: '7/0/0', bus: 'main', dayValue: 1 } });
    render(<Automation {...props} />);
    fireEvent.click(screen.getAllByRole('button', { name: /routine/i })[0]);

    fireEvent.change(screen.getByPlaceholderText(/morgenroutine/i), { target: { value: 'Dawn' } });
    fireEvent.click(screen.getByText('Sonnenaufgang'));

    fireEvent.click(screen.getByRole('button', { name: /aktion hinzufügen/i }));
    await waitFor(() => expect(screen.getByText('Bright')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Bright'));

    fireEvent.click(screen.getByText(/routine erstellen/i));
    await waitFor(() => expect(updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        automations: expect.arrayContaining([
          expect.objectContaining({ name: 'Dawn', triggerType: 'sunrise' }),
        ]),
      })
    ));
  });

  it('toggle enable/disable calls updateConfig', async () => {
    const props = mockProps({
      automations: [{
        id: 'a1', name: 'Test', enabled: true, time: '08:00', frequency: 'daily',
        actions: [], lastRunAt: null, lastRunStatus: null,
      }],
    });
    render(<Automation {...props} />);
    // Toggle switch has aria-label 'Routine enabled'
    fireEvent.click(screen.getByTitle(/routine deaktivieren/i));
    await waitFor(() => expect(updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        automations: expect.arrayContaining([expect.objectContaining({ id: 'a1', enabled: false })]),
      })
    ));
  });

  it('delete calls updateConfig with routine removed', async () => {
    const props = mockProps({
      automations: [{
        id: 'a1', name: 'Deletable', enabled: false, time: '06:00',
        frequency: 'daily', actions: [], lastRunAt: null, lastRunStatus: null,
      }],
    });
    render(<Automation {...props} />);
    // Click trash icon → opens ConfirmDialog
    fireEvent.click(screen.getByTitle(/routine löschen/i));
    // Confirm dialog should appear; click the confirm button
    const confirmBtn = await screen.findByRole("button", { name: /^löschen$/i });
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({ automations: [] })
    ));
  });
});

describe('RoutineCard', () => {
  const ROUTINE = {
    id: 'r1', name: 'Evening', enabled: true, time: '20:00',
    frequency: 'daily', actions: [], lastRunAt: null, lastRunStatus: null,
  };

  it('renders routine name and time', () => {
    render(<RoutineCard routine={ROUTINE} floors={FLOORS} onToggle={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Evening')).toBeInTheDocument();
    expect(screen.getByText('20:00')).toBeInTheDocument();
  });

  it('shows Broken badge when action target is deleted', () => {
    const brokenAction = { id: 'ax', kind: 'scene', areaId: 'f1', roomId: 'r1', targetId: 'DELETED_SCENE', targetType: 'scene', value: null };
    render(
      <RoutineCard
        routine={{ ...ROUTINE, actions: [brokenAction] }}
        floors={FLOORS}
        onToggle={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()}
      />
    );
    expect(screen.getByText(/fehlerhaft/i)).toBeInTheDocument();
  });

  it('resolves valid scene label in action list', () => {
    const validAction = { id: 'ax', kind: 'scene', areaId: 'f1', roomId: 'r1', targetId: 's1', targetType: 'scene', value: null };
    render(
      <RoutineCard
        routine={{ ...ROUTINE, actions: [validAction] }}
        floors={FLOORS}
        onToggle={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()}
      />
    );
    expect(screen.getByText(/Ground Floor › Living Room › Bright/i)).toBeInTheDocument();
  });
});
