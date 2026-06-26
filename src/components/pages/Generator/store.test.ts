import {beforeEach, describe, expect, it} from 'vitest';
import {useStore, LOCKABLE_KEYS} from './store';
import {setSeed} from '@/utils/random';

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
