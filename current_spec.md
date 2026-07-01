# Spec — CPU Float-Precision Rendering Core (for true 16-bit export)

> Status: **Phases 0 + A + B + D done and verified in-browser; Phase C in
> progress (16-bit PNG + 32-bit float EXR export done).** This is the active spec.
> (The prior parameter-locks spec was fully implemented and removed; the code is
> its record.)
>
> **Phase C progress — 32-bit float EXR export.** The 32-bit option exports a
> lossless **OpenEXR** (`.exr`) instead of the originally-planned raw `.r32`. It is
> a hand-rolled, zero-dependency **uncompressed single-channel (`Y`) FLOAT scanline**
> EXR
> ([heightmapExr.ts](src/components/pages/Generator/CanvasSection/utils/heightmapExr.ts))
> that writes the retained float height buffer **verbatim — no quantization, no
> clamping** (so out-of-`0..1` headroom survives). Chosen over `.r32` because EXR is
> self-describing (carries its own dimensions/pixel type) and read natively by
> VFX/DCC tools (Blender, Nuke, World Machine), whereas a raw dump needs the consumer
> to know width/height/endianness out of band. Verified by round-trip unit test
> (independent parser) **and** against the real `OpenEXR` Python library (channel
> `Y`, `NO_COMPRESSION`, values incl. negative/>1 matched exactly). The bit-depth
> selector is now `8 | 16 | 32`; 8-bit is unchanged (visible canvas), 16/32-bit both
> export the float height buffer independent of preview.
>
> **Phase C progress — 16-bit height export.** The Worker now transfers the
> `Float32` height buffer back alongside the 8-bit RGBA; the main thread retains
> it (invalidated on resolution change) and, when the bit-depth selector is set to
> 16-bit, encodes a **16-bit grayscale PNG** via `fast-png`
> ([heightmapPng.ts](src/components/pages/Generator/CanvasSection/utils/heightmapPng.ts))
> on download. 8-bit download is unchanged (visible canvas, respects preview);
> 16-bit always exports the height map from the float buffer (independent of
> preview/inversion). Verified end-to-end in-browser (valid 16-bit grayscale PNG:
> depth 16, color type 0) and by unit test (smooth ramp round-trips to >256
> distinct levels — real precision, no 8-bit banding).
>
> **Opaque-output fix.** `toRGBA()` now forces **alpha = 255**. A height map has
> no transparency — alpha is only a compositing intermediary, and modes like `xor`
> reduce it (a heavy-`xor` render had ~95% of pixels at alpha < 255). Previously
> the 8-bit export carried that alpha (RGBA) while the 16-bit export was opaque
> grayscale, so the two files looked different in a viewer. Emitting the value
> opaque makes the on-screen display, the 8-bit export, and the 16-bit export all
> consistent.
>
> **Phase D result (Worker + allocation fix):** the render now runs in a Web
> Worker via a synchronous `drawSync` core, off the main thread. A **2048² render
> with sprites completes in ~0.7s** (was >30s). Because the Worker uses no
> `requestAnimationFrame`, it also runs in a hidden/background tab — which
> restored end-to-end browser verification. Sprites render correctly through the
> float pipeline (verified: full-range output, 248 distinct levels). Determinism
> guard hash is **unchanged** (the sync refactor preserved the exact op sequence).
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
  float-capable container. **Shipped: OpenEXR `.exr`** —
  ([heightmapExr.ts](src/components/pages/Generator/CanvasSection/utils/heightmapExr.ts)),
  a hand-rolled zero-dependency **uncompressed single-channel (`Y`) FLOAT
  scanline** EXR. Chosen over the originally-planned raw `.r32` because EXR is
  self-describing (carries its own dimensions/pixel type) and the VFX/DCC standard
  for float imagery (Blender, Nuke, World Machine), so it needs no out-of-band
  metadata. Alternatives considered and not pursued:
  - **Raw `.r32`** (little-endian Float32 dump) — also zero-dependency, but the
    consumer must know width/height/endianness out of band. Superseded by EXR.
  - **32-bit float TIFF** — broad DCC/terrain support; not needed given EXR.

Bit depth + format currently map through a single selector: **8 | 16 | 32-bit**
(**PNG → 8 or 16-bit; EXR → 32-bit float**). A distinct format picker would only
be needed if a second 32-bit container (TIFF/raw) is ever added.

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
- **Phase C ✅ DONE** — Export off the float buffer:
  - ✅ 16-bit grayscale PNG height export (`fast-png`).
  - ✅ 32-bit float export as **uncompressed single-channel FLOAT OpenEXR**
    (`.exr`, hand-rolled, zero-dependency) — chosen over raw `.r32`/TIFF; verified
    against the real `OpenEXR` library.
  - `8 | 16 | 32` bit-depth selector wired for all three.

