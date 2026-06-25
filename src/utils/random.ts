import {type ColorRGB} from '../types';

// Global seed for deterministic generation. Advances on every randomInteger call.
export let seed = Math.floor(Math.random() * 0xffffffff);

export const setSeed = (value: number): void => {
  seed = value >>> 0;
};

// Mulberry32 — fast 32-bit seeded PRNG, returns a float in [0, 1)
const nextFloat = (): number => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0;
  return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
};

/**
 * Results with random boolean value
 */
export const randomBoolean = (): boolean => nextFloat() >= 0.5;

export const randomColorRGB = (): ColorRGB => ({
  r: randomInteger(0, 255),
  g: randomInteger(0, 255),
  b: randomInteger(0, 255),
});

/**
 * Results with random integer value in [min..max] range (inclusive).
 * Advances the global seed on each call.
 */
export const randomInteger = (min: number, max: number): number => {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(nextFloat() * (max - min + 1) + min);
};

/**
 * Results with random item from array. If array is empty, returns `undefined`.
 */
export const randomItem = <T>(items: T[]): T | undefined =>
  items.length > 0 ? items[randomInteger(0, items.length - 1)] : undefined;
