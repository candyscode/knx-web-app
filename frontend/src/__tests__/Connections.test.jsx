import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Connections from '../Connections';
import * as api from '../configApi';

vi.mock('../configApi', () => ({
  updateConfig: vi.fn(),
  discoverHueBridge: vi.fn(),
  pairHueBridge: vi.fn(),
  unpairHueBridge: vi.fn(),
}));

const addToast = vi.fn();
const fetchConfig = vi.fn();

const BASE_CONFIG = {
  knxIp: '192.168.1.85',
  knxPort: 3671,
  hue: { bridgeIp: '', apiKey: '' },
};

function renderConnections(config = BASE_CONFIG, hueStatus = { paired: false, bridgeIp: '' }) {
  return render(
    <Connections
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
});

describe('Connections — KNX Interface', () => {
  it('renders KNX section heading', () => {
    renderConnections();
    expect(screen.getByText('KNX Interface')).toBeInTheDocument();
  });

  it('populates IP input with config value', () => {
    renderConnections();
    const ipInput = screen.getByPlaceholderText('192.168.1.50');
    expect(ipInput.value).toBe('192.168.1.85');
  });

  it('populates port input with config value', () => {
    renderConnections();
    const portInput = screen.getByPlaceholderText('3671');
    expect(portInput.value).toBe('3671');
  });

  it('calls updateConfig with new IP when Save is clicked', async () => {
    const user = userEvent.setup();
    renderConnections();
    const ipInput = screen.getByPlaceholderText('192.168.1.50');
    await user.clear(ipInput);
    await user.type(ipInput, '10.0.0.1');
    const saveBtn = screen.getByRole('button', { name: /save/i });
    await user.click(saveBtn);
    expect(api.updateConfig).toHaveBeenCalledWith(expect.objectContaining({ knxIp: '10.0.0.1' }));
  });

  it('shows success toast after saving KNX settings', async () => {
    const user = userEvent.setup();
    renderConnections();
    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(addToast).toHaveBeenCalledWith('Connection settings saved', 'success'));
  });
});

describe('Connections — Hue: not paired', () => {
  it('renders Philips Hue section', () => {
    renderConnections();
    expect(screen.getByText('Philips Hue')).toBeInTheDocument();
  });

  it('shows Discover and manual IP buttons when not paired', () => {
    renderConnections();
    expect(screen.getByRole('button', { name: /discover/i })).toBeInTheDocument();
  });

  it('discovers bridge and fills IP on success', async () => {
    const user = userEvent.setup();
    renderConnections();
    await user.click(screen.getByRole('button', { name: /discover/i }));
    await waitFor(() => { expect(api.discoverHueBridge).toHaveBeenCalled(); });
  });

  it('shows error when no bridges found during discovery', async () => {
    api.discoverHueBridge.mockResolvedValueOnce({ success: true, bridges: [] });
    const user = userEvent.setup();
    renderConnections();
    await user.click(screen.getByRole('button', { name: /discover/i }));
    await waitFor(() => { expect(screen.getByText(/No Hue Bridge found/i)).toBeInTheDocument(); });
  });
});

describe('Connections — Hue: pairing flow', () => {
  it('shows Pair button after bridge is found', async () => {
    const user = userEvent.setup();
    renderConnections();
    await user.click(screen.getByRole('button', { name: /discover/i }));
    await waitFor(() => { expect(screen.getByRole('button', { name: /pair/i })).toBeInTheDocument(); });
  });

  it('calls pairHueBridge and shows success toast when pairing succeeds', async () => {
    const user = userEvent.setup();
    renderConnections();
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
    renderConnections();
    await user.click(screen.getByRole('button', { name: /discover/i }));
    await waitFor(() => screen.getByRole('button', { name: /pair/i }));
    await user.click(screen.getByRole('button', { name: /pair/i }));
    await waitFor(() => { expect(screen.getByText(/link button not pressed/i)).toBeInTheDocument(); });
  });
});

describe('Connections — Hue: paired state', () => {
  it('shows "Paired" badge when hueStatus.paired=true', () => {
    renderConnections(BASE_CONFIG, { paired: true, bridgeIp: '192.168.1.65' });
    expect(screen.getByText('Paired')).toBeInTheDocument();
    expect(screen.getByText(/192.168.1.65/)).toBeInTheDocument();
  });

  it('shows Unpair button when paired', () => {
    renderConnections(BASE_CONFIG, { paired: true, bridgeIp: '192.168.1.65' });
    expect(screen.getByRole('button', { name: /unpair/i })).toBeInTheDocument();
  });

  it('calls unpairHueBridge and shows toast when Unpair is clicked', async () => {
    const user = userEvent.setup();
    renderConnections(BASE_CONFIG, { paired: true, bridgeIp: '192.168.1.65' });
    await user.click(screen.getByRole('button', { name: /unpair/i }));
    await waitFor(() => {
      expect(api.unpairHueBridge).toHaveBeenCalled();
      expect(addToast).toHaveBeenCalledWith('Hue Bridge unpaired', 'success');
    });
  });
});