Later — performance stage (only after Phases 0–C are correct and verified):

- **Phase D (in progress)** — Performance, determinism-preserving:
  - ✅ Eliminated per-pixel object allocation in the composite hot loop
    (`compositeInto` writes into a reused scratch) — the single biggest compute
    win, correctness-neutral (unit tests + determinism guard unchanged).
  - ✅ `FloatRenderTarget` made Worker-safe — sprite rasterization uses
    `OffscreenCanvas` (no `document`), and `drawImage` already accepts
    `ImageBitmap`.
  - ✅ Moved the render into a **Web Worker**:
    1. `drawSync` — synchronous core (for-loop + `onProgress`, no rAF). Op
       sequence unchanged → determinism-guard hash identical.
    2. Main thread rasterizes SVG sprites to transferable `ImageBitmap`s
       (`createImageBitmap` with explicit resize — it **rejects** on SVGs without
       it) and posts `{props, width, height}` (sprites transferred) to the Worker.
    3. Worker (`renderWorker.ts`) runs `drawSync` into the float buffer (sprites
       via `OffscreenCanvas`), then transfers back the 8-bit RGBA.
    4. Main thread `putImageData`s the result; `worker.onerror` resets state.
       (Progress messages are posted but not yet shown — a progress bar is a small
       follow-up.)
  - ✅ Progress UI — the Worker's `onProgress` messages drive a determinate
    progress bar + animated "Rendering NN%" indicator in the canvas overlay
    ([Canvas.tsx](src/components/pages/Generator/CanvasSection/Canvas/Canvas.tsx)).
    Verified smooth 0→100% on a multi-second render.
  - ⬜ Tiling / further optimization only if a larger resolution needs it.
    **8192² profiled (in-browser, default settings):** render **~28 s** (CPU float
    core; the slow part, gated by the progress bar), map export **~8 s**, zip **29 MB**
    (valid 8192² height/normal/color PNGs), main-thread peak heap **~308 MB**, no
    OOM/crash. Conclusion: the pipeline is safe at max resolution; the only friction
    is the ~28 s render, which is the pre-existing determinism-bound CPU core (only
    the 8192² extreme; 2048² is sub-second). Tiling/live-forming remain optional
    perf polish, not correctness/shippability blockers.
  - ⬜ **Optional later — "live forming" preview (cheap hybrid).** In addition to
    the progress bar, paint **2–3 coarse intermediate frames** (e.g. at ~33% and
    ~66%): inside `onProgress` at those thresholds, the Worker quantizes the float
    buffer to RGBA and `postMessage`s a _copy_ (it can't transfer the live
    accumulation buffer) for the main thread to `putImageData`. Gives most of the
    "watch it form" effect at a fraction of the cost of streaming every frame.
    Must be throttled (and ideally downscaled) — a full 8192² snapshot+copy per
    frame is ~268 MB and would slow the render, so cap it at a handful of paints.

## Planned feature — Multi-map ZIP export (height + normal + color)

