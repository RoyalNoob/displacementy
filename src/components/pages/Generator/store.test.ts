import {beforeEach, describe, expect, it} from 'vitest';
import {useStore, LOCKABLE_KEYS} from './store';
import {setSeed} from '@/utils/random';
import {decodeStops} from './CanvasSection/utils/maps/lut';

// The store is a singleton; clear all locks before each test so they are
// order-independent.
beforeEach(() => {
  const {setLock} = useStore.getState();
  for (const key of LOCKABLE_KEYS) setLock(key, false);
});

describe('locks', () => {
  it('toggleLock flips a single key without touching others', () => {
    const {toggleLock} = useStore.getState();
    toggleLock('iterations');
    expect(useStore.getState().locks.iterations).toBe(true);
    expect(useStore.getState().locks.initialSeed).toBe(false);
    toggleLock('iterations');
    expect(useStore.getState().locks.iterations).toBe(false);
  });
});

describe('randomize respects locks', () => {
  it('keeps locked values and changes unlocked ones', () => {
    setSeed(1);
    const store = useStore.getState();
    store.setLock('iterations', true);
    store.setIterations(42);
    store.setInitialSeed(-1); // sentinel outside the valid range

    store.randomize();

    const next = useStore.getState();
    expect(next.iterations).toBe(42); // locked → unchanged
    expect(next.initialSeed).not.toBe(-1); // unlocked → randomized
  });
});

describe('section randomize respects locks', () => {
  it('randomizeRect skips the locked rectScale', () => {
    setSeed(2);
    const store = useStore.getState();
    store.setLock('rectScale', true);
    store.setRectScale(7);
    store.setRectBrightness([-1, -1]); // sentinel

    store.randomizeRect();

    const next = useStore.getState();
    expect(next.rectScale).toBe(7); // locked → unchanged
    expect(next.rectBrightness).not.toEqual([-1, -1]); // unlocked → randomized
  });
});

describe('lock serialization', () => {
  it('emits locked keys in the `locks` query param', () => {
    const store = useStore.getState();
    store.setLock('initialSeed', true);
    store.setLock('rectScale', true);

    const query = useStore.getState().getSettingsQuery();
    const locks = new URLSearchParams(query).get('locks');
    const lockedKeys = locks ? locks.split(',') : [];

    expect(lockedKeys).toContain('initialSeed');
    expect(lockedKeys).toContain('rectScale');
    expect(lockedKeys).toHaveLength(2);
  });

  it('emits an empty `locks` param when nothing is locked', () => {
    const query = useStore.getState().getSettingsQuery();
    expect(new URLSearchParams(query).get('locks')).toBe('');
  });
});

describe('LUT stop serialization', () => {
  it('emits customized stops as a lut_<mapkey> param that round-trips', () => {
    const stops = [
      {position: 0, color: {r: 10, g: 20, b: 30}},
      {position: 0.5, color: {r: 40, g: 50, b: 60}},
      {position: 1, color: {r: 70, g: 80, b: 90}},
    ];
    useStore.getState().setLutStops('color', stops);

    const query = useStore.getState().getSettingsQuery();
    const raw = new URLSearchParams(query).get('lut_color');
    expect(raw).toBeTruthy();

    const decoded = decodeStops(raw);
    expect(decoded).toBeDefined();
    expect(decoded!.length).toBe(3);
    for (let i = 0; i < 3; i++) {
      expect(decoded![i].position).toBeCloseTo(stops[i].position, 2);
      expect(decoded![i].color).toEqual(stops[i].color);
    }
  });

  it('randomize-all leaves customized stops untouched (not lockable)', () => {
    setSeed(3);
    const stops = [
      {position: 0.25, color: {r: 1, g: 2, b: 3}},
      {position: 0.75, color: {r: 4, g: 5, b: 6}},
    ];
    useStore.getState().setLutStops('color', stops);
    useStore.getState().randomize();
    expect(useStore.getState().lutStops.color).toEqual(stops);
  });
});
