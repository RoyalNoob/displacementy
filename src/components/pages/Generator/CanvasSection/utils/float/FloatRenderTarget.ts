import {type CompositionMode} from '../../../constants';
import {clamp01, composite} from './blendModes';

/**
 * CPU float-precision rendering surface for the generator.
 *
 * It deliberately implements the small subset of `CanvasRenderingContext2D` that
 * `draw()` uses (`canvas`, `fillStyle`, `globalCompositeOperation`, `clearRect`,
 * `fillRect`, and no-op `drawImage`/`translate`/`rotate` until sprites land in
 * Phase B). This lets `draw()` stay byte-for-byte unchanged — so the Phase 0
 * determinism guard keeps passing with the identical hash — while accumulation
 * happens in 32-bit float instead of 8-bit canvas.
 *
 * Grayscale height is stored in `#value` (`0..1`) with straight alpha in
 * `#alpha` (needed for faithful `xor`/`source-atop` compositing).
 */
export class FloatRenderTarget {
  readonly canvas: {width: number; height: number};
  readonly #w: number;
  readonly #h: number;
  readonly #value: Float32Array;
  readonly #alpha: Float32Array;
  #mode: CompositionMode = 'source-over';
  #fillV = 0;
  #fillA = 1;

  constructor(width: number, height: number) {
    this.#w = width;
    this.#h = height;
    this.canvas = {width, height};
    this.#value = new Float32Array(width * height);
    this.#alpha = new Float32Array(width * height);
  }

  get globalCompositeOperation(): string {
    return this.#mode;
  }

  set globalCompositeOperation(v: string) {
    this.#mode = v as CompositionMode;
  }

  set fillStyle(v: string) {
    const {value, alpha} = parseGrayscale(v);
    this.#fillV = value;
    this.#fillA = alpha;
  }

  clearRect(x: number, y: number, w: number, h: number): void {
    const [x0, y0, x1, y1] = this.#clip(x, y, w, h);
    for (let py = y0; py < y1; py++) {
      const row = py * this.#w;
      for (let px = x0; px < x1; px++) {
        this.#value[row + px] = 0;
        this.#alpha[row + px] = 0;
      }
    }
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    const [x0, y0, x1, y1] = this.#clip(x, y, w, h);
    const sv = this.#fillV;
    const sa = this.#fillA;
    const mode = this.#mode;
    for (let py = y0; py < y1; py++) {
      const row = py * this.#w;
      for (let px = x0; px < x1; px++) {
        const i = row + px;
        const {v, a} = composite(mode, this.#value[i], this.#alpha[i], sv, sa);
        this.#value[i] = v;
        this.#alpha[i] = a;
      }
    }
  }

  // Sprites (Phase B): no-ops for now so enabling sprites does not crash — they
  // simply do not render until Phase B implements image sampling.
  drawImage(): void {}
  translate(): void {}
  rotate(): void {}

  /** The float height buffer (`0..1`), for high-bit-depth export in Phase C. */
  get heights(): Float32Array {
    return this.#value;
  }

  /** Quantize to straight 8-bit RGBA and paint into the visible 2D canvas. */
  blitTo(ctx2d: CanvasRenderingContext2D): void {
    const img = ctx2d.createImageData(this.#w, this.#h);
    const d = img.data;
    for (let i = 0; i < this.#value.length; i++) {
      const g = Math.round(this.#value[i] * 255);
      const o = i * 4;
      d[o] = g;
      d[o + 1] = g;
      d[o + 2] = g;
      d[o + 3] = Math.round(this.#alpha[i] * 255);
    }
    ctx2d.putImageData(img, 0, 0);
  }

  #clip(
    x: number,
    y: number,
    w: number,
    h: number,
  ): [number, number, number, number] {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.#w, Math.round(x + w));
    const y1 = Math.min(this.#h, Math.round(y + h));
    return [x0, y0, Math.max(x0, x1), Math.max(y0, y1)];
  }
}

/**
 * Parse the grayscale color strings produced by `xxx`/`xxxa`
 * (`rgb(r,g,b)` or `rgb(r,g,b,a)`, where `a` is already in `0..1`). `r=g=b`, so
 * the first channel is the grayscale value. Alpha is clamped to `0..1` exactly as
 * Canvas2D would.
 */
const parseGrayscale = (style: string): {value: number; alpha: number} => {
  const open = style.indexOf('(');
  const close = style.indexOf(')');
  const parts = style.slice(open + 1, close).split(',');
  const value = clamp01(Number(parts[0]) / 255);
  const alpha = parts.length >= 4 ? clamp01(Number(parts[3])) : 1;
  return {value, alpha};
};