> Status: **v1 + v2 DONE — verified by tests, build, and live in-browser
> click-through.** Feature complete for the planned scope.
>
> **v2 shipped (full options UI).** Added a new `Input` text primitive
> ([Input.tsx](src/components/ui/Input/Input.tsx)) and a collapsible **"Export
> options"** panel in
> ([CanvasSection.tsx](src/components/pages/Generator/CanvasSection/CanvasSection.tsx)):
> a **shared Base** field (defaults to `DisplacementY_{W}x{H}`, tracks resolution;
> **no auto timestamp**) plus a **per-map prefix & suffix** — each member filename is
> `{prefix}{base}{suffix}.png`, so e.g. normal→`_N`, color→`_C`, height→`HM_` prefix.
> Zip name is `{base}.zip`. **Live per-map filename preview**; **per-map include
> checkboxes** (Export disabled + hint when none selected); a **filename-collision
> guard** (two included maps resolving to the same name disables export with a
> warning); and a **per-map normal bit-depth** radio (8/16-bit RGB). Height depth
> follows the global selector; color stays 8-bit. Names are sanitized
> (Windows-reserved chars stripped; empty stem falls back). `buildMapsZip` takes
> `include` + `normalDepth` + per-map `memberNames`; `toNormalMapRGB16` added.
> Verified live: `HM_…`/`…_N`/`…_C` naming, color-deselect omits color, normal 16-bit
> RGB (colorType 2, depth 16), empty-selection + collision guards. 68 unit tests
> green.
>
> **Live verification (in-browser).** Render → "Export maps (.zip)" produced a valid
> `PK` zip (`application/zip`, ~825 KB) named `DisplacementY_2048x2048_<ts>.zip`; the
> overlay reused the progress bar showing **"Exporting 70%"**. Unzipped members
> confirmed: `_height.png` 8-bit grayscale (→ **16-bit grayscale** when the selector
> is 16-bit), `_normal.png` + `_color.png` 8-bit RGB, all stored uncompressed (level
> 0). The **strength slider** (0.1–5) visibly changes the normal preview at relief
> pixels (0.1 → `~(115,128,254)`, 5 → `~(3,128,153)`), proving the value flows into
> the shared Sobel path; the color preview renders chromatic and toggles back to
> original cleanly.
>
> **v1 shipped.** A single **"Export maps (.zip)"** button
> ([CanvasSection.tsx](src/components/pages/Generator/CanvasSection/CanvasSection.tsx))
> derives height + normal + color from the retained float buffer, encodes them, and
> downloads one zip. The work runs **off the main thread** in
> [exportWorker.ts](src/components/pages/Generator/CanvasSection/utils/exportWorker.ts)
> (wrapping the pure
> [buildMapsZip.ts](src/components/pages/Generator/CanvasSection/utils/maps/buildMapsZip.ts)),
> driving the **existing "Rendering" overlay** relabeled "Exporting NN%". Maps:
> **height** 1-channel grayscale (depth follows the global `8|16` selector, `32`→16)
> via `fast-png`; **normal** RGB 8-bit via the **3×3 Sobel** operator
> ([normalMap.ts](src/components/pages/Generator/CanvasSection/utils/maps/normalMap.ts))
> with a **tunable strength Slider** (default 1.0, range 0.1–5); **color** RGB 8-bit
> via a palette LUT
> ([colorMap.ts](src/components/pages/Generator/CanvasSection/utils/maps/colorMap.ts)).
> Zipped with `fflate` (`zipSync`, level 0 — PNGs are already compressed). The
> normal/color **preview** was rewired to the same pure functions (deleting
> `drawNormal`/`drawColor` and fixing their `w`/`h` bug), so preview == export.
> Verified: 64 unit tests incl. a real zip round-trip (`unzipSync` + `fast-png`
> decode of all three members — names, dims, channels, height depth), Sobel/LUT math,
> `tsc` clean, and a clean production build emitting the `exportWorker` chunk with
> `fflate`/`fast-png` bundled.
>
> **v2 delivered (was "deferred to v2"):** collapsible "Export options" panel, new
> `Input` text primitive, prefix/base/postfix filename fields + live preview, per-map
> include checkboxes, per-map bit-depth (16-bit normal). See steps 5–6 and the future
> derived-maps note.
>
> **Scope decision — core-first (v1).** Ship a single **"Export maps (.zip)"**
> button that produces height + normal + color in one zip with the default filename
> scheme and sensible per-map defaults, plus **one strength slider** for the normal
> map. Keep the UI **simple but functional**: **no** collapsible options panel, **no**
> `Input` text primitive, **no** per-map include checkboxes or per-map bit-depth
> controls in v1 (steps 5–6's full UI is deferred to a follow-up). Height depth
> follows the **existing global `8|16` selector** (`32`→16 in the zip).

A single **"Export maps (.zip)"** action that produces height + normal + color
PNGs in one zip, with a customizable filename, without disturbing the current
on-screen preview.

**Design:**

1. **Single source = the retained float buffer** (✅ v1; confirmed against the code). No
   separate "retain last RGBA" ref is needed: the float height buffer is already
   retained in `lastHeightsRef` (invalidated on resolution change, independent of
   preview), and **all three maps derive from it** — height→grayscale,
   normal→gradient of the float heights, color→palette LUT on the float heights.
   Deriving from the float buffer is both simpler and strictly higher fidelity than
   re-reading the 8-bit canvas (no double-quantization anywhere). Color additionally
   reads the gradient canvas (see step 7).
2. **Pure map transforms** (✅ v1) — refactored the in-place `drawNormal`/`drawColor`
   preview functions into pure `toNormalMapRGB8(heights,w,h,strength)` /
   `toColorMapRGB8(heights,palette,w,h)` (+ `…RGBA` preview adapters) reused by both
   preview and export (export runs offscreen). These take the **float `heights`**
   buffer, not `heightRGBA`. The old `drawNormal`/`drawColor` were **deleted** and
   their `w`/`h` indexing bug fixed (the Sobel path indexes correctly), so preview ==
   export.

   **Normal-map algorithm — Sobel operator (chosen; ✅ v1).** Replace the current 2-tap
   neighbor-difference with the industry-standard **3×3 Sobel** gradient (what
   Substance 3D Designer's "Normal Sobel" node, ShaderMap, and the common
   open-source height→normal generators use). It is efficient (9 taps/pixel, integer
   kernel) and noticeably smoother/less noisy than central differences. Per pixel,
   over the float heights `h(x,y)` (edges clamped/replicated):
   - `gx = (h[x+1,y-1] + 2·h[x+1,y] + h[x+1,y+1]) − (h[x-1,y-1] + 2·h[x-1,y] + h[x-1,y+1])`
   - `gy = (h[x-1,y+1] + 2·h[x,y+1] + h[x+1,y+1]) − (h[x-1,y-1] + 2·h[x,y-1] + h[x+1,y-1])`
   - `n = normalize(−gx·strength, −gy·strength, 1)`
   - encode: `R = (n.x·0.5+0.5)·255`, `G = (n.y·0.5+0.5)·255`, `B = (n.z·0.5+0.5)·255`
     (OpenGL/+Y convention; `B` ≈ 128..255). 16-bit option scales by 65535 instead.
   - **`strength`** is a tunable scalar (default **1.0**, range ~**0.1..5**) exposed
     via a single Slider (the existing `Slider` primitive) — larger = deeper relief.
     `toNormalMap` takes it as a parameter so preview and export stay identical.
3. **Per-map depth & channels (important — they are NOT all the same).** Bit
   depth/channels follow each map's _purpose_, not a single global setting. (✅ done:
   height 8/16 grayscale, normal 8/16-bit RGB, color 8-bit RGB.)
   - **Height** = precision-critical data → **1-channel grayscale**. Depth
     **follows the existing global bit-depth selector** (`8 | 16`), for consistency
     with the single-file Download button; the selector's **`32` (EXR) maps to 16**
     in the zip (EXR-in-zip is out of scope for v1). Also fixes a redundancy in the
     current 8-bit path: `canvas.toDataURL` writes a 4-channel **RGBA** PNG (value
     duplicated across R=G=B + a now-constant alpha). Encode the 8-bit height as
     **1-channel grayscale** via `fast-png` (`depth 8, channels 1`) from the float
     buffer, matching the 16-bit path — smaller and semantically correct.
   - **Normal** = shading → **RGB** (drop the unused alpha). Two loss points to fix:
     (a) `drawNormal` currently computes from the **8-bit canvas** — it must compute
     from the **float height buffer** so the gradient isn't double-quantized;
     (b) 8-bit/channel bands lighting on smooth surfaces, so offer **16-bit RGB**.
     (Highest fidelity is actually letting the 3D tool derive normals from the
     16-bit height; the exported normal is a convenience.)
   - **Color** = visualization → **RGB 8-bit** is fine (palette LUT is inherently
     ≤256 bands); just drop the unused alpha.
