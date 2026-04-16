import { describe, expect, it } from 'vitest';
import { getDropdownPosition, getSelectOption } from '../src/iconSelectUtils.js';

describe('iconSelectUtils', () => {
  it('getSelectOption returns the matching option', () => {
    const options = [
      { value: 'lightbulb', label: 'Lamp' },
      { value: 'lock', label: 'Lock' },
    ];

    expect(getSelectOption(options, 'lock')).toEqual(options[1]);
  });

  it('getSelectOption falls back to the first option', () => {
    const options = [
      { value: 'lightbulb', label: 'Lamp' },
      { value: 'lock', label: 'Lock' },
    ];

    expect(getSelectOption(options, 'missing')).toEqual(options[0]);
  });

  it('getDropdownPosition opens below the trigger when space is available', () => {
    const style = getDropdownPosition(
      { left: 24, top: 100, bottom: 152, width: 180 },
      { height: 96 },
      { innerWidth: 1280, innerHeight: 900, scrollX: 0, scrollY: 0 },
    );

    expect(style).toEqual({ left: '24px', top: '156px', width: '180px' });
  });

  it('getDropdownPosition flips above when there is not enough space below', () => {
    const style = getDropdownPosition(
      { left: 24, top: 180, bottom: 232, width: 180 },
      { height: 120 },
      { innerWidth: 1280, innerHeight: 240, scrollX: 0, scrollY: 0 },
    );

    expect(style).toEqual({ left: '24px', top: '56px', width: '180px' });
  });

  it('getDropdownPosition clamps horizontally to stay inside the viewport', () => {
    const style = getDropdownPosition(
      { left: 350, top: 80, bottom: 132, width: 180 },
      { height: 100 },
      { innerWidth: 420, innerHeight: 800, scrollX: 0, scrollY: 0 },
    );

    expect(style).toEqual({ left: '232px', top: '136px', width: '180px' });
  });
});
