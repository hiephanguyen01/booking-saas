import { describe, expect, it } from 'vitest';
import { isWithinNoShowWindow, NO_SHOW_WINDOW_HOURS } from './no-show-window';

const end = new Date('2026-07-08T10:00:00Z');
const hoursAfter = (h: number): Date => new Date(end.getTime() + h * 3_600_000);

describe('no-show window (§8.5)', () => {
  it('rejects marking before the slot has ended', () => {
    expect(isWithinNoShowWindow(end, hoursAfter(-1))).toBe(false);
  });

  it('rejects marking exactly at the slot end (nothing has been missed yet)', () => {
    expect(isWithinNoShowWindow(end, end)).toBe(false);
  });

  it('allows marking just after the slot ends', () => {
    expect(isWithinNoShowWindow(end, hoursAfter(0.5))).toBe(true);
  });

  it('allows marking anywhere inside the 48h window', () => {
    expect(isWithinNoShowWindow(end, hoursAfter(24))).toBe(true);
    expect(isWithinNoShowWindow(end, hoursAfter(NO_SHOW_WINDOW_HOURS))).toBe(true);
  });

  it('rejects marking after the 48h window has elapsed', () => {
    expect(isWithinNoShowWindow(end, hoursAfter(NO_SHOW_WINDOW_HOURS + 0.01))).toBe(false);
    expect(isWithinNoShowWindow(end, hoursAfter(72))).toBe(false);
  });
});
