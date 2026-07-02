import {describe, expect, it} from 'vitest';
import {MAP_REGISTRY, getMap} from './registry';
import {buildLUT} from './lut';

describe('MAP_REGISTRY', () => {
  it('has the expected maps with unique keys', () => {
    const keys = MAP_REGISTRY.map((m) => m.key);
    expect(keys).toEqual(['height', 'normal', 'color', 'ao']);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('each descriptor is internally consistent', () => {
    for (const map of MAP_REGISTRY) {
      expect([1, 3]).toContain(map.channels);
      expect(map.defaultSuffix.length).toBeGreaterThan(0);
      expect(typeof map.derive).toBe('function');
    }
  });

  it('derive produces the right length and typed array per depth', () => {
    const w = 4;
    const h = 4;
    const ctx = {
      heights: new Float32Array(w * h).fill(0.5),
      width: w,
      height: h,
      lut: buildLUT([
        {position: 0, color: {r: 0, g: 0, b: 0}},
        {position: 1, color: {r: 255, g: 255, b: 255}},
      ]),
      params: {strength: 1, radius: 8},
      seamless: false,
    };
    for (const map of MAP_REGISTRY) {
      const px8 = map.derive(ctx, 8);
      expect(px8).toBeInstanceOf(Uint8Array);
      expect(px8.length).toBe(w * h * map.channels);
    }
    // Normal supports 16-bit → Uint16Array.
    const normal16 = getMap('normal').derive(ctx, 16);
    expect(normal16).toBeInstanceOf(Uint16Array);
  });

  it('getMap throws on an unknown key', () => {
    expect(() => getMap('nope')).toThrow();
  });
});
