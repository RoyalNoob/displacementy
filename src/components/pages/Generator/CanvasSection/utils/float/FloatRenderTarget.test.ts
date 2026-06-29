import {describe, expect, it} from 'vitest';
import {FloatRenderTarget} from './FloatRenderTarget';

const near = (a: number, b: number, eps = 1e-6): boolean =>
  Math.abs(a - b) <= eps;

describe('FloatRenderTarget', () => {
  it('parses opaque grayscale fills and rasterizes a rectangle', () => {
    const t = new FloatRenderTarget(4, 4);
    t.fillStyle = 'rgb(128,128,128)';
    t.fillRect(0, 0, 4, 4);
    const heights = t.heights;
    expect(heights.every((v) => near(v, 128 / 255))).toBe(true);
  });

  it('clips fillRect to the buffer bounds', () => {
    const t = new FloatRenderTarget(4, 4);
    t.fillStyle = 'rgb(255,255,255)';
    t.fillRect(2, 2, 10, 10); // overflows; should clip
    // Pixel (0,0) untouched, pixel (3,3) filled.
    expect(t.heights[0]).toBe(0);
    expect(near(t.heights[3 * 4 + 3], 1)).toBe(true);
  });

  it('composites a translucent fill (alpha = a/100 from xxxa) over the backdrop', () => {
    const t = new FloatRenderTarget(2, 2);
    t.fillStyle = 'rgb(0,0,0)'; // opaque black backdrop
    t.fillRect(0, 0, 2, 2);
    t.fillStyle = 'rgb(255,255,255,0.5)'; // white @ 50%
    t.fillRect(0, 0, 2, 2);
    expect(near(t.heights[0], 0.5)).toBe(true);
  });

  it('applies the current blend mode (multiply)', () => {
    const t = new FloatRenderTarget(1, 1);
    t.fillStyle = 'rgb(128,128,128)';
    t.fillRect(0, 0, 1, 1); // backdrop ~0.5
    t.globalCompositeOperation = 'multiply';
    t.fillStyle = 'rgb(128,128,128)';
    t.fillRect(0, 0, 1, 1); // 0.5 * 0.5 ≈ 0.25
    expect(near(t.heights[0], (128 / 255) * (128 / 255))).toBe(true);
  });

  it('clearRect resets to transparent black', () => {
    const t = new FloatRenderTarget(2, 2);
    t.fillStyle = 'rgb(200,200,200)';
    t.fillRect(0, 0, 2, 2);
    t.clearRect(0, 0, 2, 2);
    expect(t.heights.every((v) => v === 0)).toBe(true);
  });
});
