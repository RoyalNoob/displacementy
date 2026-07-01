/**
 * Normal map from a float height field via the **3×3 Sobel operator** — the
 * industry-standard height→normal method (Substance Designer's "Normal Sobel"
 * node, ShaderMap, the common open-source generators). Efficient (9 integer-kernel
 * taps per pixel) and noticeably smoother than a 2-tap central difference.
 *
 * Working from the float `heights` (not the 8-bit canvas) avoids double
 * quantization. Output uses the OpenGL / +Y convention (R=x, G=y, B=z; B ≈
 * 128..255). `strength` scales the surface gradient — larger = deeper relief.
 */

/** Sample with replicated (clamped) edges so border pixels stay well-defined. */
const sampleClamped = (
  heights: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number => {
  const cx = x < 0 ? 0 : x >= width ? width - 1 : x;
  const cy = y < 0 ? 0 : y >= height ? height - 1 : y;
  return heights[cy * width + cx];
};

/**
 * Core Sobel normal computation, quantized to `max` (255 for 8-bit, 65535 for
 * 16-bit). Fills the given typed array with 3 channels per pixel.
 */
const buildNormal = <T extends Uint8Array | Uint16Array>(
  out: T,
  heights: Float32Array,
  width: number,
  height: number,
  strength: number,
  max: number,
): T => {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tl = sampleClamped(heights, width, height, x - 1, y - 1);
      const tc = sampleClamped(heights, width, height, x, y - 1);
      const tr = sampleClamped(heights, width, height, x + 1, y - 1);
      const ml = sampleClamped(heights, width, height, x - 1, y);
      const mr = sampleClamped(heights, width, height, x + 1, y);
      const bl = sampleClamped(heights, width, height, x - 1, y + 1);
      const bc = sampleClamped(heights, width, height, x, y + 1);
      const br = sampleClamped(heights, width, height, x + 1, y + 1);

      // Sobel gradients of the height field.
      const gx = tr + 2 * mr + br - (tl + 2 * ml + bl);
      const gy = bl + 2 * bc + br - (tl + 2 * tc + tr);

      // Surface normal: tilt away from the gradient, then normalize.
      const nx = -gx * strength;
      const ny = -gy * strength;
      const nz = 1;
      const invLen = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);

      const i = (y * width + x) * 3;
      // Map [-1,1] → [0,max].
      out[i] = Math.round((nx * invLen * 0.5 + 0.5) * max);
      out[i + 1] = Math.round((ny * invLen * 0.5 + 0.5) * max);
      out[i + 2] = Math.round((nz * invLen * 0.5 + 0.5) * max);
    }
  }

  return out;
};

/**
 * Compute the RGB normal map (3 channels, 8-bit) for the given float heights.
 * Returns a `Uint8Array` of length `width * height * 3`.
 */
export const toNormalMapRGB8 = (
  heights: Float32Array,
  width: number,
  height: number,
  strength: number,
): Uint8Array =>
  buildNormal(
    new Uint8Array(width * height * 3),
    heights,
    width,
    height,
    strength,
    255,
  );

/**
 * Compute the RGB normal map (3 channels, 16-bit) — smoother lighting on gentle
 * surfaces than 8-bit, at 2× the bytes. Returns a `Uint16Array`.
 */
export const toNormalMapRGB16 = (
  heights: Float32Array,
  width: number,
  height: number,
  strength: number,
): Uint16Array =>
  buildNormal(
    new Uint16Array(width * height * 3),
    heights,
    width,
    height,
    strength,
    65535,
  );

/**
 * Preview adapter: the RGB normal map expanded to opaque RGBA, ready for
 * `putImageData` onto the visible canvas.
 */
export const toNormalMapRGBA = (
  heights: Float32Array,
  width: number,
  height: number,
  strength: number,
): Uint8ClampedArray => {
  const rgb = toNormalMapRGB8(heights, width, height, strength);
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let p = 0, q = 0; q < rgb.length; p += 4, q += 3) {
    rgba[p] = rgb[q];
    rgba[p + 1] = rgb[q + 1];
    rgba[p + 2] = rgb[q + 2];
    rgba[p + 3] = 255;
  }
  return rgba;
};
