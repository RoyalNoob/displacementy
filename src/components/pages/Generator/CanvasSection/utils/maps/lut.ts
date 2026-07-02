import {type ColorRGB} from '@/types';

/**
 * Reusable LUT (lookup-table) machinery for height→value remap maps.
 *
 * A LUT map (color today; roughness/specular/metalness later) is defined by a
 * list of **stops** — a color at a free position in `0..1` — from which a
 * fixed-size table is built by sRGB-linear interpolation. Deriving a map is then
 * a per-pixel table lookup indexed by height. Everything here is pure and
 * Worker-safe (no canvas/DOM); it replaces the old canvas
 * `createLinearGradient` + row-readback palette.
 *
 * In `scalar` editor mode stops are grayscale (`r = g = b`), and a 1-channel
 * LUT reads the `r` channel.
 */
export type Stop = {
  /** Position along the gradient in `0..1`. */
  position: number;
  color: ColorRGB;
};

export const LUT_SIZE = 256;

/** Stops sorted by position (stable; does not mutate the input). */
export const sortStops = (stops: Stop[]): Stop[] =>
  [...stops].sort((a, b) => a.position - b.position);

/** The sRGB-linear interpolated color at `t` (`0..1`) for the given stops. */
export const colorAt = (stops: Stop[], t: number): ColorRGB => {
  const sorted = sortStops(stops);
  if (sorted.length === 0) return {r: 0, g: 0, b: 0};
  if (t <= sorted[0].position) return sorted[0].color;
  const last = sorted[sorted.length - 1];
  if (t >= last.position) return last.color;

  // Find the surrounding pair and lerp between them.
  for (let i = 1; i < sorted.length; i++) {
    const b = sorted[i];
    if (t > b.position) continue;
    const a = sorted[i - 1];
    const span = b.position - a.position;
    const f = span === 0 ? 0 : (t - a.position) / span;
    return {
      r: Math.round(a.color.r + (b.color.r - a.color.r) * f),
      g: Math.round(a.color.g + (b.color.g - a.color.g) * f),
      b: Math.round(a.color.b + (b.color.b - a.color.b) * f),
    };
  }
  return last.color;
};

/**
 * Build a LUT from stops: `channels 3` → packed RGB (`size*3` bytes), `channels
 * 1` → grayscale from the `r` channel (`size` bytes; scalar stops are gray).
 * Ends clamp to the first/last stop.
 */
export const buildLUT = (
  stops: Stop[],
  channels: 1 | 3 = 3,
  size = LUT_SIZE,
): Uint8Array => {
  const out = new Uint8Array(size * channels);
  for (let i = 0; i < size; i++) {
    const c = colorAt(stops, size === 1 ? 0 : i / (size - 1));
    if (channels === 3) {
      out[i * 3] = c.r;
      out[i * 3 + 1] = c.g;
      out[i * 3 + 2] = c.b;
    } else {
      out[i] = c.r;
    }
  }
  return out;
};

/**
 * Map each height (`0..1`, clamped) through the LUT:
 * `index = round(clamp(v) * (entries − 1))`. Returns packed pixels with the
 * LUT's channel count.
 */
export const applyLUT = (
  heights: Float32Array,
  lut: Uint8Array,
  channels: 1 | 3,
): Uint8Array => {
  const entries = lut.length / channels;
  const out = new Uint8Array(heights.length * channels);
  for (let i = 0; i < heights.length; i++) {
    const v = heights[i];
    const clamped = v < 0 ? 0 : v > 1 ? 1 : v;
    const p = Math.round(clamped * (entries - 1)) * channels;
    const o = i * channels;
    for (let c = 0; c < channels; c++) out[o + c] = lut[p + c];
  }
  return out;
};

/**
 * Preview adapter: apply a 3-channel LUT and expand to opaque RGBA, ready for
 * `putImageData` onto the visible canvas.
 */
export const applyLUTRGBA = (
  heights: Float32Array,
  lut: Uint8Array,
): Uint8ClampedArray => {
  const rgb = applyLUT(heights, lut, 3);
  const rgba = new Uint8ClampedArray(heights.length * 4);
  for (let p = 0, q = 0; q < rgb.length; p += 4, q += 3) {
    rgba[p] = rgb[q];
    rgba[p + 1] = rgb[q + 1];
    rgba[p + 2] = rgb[q + 2];
    rgba[p + 3] = 255;
  }
  return rgba;
};

// ---------------------------------------------------------------------------
// URL (de)serialization — one token per stop: `PPRRGGBB` (2-hex position byte
// + 6-hex color), tokens comma-joined. Compact, order-independent (positions
// are explicit), and validated on parse.
// ---------------------------------------------------------------------------

const hex2 = (n: number): string => Math.round(n).toString(16).padStart(2, '0');

/** Serialize stops for a `lut_<mapkey>` query param. */
export const encodeStops = (stops: Stop[]): string =>
  sortStops(stops)
    .map(
      ({position, color}) =>
        `${hex2(position * 255)}${hex2(color.r)}${hex2(color.g)}${hex2(color.b)}`,
    )
    .join(',');

/**
 * Parse a `lut_<mapkey>` query param. Returns `undefined` (→ fall back to the
 * map's default stops) when absent or malformed; requires ≥2 valid stops.
 */
export const decodeStops = (raw: string | null): Stop[] | undefined => {
  if (!raw) return undefined;
  const tokens = raw.split(',');
  if (tokens.length < 2) return undefined;
  const stops: Stop[] = [];
  for (const token of tokens) {
    if (!/^[0-9a-fA-F]{8}$/.test(token)) return undefined;
    stops.push({
      position: parseInt(token.slice(0, 2), 16) / 255,
      color: {
        r: parseInt(token.slice(2, 4), 16),
        g: parseInt(token.slice(4, 6), 16),
        b: parseInt(token.slice(6, 8), 16),
      },
    });
  }
  return stops;
};
