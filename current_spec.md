# Spec — CPU Float-Precision Rendering Core (for true 16-bit export)

> Status: **Phases 0 + A + B implemented; Phase B visual check pending; Phases
> C–D pending.** This is the active spec. (The prior parameter-locks spec was
> fully implemented and removed; the code is its record.)
>
> **Phase B note — sprites.** `FloatRenderTarget` implements
> `translate`/`rotate`/`drawImage` by forwarding the transform to a reusable
> offscreen 2D canvas (which rasterizes the SVG + applies scale/rotation/AA
> exactly as the old renderer), then blends the sprite's bbox pixels into the
> float buffer under the current mode. `draw.ts` stays unchanged. Sprite source
> is read from the `r` channel (grayscale assumption). Unit-tested for blend
> math + rasterization; type-checks, builds, determinism guard green. **Full
> in-browser sprite screenshot is still pending** — the preview tab runs
> `hidden`, where `requestAnimationFrame` is paused (0 ticks), so the rAF-driven
> render loop cannot advance there. Verify in a real (visible) browser tab.
>
> **⚠ Performance finding (elevates Phase D).** A 2048² render in the CPU-float
> core takes **>30s** of synchronous compute (per-pixel JS compositing + per-sprite
> `getImageData`/blend). This is far slower than the old native-canvas renderer and
> is a real usability problem at the default resolution. Phase D (Web Worker +
> dirty-rect/typed-array optimization, possibly chunked yielding) is now more
> important than originally framed. The correctness work (A/B) stands; performance
> must follow before this is shippable at 2048²+.
>
> **Phase A note — buffer is value + alpha, not value-only.** Faithful
> compositing (notably `xor`, which introduces transparency) requires tracking
> straight alpha alongside the grayscale value. So the buffer is two
> `Float32Array`s (value + alpha) ≈ **512 MB at 8192²** — heavier than the
> value-only ~256 MB, still under the rejected RGBA ~1 GiB. Refines Decision A.
>
> **Phase A implementation choice:** `draw.ts` is left **unchanged**; the float
> core is a `FloatRenderTarget`
> ([FloatRenderTarget.ts](src/components/pages/Generator/CanvasSection/utils/float/FloatRenderTarget.ts))
> that implements the `CanvasRenderingContext2D` subset `draw()` uses and parses
> the `xxx`/`xxxa` color strings. This keeps the determinism guard green with the
> **identical hash**. Blend math lives in
> [blendModes.ts](src/components/pages/Generator/CanvasSection/utils/float/blendModes.ts).
> Sprites are no-ops until Phase B (enabling them renders nothing, no crash).
> Integer rasterization means no sub-pixel edge anti-aliasing (≤1px edge
> difference vs. canvas; irrelevant for heightmaps).

## Goal

Replace the 8-bit Canvas2D accumulation target with a **CPU floating-point
framebuffer** so the generated heightmap carries true >8-bit precision. This
enables **banding-free 16-bit PNG export** for production 3D displacement — and,
because the buffer is already 32-bit float, **optional 32-bit float export off the
same data** — while **preserving exact cross-machine determinism** (the guarantee
Copy-URL and the parameter locks depend on).

## Why this is necessary (the core finding)

A `CanvasRenderingContext2D` is **8-bit per channel, unconditionally** —
`getImageData` returns a `Uint8ClampedArray`. Every one of the hundreds–thousands
of composited passes in `draw()` is rounded to 8 bits, so quantization is
_cumulative_. By the time generation ends there are at most **256 distinct
levels**; exporting that to 16-bit only rescales 8-bit data into a 16-bit
container (~99.6% of code points unused) and preserves every terrace edge. **The
precision must be captured during accumulation, not at export** — which is why
the accumulation buffer cannot stay Canvas2D.

## Why CPU float, not GPU float

- **Determinism.** JS IEEE-754 math is bit-identical across machines. GPU
  floating-point results are **not** guaranteed identical across vendors/drivers,
  which would make a shared URL render subtly different pixels on a different
  machine — breaking the "same URL → identical image everywhere" contract behind
  Copy-URL and locks.
- The generation loop is already **sequential and CPU-PRNG-driven**
  ([draw.ts](src/components/pages/Generator/CanvasSection/utils/draw.ts)). Keeping
  it on the CPU with a float buffer preserves the exact PRNG consumption order, so
  output stays reproducible.

## Architecture

### Accumulation buffer

- Replace the Canvas2D target with a **single-channel `Float32Array`** of length
  `W × H` holding the grayscale height in `0..1`.
  - **Rationale for single channel:** all draws are grayscale (`r=g=b` via
    `xxx`/`xxxa`), and an RGBA `Float32Array` at 8192² is **~1 GiB**
    (`8192² × 4ch × 4B`). Single channel is **~256 MB** — still heavy but
    feasible. Color only matters at the _color-preview_ stage (a LUT applied on
    read), so it does not need to live in the accumulation buffer.
  - **Decided:** single-channel grayscale — the output is a height map; color is
    only ever applied at the color-preview LUT stage. (See Decisions.)
