import { describe, expect, it } from 'vitest';
import { parseControls } from '../../src/lib/controls.ts';

describe('controls parser', () => {
  it('draws arrow keys and WASD with their action', () => {
    const r = parseControls('Use arrow keys or WASD to drive. Press space to jump.');
    expect(r[0]).toMatchObject({ device: 'keys', keys: ['↑', '←', '↓', '→'], action: 'Move' });
    expect(r.find((x) => x.keys[0] === 'W')).toBeTruthy();
    expect(r.find((x) => x.keys[0] === 'Space')).toMatchObject({ action: 'Jump' });
  });
  it('finds single letter keys and mouse/touch', () => {
    const r = parseControls('Press Z to punch, X to kick. Click to start. On mobile tap the buttons.');
    expect(r.map((x) => x.keys.join() || x.gesture)).toEqual(expect.arrayContaining(['Z', 'X', 'Click', 'Tap']));
    expect(r.find((x) => x.keys[0] === 'Z')?.action).toBe('Punch');
  });
  it('invents nothing when the text names no control', () => {
    expect(parseControls('Have fun and beat your friends!')).toEqual([]);
    expect(parseControls('')).toEqual([]);
  });
});

describe('parseControls — neighbouring mentions', () => {
  it('does not borrow the verb of the previous key ("Arrows drive … Spacebar respawn")', () => {
    const rows = parseControls('Arrows drive balance Spacebar respawn at last checkpoint');
    expect(rows.find((r) => r.keys[0] === '↑')?.action).toBe('Move');
    expect(rows.find((r) => r.keys[0] === 'Space')?.action).toBe('Restart');
  });
});
