import {describe, expect, it} from 'vitest';
import {
  buildLUT,
  applyLUT,
  applyLUTRGBA,
  colorAt,
  encodeStops,
  decodeStops,
  type Stop,
} from './lut';

const blackToWhite: Stop[] = [
  {position: 0, color: {r: 0, g: 0, b: 0}},
  {position: 1, color: {r: 255, g: 255, b: 255}},
];

describe('buildLUT', () => {
  it('interpolates linearly between two stops', () => {
    const lut = buildLUT(blackToWhite);
    expect(lut.length).toBe(256 * 3);
    expect([lut[0], lut[1], lut[2]]).toEqual([0, 0, 0]);
    expect([lut[765], lut[766], lut[767]]).toEqual([255, 255, 255]);
    // Midpoint ≈ 127/128.
    const mid = 128 * 3;
    expect(lut[mid]).toBeGreaterThanOrEqual(127);
    expect(lut[mid]).toBeLessThanOrEqual(129);
  });

  it('clamps outside the first/last stop positions', () => {
    const stops: Stop[] = [
      {position: 0.4, color: {r: 10, g: 20, b: 30}},
      {position: 0.6, color: {r: 200, g: 210, b: 220}},
    ];
    const lut = buildLUT(stops);
    // t=0 → first stop color; t=1 → last stop color.
    expect([lut[0], lut[1], lut[2]]).toEqual([10, 20, 30]);
    expect([lut[765], lut[766], lut[767]]).toEqual([200, 210, 220]);
  });

  it('respects arbitrary (unsorted) stop positions', () => {
    const stops: Stop[] = [
      {position: 1, color: {r: 255, g: 0, b: 0}},
      {position: 0, color: {r: 0, g: 0, b: 0}},
      {position: 0.25, color: {r: 0, g: 255, b: 0}}, // off-center stop
    ];
    // At exactly 0.25 the color is the green stop.
    expect(colorAt(stops, 0.25)).toEqual({r: 0, g: 255, b: 0});
    // Between 0.25 and 1.0, halfway (0.625) is half green half red.
    const c = colorAt(stops, 0.625);
    expect(c.r).toBeGreaterThan(120);
    expect(c.r).toBeLessThan(135);
    expect(c.g).toBeGreaterThan(120);
    expect(c.g).toBeLessThan(135);
  });

  it('builds a 1-channel scalar LUT from the r channel', () => {
    const lut = buildLUT(blackToWhite, 1);
    expect(lut.length).toBe(256);
    expect(lut[0]).toBe(0);
    expect(lut[255]).toBe(255);
  });
});

describe('applyLUT', () => {
  it('indexes heights into the LUT (matching the old color-map lookup)', () => {
    const lut = buildLUT(blackToWhite);
    const rgb = applyLUT(new Float32Array([0, 0.5, 1]), lut, 3);
    expect([rgb[0], rgb[1], rgb[2]]).toEqual([0, 0, 0]);
    expect([rgb[6], rgb[7], rgb[8]]).toEqual([255, 255, 255]);
    expect(rgb[3]).toBeGreaterThanOrEqual(127);
    expect(rgb[3]).toBeLessThanOrEqual(129);
  });

  it('clamps out-of-range heights', () => {
    const lut = buildLUT(blackToWhite);
    const rgb = applyLUT(new Float32Array([-1, 2]), lut, 3);
    expect(rgb[0]).toBe(0);
    expect(rgb[3]).toBe(255);
  });

  it('supports 1-channel (scalar) LUTs', () => {
    const lut = buildLUT(blackToWhite, 1);
    const gray = applyLUT(new Float32Array([0, 1]), lut, 1);
    expect([...gray]).toEqual([0, 255]);
  });
});

describe('applyLUTRGBA', () => {
  it('expands to opaque RGBA', () => {
    const lut = buildLUT(blackToWhite);
    const rgba = applyLUTRGBA(new Float32Array([1]), lut);
    expect([...rgba]).toEqual([255, 255, 255, 255]);
  });
});

describe('stop (de)serialization', () => {
  it('round-trips stops through the query encoding', () => {
    const stops: Stop[] = [
      {position: 0, color: {r: 0, g: 255, b: 255}},
      {position: 0.5, color: {r: 149, g: 0, b: 255}},
      {position: 1, color: {r: 255, g: 229, b: 0}},
    ];
    const decoded = decodeStops(encodeStops(stops));
    expect(decoded).toBeDefined();
    expect(decoded!.length).toBe(3);
    for (let i = 0; i < 3; i++) {
      // Position quantizes to 1/255 steps in the encoding.
      expect(decoded![i].position).toBeCloseTo(stops[i].position, 2);
      expect(decoded![i].color).toEqual(stops[i].color);
    }
  });

  it('rejects malformed input (fall back to defaults)', () => {
    expect(decodeStops(null)).toBeUndefined();
    expect(decodeStops('')).toBeUndefined();
    expect(decodeStops('00ffffff')).toBeUndefined(); // only one stop
    expect(decodeStops('00ffffff,zzzzzzzz')).toBeUndefined(); // bad hex
    expect(decodeStops('00ffffff,00ff')).toBeUndefined(); // bad length
  });
});