4. **Encode + zip** (✅ v1) — each map → bytes (all three via `fast-png`: grayscale
   1-channel for height, RGB 3-channel for normal/color) → zip with **`fflate`**
   (`zipSync`, **level 0** since PNGs are already deflate-compressed) → download.
5. **Filename scheme** (✅ v2) — a **shared Base** plus **per-map prefix & suffix**:
   member = `{map.prefix}{base}{map.suffix}.png`; zip = `{base}.zip`. This lets each
   map carry a naming convention (normal `_N`, color `_C`, height `HM_` prefix, etc.).
   `base` defaults to `DisplacementY_{W}x{H}` and tracks resolution; **no auto
   timestamp** (chosen model — user controls the whole name). Illegal
   (Windows-reserved) chars stripped; empty stem falls back. A **collision guard**
   blocks export if two included maps resolve to the same filename.
6. **UI** (✅ v1 + v2). v1: **"Export maps (.zip)"** button in the output row
   (disabled when pristine/rendering) + a **normal-map strength Slider**. v2: a
   collapsible **"Export options"** panel with the new `Input` text primitive
   (prefix / base / postfix), a **live filename preview**, **per-map include
   checkboxes** (Export disabled + hint when none selected), and a **per-map normal
   bit-depth** radio (8/16-bit).