- Alpha (`0..255` today) normalizes to `0..1` for blending; the buffer itself
  stays opaque (background is opaque), so we accumulate a single value per pixel.

### Draw operations

Each op writes into the float buffer via **software rasterization** instead of
`ctx.fillRect` / `ctx.drawImage`, then applies the op's blend formula in float:

- `drawBackground`, `drawRect`, `drawGrid`, `drawCols`, `drawRows`, `drawLines`
  are all **axis-aligned rectangle fills** — trivial to rasterize over a dirty
  rectangle (iterate only the covered pixels, not the whole buffer).
- Seamless tiling reuses the existing offset-wrapping logic (`drawSeamless`).
- Sprite rotation is only **multiples of 90°** → index remap, no interpolation.

### Blend modes (the bulk of the work)

Canvas's `globalCompositeOperation` conflates **two** categories that must both be
reimplemented per the W3C _Compositing and Blending Level 1_ spec:

- **Porter-Duff compositing operators:** `source-over`, `source-atop`, `xor`,
  `lighter`.
- **Separable blend modes** (composited with source-over): `multiply`, `screen`,
  `overlay`, `darken`, `lighten`, `color-dodge`, `color-burn`, `hard-light`,
  `soft-light`, `difference`, `exclusion`.
- **Non-separable (HSL) blend mode:** `luminosity`.

That is the full set of 16 currently in `ALL_COMPOSITION_MODES`. On a
single-channel buffer the separable formulas reduce to scalar math; `luminosity`
on grayscale is effectively a value replace (document the simplification and
verify it against canvas). This is the **main correctness risk** — port the exact
W3C formulas and unit-test each against Canvas2D output (at 8-bit tolerance).

### Display & export (8 / 16 / 32-bit — one buffer)

Because the accumulation buffer is already 32-bit float, **bit depth and file
format are purely an export-time choice** layered on the same data — nothing in
the core changes to support a wider format.

- **Display:** quantize float → 8-bit, `putImageData` to the visible canvas
  (screen is 8-bit regardless).
- **8-bit PNG:** quantize `0..1 → round(v × 255)`; as today.
- **16-bit PNG:** quantize `0..1 → round(v × 65535)`, encode a **16-bit grayscale
  PNG** (the natural heightmap format). Browsers can't encode 16-bit via canvas, so
  this uses an existing encoder package (see Decisions).
- **32-bit float:** write the `Float32` values **directly — no quantization, no
  loss**. PNG cannot hold float (16-bit integer max), so this needs a
  float-capable container:
  - **Raw `.r32`** (little-endian Float32 dump) — zero-dependency; ingested by
    Unity / Unreal / World Machine. Cheapest; recommended first.
  - **OpenEXR `.exr`** — VFX/Blender standard for float imagery; needs an EXR
    encoder.
  - **32-bit float TIFF** — broad DCC/terrain support; medium encoder cost.

Bit depth + format collapse into a single selector: **PNG → 8 or 16-bit;
EXR / TIFF / raw → 32-bit float.**

**Expectation-setting:** 16-bit already removes visible banding and is the
practical heightmap standard. 32-bit float mainly buys HDR range, out-of-`0..1`
headroom, and extreme-amplification future-proofing — not a visible jump over a
clean 16-bit map (the generator works in normalized `0..1` grayscale). It is cheap
to offer _because_ the buffer is already float, so treat it as a pro / future-proof
option rather than a quality necessity.

## Determinism

- PRNG stays Mulberry32, same consumption order → reproducible on any machine.
- **Baseline change (important):** switching from implicit 8-bit canvas rounding
  to explicit float math **changes the exact output bytes vs. today's renderer**.
  Determinism is preserved _within_ the new renderer, but **previously shared URLs
  will render differently**. Recommendation: accept a new rendering baseline (the
  app is pre-1.0, v0.1.0, and this is a quality improvement); optionally stamp a
  renderer-version in the URL going forward. (Decided — see Decisions C: accept the
  new baseline, no shim.)
- **Determinism guard (prerequisite — DONE, Phase 0):** implemented in
  [draw.determinism.test.ts](src/components/pages/Generator/CanvasSection/utils/draw.determinism.test.ts).
  It records the ordered **operation trace** `draw()` issues for a fixed seed
  (against a stub context, not pixels) and hashes it, asserting: same seed → same
  trace, different seed → different trace, and a baseline-hash tripwire. The op
  trace is pure PRNG output, so it must stay invariant when the rasterizer is
  swapped for the float core — making it the correct guard. Every phase must keep
  it green.

## Performance & memory

**Correctness first — performance work is explicitly deferred.** Through the
correctness phases the core runs on the **main thread**, reusing the existing
`requestAnimationFrame` sub-iteration batching (`animateWithSubIterations`) so the
UI stays usable during a render. Accept that very large (8192²) renders may be
slow/janky in this period; that is fine while we are proving correctness.

