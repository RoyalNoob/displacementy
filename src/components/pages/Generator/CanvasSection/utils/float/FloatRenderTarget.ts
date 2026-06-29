import {type CompositionMode} from '../../../constants';
import {clamp01, compositeInto, type CompositeResult} from './blendModes';

/**
 * CPU float-precision rendering surface for the generator.
 *
 * It deliberately implements the small subset of `CanvasRenderingContext2D` that
 * `draw()` uses (`canvas`, `fillStyle`, `globalCompositeOperation`, `clearRect`,
 * `fillRect`, plus `drawImage`/`translate`/`rotate` for sprites). This lets
 * `draw()` stay byte-for-byte unchanged — so the Phase 0 determinism guard keeps
 * passing with the identical hash — while accumulation happens in 32-bit float
 * instead of 8-bit canvas.
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
  // Offscreen 2D canvas used only for sprites: it rasterizes the image and
  // applies the scale/rotation transform exactly as the old renderer did; we then
  // blend its pixels into the float buffer. An `OffscreenCanvas` (not a DOM
  // canvas) so the whole core can run inside a Web Worker. Created lazily so the
  // sprite-free paths (and Node tests) never touch it.
  #spriteCtx: OffscreenCanvasRenderingContext2D | undefined;
  // Reused across every per-pixel composite so the hot loops allocate nothing.
  readonly #scratch: CompositeResult = {v: 0, a: 0};

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
        compositeInto(
          this.#scratch,
          mode,
          this.#value[i],
          this.#alpha[i],
          sv,
          sa,
        );
        this.#value[i] = this.#scratch.v;
        this.#alpha[i] = this.#scratch.a;
      }
    }
  }

  // Sprites: the transform calls are forwarded to the offscreen sprite canvas so
  // its 2D context mirrors the transform `draw()` sets up (translate/rotate around
  // the canvas centre, then the inverse afterwards).
  translate(x: number, y: number): void {
    this.#ensureSpriteCtx().translate(x, y);
  }

  rotate(angle: number): void {
    this.#ensureSpriteCtx().rotate(angle);
  }

  /**
   * Rasterize a sprite (with the current transform) on the offscreen canvas, then
   * blend its pixels into the float buffer under the current composite mode. Only
   * the transformed bounding box is read back.
   */
  drawImage(
    img: CanvasImageSource,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void {
    const ctx = this.#ensureSpriteCtx();

    // Bounding box of the destination rect under the current transform.
    const m = ctx.getTransform();
    const corners = [
      [dx, dy],
      [dx + dw, dy],
      [dx, dy + dh],
      [dx + dw, dy + dh],
    ];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [px, py] of corners) {
      const tx = m.a * px + m.c * py + m.e;
      const ty = m.b * px + m.d * py + m.f;
      minX = Math.min(minX, tx);
      minY = Math.min(minY, ty);
      maxX = Math.max(maxX, tx);
      maxY = Math.max(maxY, ty);
    }
    const x0 = Math.max(0, Math.floor(minX));
    const y0 = Math.max(0, Math.floor(minY));
    const x1 = Math.min(this.#w, Math.ceil(maxX));
    const y1 = Math.min(this.#h, Math.ceil(maxY));
    if (x1 <= x0 || y1 <= y0) return;

    const bw = x1 - x0;
    const bh = y1 - y0;

    // Clear only the bounding box (device space), preserving the active transform.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(x0, y0, bw, bh);
    ctx.restore();

    ctx.drawImage(img, dx, dy, dw, dh);

    const region = ctx.getImageData(x0, y0, bw, bh).data;
    const mode = this.#mode;
    for (let ry = 0; ry < bh; ry++) {
      for (let rx = 0; rx < bw; rx++) {
        const ri = (ry * bw + rx) * 4;
        const srcA = region[ri + 3] / 255;
        if (srcA <= 0) continue; // sprites are mostly transparent
        const srcV = region[ri] / 255; // grayscale sprites → r channel
        const i = (y0 + ry) * this.#w + (x0 + rx);
        compositeInto(
          this.#scratch,
          mode,
          this.#value[i],
          this.#alpha[i],
          srcV,
          srcA,
        );
        this.#value[i] = this.#scratch.v;
        this.#alpha[i] = this.#scratch.a;
      }
    }
  }

  #ensureSpriteCtx(): OffscreenCanvasRenderingContext2D {
    if (!this.#spriteCtx) {
      const canvas = new OffscreenCanvas(this.#w, this.#h);
      const ctx = canvas.getContext('2d', {willReadFrequently: true});
      if (!ctx) throw new Error('Failed to create 2D context for sprites');
      this.#spriteCtx = ctx;
    }
    return this.#spriteCtx;
  }

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