7. **Async + progress (offloaded; ✅ v1).** The map derivation + PNG encoding + zip
   run **off the main thread in a Worker** (always, not just at 8192²), so a
   268 MB × 3-map encode never stalls the UI. **Reuses the existing "Rendering"
   overlay + progress bar** ([Canvas.tsx](src/components/pages/Generator/CanvasSection/Canvas/Canvas.tsx)):
   the export Worker posts `onProgress` (coarse per-stage) driving the same
   determinate bar, with the label switched to "Exporting NN%" via an `isExporting`
   flag. Implementation detail: a **copy** of the float `heights` is transferred to the
   Worker (`heights.slice()` then transfer the copy's buffer) so the retained
   `lastHeightsRef` stays intact for future exports / 16-bit download; the palette
   (gradient row 0, read on the main thread) is transferred too; the Worker returns
   the finished `.zip` bytes as a transferable. **Gradient availability confirmed:**
   the gradient canvas is drawn on mount (256×256, palette in row 0) in `Gradient.tsx`,
   independent of whether the color preview was ever opened — so color export always
   has a populated palette to read (its row-0 RGBA is posted to the Worker). No extra
   guard needed.

**Decisions (v1 resolved):** zip lib **`fflate`** (chosen, `zipSync` level 0); maps
**all three, always included** in v1 (deselect checkboxes deferred to v2); filename
prefs not persisted. Per-map analysis: height 1-channel grayscale (depth **follows
the global `8|16` selector**, `32`→16 in the zip), normal RGB (8-bit in v1; 16-bit
option deferred), color RGB 8-bit; unused alpha dropped on normal/color.

**Future extension — more derived maps (planned, not v1).** The zip is expected to
grow beyond height/normal/color into additional PBR-style maps derived from the same
float height buffer. **Design for this now** so adding a map is a small, local change:
model each map as a **`{ key, label, derive(heights,w,h,params) → typed pixels,
channels, depth, include }`** entry in a single registry that both the export Worker
and (later) the options-panel UI iterate over — so a new map = one registry entry +
its `derive` fn, no plumbing changes. Likely future maps and their derivation:

- **Ambient occlusion (AO)** — cavity/occlusion from the height field (e.g. compare
  each texel against a neighborhood average, or a lightweight horizon/cone
  approximation). RGB or grayscale, 8-bit.
- **Roughness / specular / metalness** — typically **remaps of height (or its slope)
  through a curve/gradient LUT**, so they reuse the same LUT machinery as the color
  map; grayscale 8-bit.
- **Curvature / displacement variants** — also pure functions of the height field.

All are pure functions of the retained float buffer (± the gradient LUT), so they fit
the same offloaded-Worker + progress-bar pipeline as v1's three maps; each just adds
its own `onProgress` slice. The **strength/param** pattern used for the normal map
generalizes to per-map params in the eventual options panel.

## Testing

1. **Determinism:** fixed seeds → hashed quantized output stable across runs.
2. **Blend correctness:** each of the 16 modes vs. Canvas2D `globalCompositeOperation`
   at 8-bit tolerance.
3. **16-bit fidelity:** a smooth synthetic input yields >256 distinct levels in the
   exported file; PNG validity + declared bit depth verified.
4. **Memory:** 8192² render stays within budget. ✅ Verified in-browser: full
   render + 3-map zip export completes with no OOM/crash (main-thread peak heap
   ~308 MB; large buffers live off-main-heap in the Workers).

## Decisions

Resolved:

- **A. Buffer layout — single-channel grayscale `Float32Array`.** The output is a
  height map; color is applied only at the color-preview LUT stage, so it need not
  live in the accumulation buffer. (~256 MB at 8192²; RGBA float ~1 GiB rejected.)
- **B. Export encoders.** 16-bit grayscale PNG via **`fast-png`** (supports 16-bit
  single-channel). 32-bit float ships as **OpenEXR**, and here we **did hand-roll**
  the encoder rather than add a package: the needed variant (uncompressed,
  single-channel FLOAT scanline) is small and self-contained, keeping deps lean
  (`fast-png` remains the only encoder dependency). Correctness is covered by an
  independent-parser round-trip test **plus** validation against the real `OpenEXR`
  library. (Superseded the earlier "raw `.r32`, existing packages only" leaning.)
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
