import {describe, expect, it} from 'vitest';
import {toAO8, toAO8Auto, toAORGBA} from './ao';

describe('toAO8', () => {
  it('leaves a flat field fully open (white)', () => {
    const w = 16;
    const h = 16;
    const ao = toAO8(new Float32Array(w * h).fill(0.5), w, h, 8, 1);
    for (let i = 0; i < ao.length; i++) expect(ao[i]).toBe(255);
  });

  it('darkens the floor of a pit relative to the surrounding plateau', () => {
    const w = 32;
    const h = 32;
    // High plateau with a deep square pit in the middle.
    const heights = new Float32Array(w * h).fill(1);
    for (let y = 12; y < 20; y++)
      for (let x = 12; x < 20; x++) heights[y * w + x] = 0;

    const ao = toAO8(heights, w, h, 12, 1);
    const pitFloor = ao[16 * w + 16]; // center of the pit
    const plateau = ao[2 * w + 2]; // far corner, open

    expect(plateau).toBe(255); // open surface, unoccluded
    expect(pitFloor).toBeLessThan(255); // walls occlude the pit floor
  });

  it('strength 0 disables occlusion (all white)', () => {
    const w = 24;
    const h = 24;
    const heights = new Float32Array(w * h).fill(1);
    for (let y = 8; y < 16; y++)
      for (let x = 8; x < 16; x++) heights[y * w + x] = 0;
    const ao = toAO8(heights, w, h, 10, 0);
    for (let i = 0; i < ao.length; i++) expect(ao[i]).toBe(255);
  });
});

describe('toAO8Auto', () => {
  it('equals the full-res AO below the downsample cap', () => {
    const w = 32;
    const h = 32;
    const heights = new Float32Array(w * h).fill(1);
    for (let y = 12; y < 20; y++)
      for (let x = 12; x < 20; x++) heights[y * w + x] = 0;
    const full = toAO8(heights, w, h, 12, 1);
    const auto = toAO8Auto(heights, w, h, 12, 1);
    expect([...auto]).toEqual([...full]); // factor 1 → identical
  });

  it('returns a full-resolution map and still occludes when downsampled', () => {
    // Force downsampling: > AO_COMPUTE_CAP (2048).
    const w = 4096;
    const h = 4096;
    const heights = new Float32Array(w * h).fill(1);
    // A large pit in the middle so downsampling still sees it.
    for (let y = 1500; y < 2600; y++)
      for (let x = 1500; x < 2600; x++) heights[y * w + x] = 0;
    const ao = toAO8Auto(heights, w, h, 64, 1);
    expect(ao.length).toBe(w * h); // upscaled back to full res
    // Just inside the pit's top wall (y≈1510): the plateau above occludes it.
    // (The pit's center is intentionally NOT occluded — a wide basin sees open sky.)
    expect(ao[1510 * w + 2048]).toBeLessThan(255);
    expect(ao[0]).toBe(255); // open corner
  });
});

describe('toAORGBA', () => {
  it('expands AO to opaque grayscale RGBA', () => {
    const w = 4;
    const h = 4;
    const rgba = toAORGBA(new Float32Array(w * h).fill(0.5), w, h, 4, 1);
    expect(rgba.length).toBe(w * h * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      expect(rgba[i]).toBe(rgba[i + 1]);
      expect(rgba[i + 1]).toBe(rgba[i + 2]); // gray
      expect(rgba[i + 3]).toBe(255); // opaque
    }
  });
});