- Per-pixel float blending in JS is slower than `fillRect`. The one mitigation that
  does **not** affect correctness — iterating only the **dirty rectangle** per op
  and using typed arrays — is fine to apply early.
- Moving the core into a **Web Worker** (owning the `Float32Array`, posting back a
  transferable `ImageBitmap`) is the main responsiveness lever, but is **deferred to
  the later performance stage** — see Phasing.
- **Memory ceiling:** single-channel Float32 at 8192² ≈ 256 MB; RGBA float ≈ 1 GiB
  (rejected). Validate 8192² stays within budget; consider tiling if not.

## Sprites

- SVG sprites rasterize to a temporary canvas/`ImageBitmap` at the needed size,
  read once, then blend per-pixel into the float buffer (90° rotation = index
  remap; tiling reused). Sprite sources are inherently 8-bit — the float benefit is
  in **not re-quantizing across overlapping blends**, not in the sprite pixels
  themselves.

## Phasing

**Principle: prove correctness before touching performance.** Phases 0–C are all
correctness/feature work, each gated by the determinism guard. Performance work
comes only after the float core is proven correct.

Correctness phases (in order):

- **Phase 0 ✅ DONE** — Determinism guard test (op-trace hash per seed).
- **Phase A ✅ DONE** — Float buffer (value + alpha) + background +
  rect/grid/cols/rows/lines + the 16 blend modes + 8-bit display path. (No
  sprites.) Runs on the main thread with the existing rAF batching.
- **Phase B ✅ DONE (visual check pending)** — Sprites in the float pipeline via
  offscreen-canvas rasterization + float blend.
- **Phase C** — Export: 8 / 16-bit PNG + 32-bit float (raw first, EXR/TIFF later) +
  a bit-depth/format selector in the UI.

Later — performance stage (only after Phases 0–C are correct and verified):

- **Phase D (in progress)** — Performance, determinism-preserving:
  - ✅ Eliminated per-pixel object allocation in the composite hot loop
    (`compositeInto` writes into a reused scratch) — the single biggest compute
    win, correctness-neutral (unit tests + determinism guard unchanged).
  - ✅ `FloatRenderTarget` made Worker-safe — sprite rasterization uses
    `OffscreenCanvas` (no `document`), and `drawImage` already accepts
    `ImageBitmap`.
  - ⬜ Move the render into a **Web Worker** (the big step). Plan:
    1. Refactor the draw loop into a **synchronous** core (plain for-loop +
       `onProgress`, no `requestAnimationFrame`) so it runs in a Worker. The op
       sequence is unchanged → the determinism-guard hash must stay identical.
       (Do not ship this on the main thread alone — a synchronous loop there would
       freeze the UI; it must land together with the Worker.)
    2. Main thread: rasterize the SVG sprites to transferable `ImageBitmap`s and
       post `{props, spriteBitmaps, width, height}` to the Worker.
    3. Worker: run the sync core into the float buffer, post chunked progress, and
       transfer back the 8-bit RGBA (and later the float buffer for export).
    4. Main thread: `putImageData` the result to the visible canvas; drive a
       progress bar from the chunked messages.
  - ⬜ Tiling only if the memory/throughput budget still requires it.
  - **Bonus insight:** a Worker render does **not** use `requestAnimationFrame`,
    so it is not subject to the hidden-tab rAF pause that blocked in-browser
    verification — the Worker route should also make end-to-end verification work
    again.

## Testing

1. **Determinism:** fixed seeds → hashed quantized output stable across runs.
2. **Blend correctness:** each of the 16 modes vs. Canvas2D `globalCompositeOperation`
   at 8-bit tolerance.
3. **16-bit fidelity:** a smooth synthetic input yields >256 distinct levels in the
   exported file; PNG validity + declared bit depth verified.
4. **Memory:** 8192² render stays within budget.

## Decisions

Resolved:

- **A. Buffer layout — single-channel grayscale `Float32Array`.** The output is a
  height map; color is applied only at the color-preview LUT stage, so it need not
  live in the accumulation buffer. (~256 MB at 8192²; RGBA float ~1 GiB rejected.)
- **B. Export encoders — use existing packages, not hand-rolled.** 16-bit grayscale
  PNG via an existing library (e.g. `fast-png`, which supports 16-bit single-channel;
  `UPNG.js` as an alternative). 32-bit float raw `.r32` needs no package (direct byte
  dump); EXR / float TIFF, if pursued, also via existing packages. Final library pick
  confirmed at implementation.
- **C. Rendering baseline — accept the new baseline; no compatibility shim.** There
  are no users yet, so previously shared URLs are not a concern. The float math
  changes exact output and that is fine. (Optionally stamp a renderer version in the
  URL later to guard _future_ baseline changes.)
- **D. Web Worker — deferred to the later performance stage (Phase D).** Correctness
  first.

All decisions resolved; ready to implement starting at Phase 0.

## Out of scope

- GPU/WebGL generation (rejected for determinism reasons above).
- Parallelizing the generation loop (would break PRNG order / determinism).
- Group-level locks, lock-all, reroll-as-preset (from the prior locks spec).
