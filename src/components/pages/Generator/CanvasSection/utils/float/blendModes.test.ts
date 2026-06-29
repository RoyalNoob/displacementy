import {describe, expect, it} from 'vitest';
import {composite, clamp01} from './blendModes';

const near = (a: number, b: number, eps = 1e-9): boolean =>
  Math.abs(a - b) <= eps;

describe('clamp01', () => {
  it('clamps to [0, 1]', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(0.3)).toBe(0.3);
  });
});

describe('composite — opaque backdrop, opaque source', () => {
  // With both opaque, the result is the blend function value and stays opaque.
  const cases: Array<
    [Parameters<typeof composite>[0], number, number, number]
  > = [
    ['source-over', 0.5, 0.8, 0.8], // normal → source
    ['multiply', 0.5, 0.8, 0.4],
    ['screen', 0.5, 0.8, 0.9],
    ['darken', 0.5, 0.8, 0.5],
    ['lighten', 0.5, 0.8, 0.8],
    ['difference', 0.5, 0.8, 0.3],
    ['exclusion', 0.5, 0.8, 0.5 + 0.8 - 2 * 0.5 * 0.8],
  ];

  it.each(cases)('%s(%f, %f) → %f', (mode, dst, src, expected) => {
    const {v, a} = composite(mode, dst, 1, src, 1);
    expect(near(v, expected)).toBe(true);
    expect(a).toBe(1); // opaque backdrop stays opaque
  });
});

describe('composite — alpha', () => {
  it('source-over with 50% source blends halfway toward source', () => {
    // src white @ 0.5 over black opaque → 0.5
    const {v, a} = composite('source-over', 0, 1, 1, 0.5);
    expect(near(v, 0.5)).toBe(true);
    expect(near(a, 1)).toBe(true);
  });

  it('fully transparent source leaves the backdrop unchanged', () => {
    const {v, a} = composite('multiply', 0.42, 1, 1, 0);
    expect(near(v, 0.42)).toBe(true);
    expect(near(a, 1)).toBe(true);
  });
});

describe('composite — Porter-Duff alpha operators', () => {
  it('xor of two opaque samples yields full transparency', () => {
    const {v, a} = composite('xor', 0.7, 1, 0.3, 1);
    expect(a).toBe(0);
    expect(v).toBe(0);
  });

  it('source-atop over an opaque backdrop equals source-over', () => {
    const over = composite('source-over', 0.2, 1, 0.9, 0.5);
    const atop = composite('source-atop', 0.2, 1, 0.9, 0.5);
    expect(near(atop.v, over.v)).toBe(true);
    expect(near(atop.a, over.a)).toBe(true);
  });

  it('lighter adds source and backdrop, clamped', () => {
    expect(composite('lighter', 0.6, 1, 0.7, 1).v).toBe(1); // clamped
    const {v} = composite('lighter', 0.2, 1, 0.3, 1);
    expect(near(v, 0.5)).toBe(true);
  });
});
