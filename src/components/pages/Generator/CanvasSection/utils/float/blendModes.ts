import {type CompositionMode} from '../../../constants';

/**
 * Grayscale compositing/blending math for the CPU float core (W3C "Compositing
 * and Blending Level 1"). Operates on a single grayscale channel `v` in `0..1`
 * plus straight alpha `a` in `0..1`.
 *
 * The backdrop starts opaque (the background fill), and 15 of the 16 modes keep
 * it opaque; only `xor` introduces transparency. Alpha is tracked so all 16
 * match Canvas2D exactly.
 */

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

const hardLight = (b: number, s: number): number =>
  s <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s);

const softLight = (b: number, s: number): number => {
  if (s <= 0.5) return b - (1 - 2 * s) * b * (1 - b);
  const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
  return b + (2 * s - 1) * (d - b);
};

/**
 * Separable blend function B(Cb, Cs) for a single channel. For the Porter-Duff
 * compositing operators (source-over/atop/xor/lighter) there is no blend, so the
 * source color passes through — those are handled in `composite()`.
 */
const blend = (mode: CompositionMode, b: number, s: number): number => {
  switch (mode) {
    case 'multiply':
      return b * s;
    case 'screen':
      return b + s - b * s;
    case 'overlay':
      return hardLight(s, b); // overlay(b,s) === hard-light(s,b)
    case 'darken':
      return Math.min(b, s);
    case 'lighten':
      return Math.max(b, s);
    case 'color-dodge':
      return b <= 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s));
    case 'color-burn':
      return b >= 1 ? 1 : s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s);
    case 'hard-light':
      return hardLight(b, s);
    case 'soft-light':
      return softLight(b, s);
    case 'difference':
      return Math.abs(b - s);
    case 'exclusion':
      return b + s - 2 * b * s;
    case 'luminosity':
      // Non-separable HSL mode. On grayscale, the source's luminosity is its own
      // value, so the result is the source value.
      return s;
    default:
      // source-over, source-atop, xor, lighter: no blend function.
      return s;
  }
};

/** Mutable result holder, to let `compositeInto` avoid per-pixel allocation. */
export type CompositeResult = {v: number; a: number};

/**
 * Composite a source sample (`srcV`, `srcA`) over a backdrop sample (`dstV`,
 * `dstA`) under `mode`, writing the resulting grayscale value + alpha into
 * `out`. Writing into a caller-owned holder (rather than returning a new object)
 * avoids allocating millions of short-lived objects in the per-pixel hot loop.
 */
export const compositeInto = (
  out: CompositeResult,
  mode: CompositionMode,
  dstV: number,
  dstA: number,
  srcV: number,
  srcA: number,
): void => {
  // `lighter` is additive Porter-Duff (no division).
  if (mode === 'lighter') {
    out.v = clamp01(srcA * srcV + dstA * dstV);
    out.a = clamp01(srcA + dstA);
    return;
  }

  // Compositing coefficients (Fa, Fb) and the (possibly blended) source color.
  let fa: number;
  let fb: number;
  let srcColor: number;

  if (mode === 'source-atop') {
    fa = dstA;
    fb = 1 - srcA;
    srcColor = srcV;
  } else if (mode === 'xor') {
    fa = 1 - dstA;
    fb = 1 - srcA;
    srcColor = srcV;
  } else {
    // source-over and all blend modes composite with source-over (Fa=1, Fb=1-αs).
    fa = 1;
    fb = 1 - srcA;
    srcColor =
      mode === 'source-over'
        ? srcV
        : (1 - dstA) * srcV + dstA * blend(mode, dstV, srcV);
  }

  const ao = srcA * fa + dstA * fb;
  if (ao <= 0) {
    out.v = 0;
    out.a = 0;
    return;
  }
  const co = srcA * fa * srcColor + dstA * fb * dstV;
  out.v = clamp01(co / ao);
  out.a = clamp01(ao);
};

/** Allocating convenience wrapper around {@link compositeInto} (for tests/readability). */
export const composite = (
  mode: CompositionMode,
  dstV: number,
  dstA: number,
  srcV: number,
  srcA: number,
): CompositeResult => {
  const out: CompositeResult = {v: 0, a: 0};
  compositeInto(out, mode, dstV, dstA, srcV, srcA);
  return out;
};
