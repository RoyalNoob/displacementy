import {describe, expect, it} from 'vitest';
import {toNormalMapRGB8, toNormalMapRGB16, toNormalMapRGBA} from './normalMap';

describe('toNormalMapRGB8', () => {
  it('maps a flat height field to a straight-up normal (128,128,255)', () => {
    const w = 4;
    const h = 4;
    const heights = new Float32Array(w * h).fill(0.5);
    const rgb = toNormalMapRGB8(heights, w, h, 1);
    for (let i = 0; i < rgb.length; i += 3) {
      expect(rgb[i]).toBe(128); // x
      expect(rgb[i + 1]).toBe(128); // y
      expect(rgb[i + 2]).toBe(255); // z (points up)
    }
  });

  it('tilts the normal against an increasing-x ramp (R < 128)', () => {
    const w = 4;
    const h = 3;
    const heights = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) heights[y * w + x] = x / (w - 1);

    const rgb = toNormalMapRGB8(heights, w, h, 1);
    // Interior pixel (x=1,y=1): positive x-gradient → nx negative → R below mid.
    const i = (1 * w + 1) * 3;
    expect(rgb[i]).toBeLessThan(128);
    expect(rgb[i + 2]).toBeGreaterThan(128); // z stays positive
  });

  it('stronger strength pushes the normal further from vertical', () => {
    const w = 4;
    const h = 3;
    const heights = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) heights[y * w + x] = x / (w - 1);

    const weak = toNormalMapRGB8(heights, w, h, 0.5);
    const strong = toNormalMapRGB8(heights, w, h, 3);
    const i = (1 * w + 1) * 3;
    // Larger strength → R further below 128.
    expect(strong[i]).toBeLessThan(weak[i]);
  });
});

describe('toNormalMapRGB16', () => {
  it('maps a flat field to straight-up at 16-bit scale (32768,32768,65535)', () => {
    const w = 3;
    const h = 3;
    const rgb = toNormalMapRGB16(new Float32Array(w * h).fill(0.5), w, h, 1);
    expect(rgb).toBeInstanceOf(Uint16Array);
    for (let i = 0; i < rgb.length; i += 3) {
      expect(rgb[i]).toBe(Math.round(0.5 * 65535)); // 32768
      expect(rgb[i + 1]).toBe(Math.round(0.5 * 65535));
      expect(rgb[i + 2]).toBe(65535); // z points up, full scale
    }
  });
});

describe('toNormalMapRGBA', () => {
  it('expands the RGB normal to opaque RGBA', () => {
    const w = 2;
    const h = 2;
    const heights = new Float32Array(w * h).fill(0.5);
    const rgba = toNormalMapRGBA(heights, w, h, 1);
    expect(rgba.length).toBe(w * h * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      expect(rgba[i]).toBe(128);
      expect(rgba[i + 1]).toBe(128);
      expect(rgba[i + 2]).toBe(255);
      expect(rgba[i + 3]).toBe(255); // opaque
    }
  });
});
