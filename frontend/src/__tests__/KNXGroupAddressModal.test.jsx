import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KNXGroupAddressModal } from '../components/KNXGroupAddressModal';

const ADDRESSES = [
  { id: 'switch', address: '1/1/2', name: 'Switch Status', functionType: 'switch', dpt: 'DPT1.001', room: 'Living Room', supported: true },
  { id: 'percentage', address: '2/1/6', name: 'Blind Position', functionType: 'percentage', dpt: 'DPT5.001', room: 'Living Room', supported: true },
  { id: 'scene', address: '3/5/4', name: 'Scene Control', functionType: 'scene', dpt: 'DPT17.001', room: 'Living Room', supported: true },
  { id: 'temp-dpt', address: '5/1/1', name: 'Room Temperature', functionType: 'temperature', dpt: 'DPT9.001', room: 'Living Room', supported: true },
  { id: 'temp-plain', address: '5/1/2', name: 'Outside Temperature', functionType: 'temperature', dpt: '9.001', room: 'Outside', supported: true },
  { id: 'unsupported', address: '9/9/9', name: 'Unsupported', functionType: 'switch', dpt: 'DPT99.999', room: 'Lab', supported: false },
];

function renderModal(props = {}) {
  return render(
    <KNXGroupAddressModal
      isOpen={true}
      title="Select group address"
      addresses={ADDRESSES}
      importedFileName="ets.xml"
      onClose={vi.fn()}
      onSelect={vi.fn()}
      onImport={vi.fn()}
      onClear={vi.fn()}
      {...props}
    />
  );
}

describe('KNXGroupAddressModal — filtering', () => {
  it('filters switch mode to switch/status addresses only', () => {
    renderModal({ mode: 'switch' });

    expect(screen.getByText(/filtered list: switch\/status group addresses only/i)).toBeInTheDocument();
    expect(screen.getByText(/switch status/i)).toBeInTheDocument();
    expect(screen.queryByText(/blind position/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/scene control/i)).not.toBeInTheDocument();
  });

  it('filters percentage mode to blind/percentage addresses only', () => {
    renderModal({ mode: 'percentage' });

    expect(screen.getByText(/filtered list: blind\/percentage group addresses only/i)).toBeInTheDocument();
    expect(screen.getByText(/blind position/i)).toBeInTheDocument();
    expect(screen.queryByText(/switch status/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/scene control/i)).not.toBeInTheDocument();
  });

  it('filters scene mode to scene addresses only', () => {
    renderModal({ mode: 'scene' });

    expect(screen.getByText(/filtered list: scene group addresses only/i)).toBeInTheDocument();
    expect(screen.getByText(/scene control/i)).toBeInTheDocument();
    expect(screen.queryByText(/switch status/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/blind position/i)).not.toBeInTheDocument();
  });

  it('filters DPT 9.x addresses and shows the DPT filter badge', () => {
    renderModal({ mode: 'any', dptFilter: '9.' });

    expect(screen.getByText(/filtered list: matching dpt 9\.x only/i)).toBeInTheDocument();
    expect(screen.getByText(/room temperature/i)).toBeInTheDocument();
    expect(screen.getByText(/outside temperature/i)).toBeInTheDocument();
    expect(screen.queryByText(/switch status/i)).not.toBeInTheDocument();
  });

  it('filters DPT 1.x addresses and excludes non-matching types', () => {
    renderModal({ mode: 'any', dptFilter: '1.' });

    expect(screen.getByText(/filtered list: matching dpt 1\.x only/i)).toBeInTheDocument();
    expect(screen.getByText(/switch status/i)).toBeInTheDocument();
    expect(screen.queryByText(/room temperature/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/outside temperature/i)).not.toBeInTheDocument();
  });
});
