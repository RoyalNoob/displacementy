# Spec — Rendering core, export & derived maps

> Status: everything under **Shipped** is done, tested, and verified in-browser
> (91 unit tests green at last count). No active work in flight. (The prior
> parameter-locks spec was fully implemented and removed; the code is its
> record.)

## Shipped — CPU float-precision rendering core (Phases 0–D)

**What/why.** The 8-bit Canvas2D accumulation target was replaced with a **CPU
`Float32` framebuffer** so the heightmap carries true >8-bit precision (Canvas2D
rounds every composite pass to 8 bits — cumulative quantization capped output at
256 levels, so 16-bit export was pointless without this). CPU rather than GPU
float because **JS IEEE-754 math is bit-identical across machines** while GPU
results are not — preserving the "same URL → identical image everywhere" contract
behind Copy-URL and locks. Baseline change vs. the old renderer was accepted
(pre-1.0, no users; Decision C — no compatibility shim).

**Architecture facts (still binding):**

- `draw.ts` is unchanged; the float core is
  [FloatRenderTarget.ts](src/components/pages/Generator/CanvasSection/utils/float/FloatRenderTarget.ts),
  implementing the `CanvasRenderingContext2D` subset `draw()` uses. Blend math
  (all 16 modes per the W3C compositing spec, reduced to scalar on grayscale) is
  in [blendModes.ts](src/components/pages/Generator/CanvasSection/utils/float/blendModes.ts),
  unit-tested against Canvas2D at 8-bit tolerance.
- Buffer is **value + alpha** (two `Float32Array`s, ~512 MB at 8192²) — faithful
  `xor`/`source-atop` need tracked alpha. `toRGBA()` forces **alpha = 255** on
  output (a height map has no transparency; keeps display and all exports
  consistent).
- Integer rasterization (no sub-pixel edge AA; ≤1px vs. canvas, irrelevant for
  heightmaps). Sprites rasterize via offscreen canvas then blend per-pixel in
  float; rotation is 90°-multiples only.
- **Render runs in a Web Worker** ([renderWorker.ts](src/components/pages/Generator/CanvasSection/utils/renderWorker.ts))
  via a synchronous `drawSync` core; main thread pre-rasterizes SVG sprites to
  transferable `ImageBitmap`s. Worker `onProgress` drives a determinate progress
  bar in the canvas overlay ([Canvas.tsx](src/components/pages/Generator/CanvasSection/Canvas/Canvas.tsx)).
- **Determinism guard** ([draw.determinism.test.ts](src/components/pages/Generator/CanvasSection/utils/draw.determinism.test.ts)):
  hashes the ordered op trace `draw()` issues per seed (pure PRNG output, no
  pixels) with a baseline tripwire. **Every change must keep it green** — it has
  stayed hash-identical through all refactors. PRNG is Mulberry32, consumption
  order preserved.

**Export (single-file Download, bit-depth selector `8 | 16 | 32`):**

- **8-bit PNG** — the visible canvas as-is (respects preview/inversion).
- **16-bit grayscale PNG** — from the retained float buffer via `fast-png`
  ([heightmapPng.ts](src/components/pages/Generator/CanvasSection/utils/heightmapPng.ts));
  independent of preview. Verified >256 distinct levels (no banding).
- **32-bit float OpenEXR** — hand-rolled, zero-dependency **uncompressed
  single-channel (`Y`) FLOAT scanline** EXR
  ([heightmapExr.ts](src/components/pages/Generator/CanvasSection/utils/heightmapExr.ts));
  values verbatim (no quantization/clamping, out-of-`0..1` headroom survives).
  Chosen over raw `.r32`/TIFF (self-describing; native in Blender/Nuke/World
  Machine). Validated against the real `OpenEXR` Python library.

**Performance profile (measured in-browser, default settings):** 2048² render
with sprites **~0.7 s**; 8192² render **~28 s** (determinism-bound CPU core,
gated by the progress bar), 4-map export **~9 s**, main-thread peak heap
~308 MB, no OOM. Optional future polish (not blockers): tiling, "live forming"
intermediate frames during render.

## Shipped — Multi-map ZIP export (v1 + v2)

One **"Export maps (.zip)"** button exports the selected derived maps in a single
zip, without disturbing the on-screen preview.

- **Single source:** all maps derive from the retained float buffer
  (`lastHeightsRef` — invalidated on resolution change; also records the render's
  **seamless flag**). Preview and export share the same pure per-map functions
  (the old in-place `drawNormal`/`drawColor` were deleted; their `w`/`h` bug fixed).
- **Offloaded:** derivation + `fast-png` encode + `fflate` `zipSync` (level 0 —
  PNGs are already deflate-compressed) run in
  [exportWorker.ts](src/components/pages/Generator/CanvasSection/utils/exportWorker.ts)
  wrapping the pure [buildMapsZip.ts](src/components/pages/Generator/CanvasSection/utils/maps/buildMapsZip.ts);
  a *copy* of the heights is transferred (retained buffer stays intact). Reuses
  the render progress overlay, relabeled "Exporting NN%".
- **Filenames:** member = `{map.prefix}{base}{map.suffix}.png`, zip =
  `{base}.zip`. Shared Base defaults to `DisplacementY_{W}x{H}` and tracks
  resolution; **no auto timestamp** (user owns the name). Windows-reserved chars
  stripped; empty stems fall back; a **collision guard** disables export when two
  included maps resolve to the same name.
- **Export configuration UI** (originally a collapsible panel; now the
  **export dialog** — see the UI-declutter section): per-map include
  checkboxes, per-map prefix/suffix with live filename preview
  (via the [Input](src/components/ui/Input/Input.tsx) text primitive), per-map
  bit-depth where applicable. Per-map param sliders live on the map cards.
- **Per-map depth/channels:** height = 1-ch grayscale, depth follows the global
  selector (`32`→16 in the zip); normal = RGB with its own 8/16 radio; color =
  RGB 8-bit (LUT is inherently ≤256 bands). Unused alpha dropped everywhere.

## Shipped — Derived-maps registry + ambient occlusion

- **Registry** ([registry.ts](src/components/pages/Generator/CanvasSection/utils/maps/registry.ts),
  [types.ts](src/components/pages/Generator/CanvasSection/utils/maps/types.ts)):
  each map is a pure, Worker-safe **`MapDescriptor { key, label, channels,
  depthMode, defaultInclude, defaultSuffix, params[], derive(ctx, depth),
  previewRGBA?(ctx) }`**. `buildMapsZip`, the export Worker, the preview toggles,
  and all per-map UI iterate the registry — **adding a map is one entry + its
  derivation, no plumbing changes** (proven behavior-preserving: default export
  stayed byte-identical through the refactor).
- **Maps:** height (grayscale 8/16) · normal (**3×3 Sobel**, OpenGL/+Y encoding,
  strength 0.1–5, 8/16-bit RGB —
  [normalMap.ts](src/components/pages/Generator/CanvasSection/utils/maps/normalMap.ts)) ·
  color (stop-based LUT over float heights —
  [lut.ts](src/components/pages/Generator/CanvasSection/utils/maps/lut.ts)) ·
  **AO** (**HBAO**, 8 directions × 8 steps, tunable radius + strength, grayscale,
  off by default — [ao.ts](src/components/pages/Generator/CanvasSection/utils/maps/ao.ts)).
- **AO at scale:** above 2048², `toAO8Auto` box-downsamples the heights, runs
  HBAO there (radius scaled), bilinearly upscales — 8192² 4-map export dropped
  **~57 s → ~9 s**, visually ~identical (AO is low-frequency).
- **Seamless tiling:** derived maps must tile when the render does. A shared
  sampler ([sampleHeights.ts](src/components/pages/Generator/CanvasSection/utils/maps/sampleHeights.ts))
  **wraps** neighbor sampling when seamless (clamps otherwise); the AO upscale
  wraps too. The flag is captured at render time and threaded through
  `MapContext`. Verified by shift-equivariance tests (`AO(roll(h)) ===
  roll(AO(h))` under wrap) and a live seam-continuity check (seam |Δ| ≪ interior).
- **Future maps (unbuilt):** roughness / specular / metalness (LUT remaps of
  height/slope), curvature — each is now just a registry entry with
  `lut: {mode: 'scalar', defaultStops}` (the scalar-LUT path below is built and
  unit-tested, awaiting its first map).

## Shipped — LUT editor with draggable stops

Colorization moved from a fixed even-spacing canvas gradient to **draggable stop
positions**, built as reusable LUT machinery.

- **LUT core** ([lut.ts](src/components/pages/Generator/CanvasSection/utils/maps/lut.ts),
  pure/Worker-safe): `Stop {position 0..1, color}`; `buildLUT(stops, channels,
  size=256)` — sort, **sRGB-linear** interpolate, clamp ends (parity with the old
  canvas gradient; OKLab a trivial future swap); `applyLUT(heights, lut,
  channels)` — the height→index lookup generalized to 3-ch (color) or 1-ch
  (scalar). The old `colorMap.ts` + canvas `createLinearGradient` row-readback +
  `Gradient` component were deleted; `ColorPicker` was promoted to
  [ui/ColorPicker](src/components/ui/ColorPicker/ColorPicker.tsx).
- **Editor** ([ui/LutEditor](src/components/ui/LutEditor/LutEditor.tsx),
  reusable): gradient preview bar with **draggable handles** (window-level
  pointer tracking — capture-free, so drags keep following the pointer off the
  handle), click-the-bar or "Add stop" (widest-gap midpoint) to add (new stop
  takes the gradient's color there — no visual jump), select→edit/delete (min 2,
  max 20), per-editor Randomize (colors only, positions kept). `mode: 'color' |
  'scalar'` — color edits via `ColorPicker`, scalar via a 0–255 value slider.
  A11y: handles are `slider`-role elements, arrow keys nudge ±1%.
- **Registry hook:** `MapDescriptor.lut?: {mode, defaultStops}`;
  `MapContext.palette` → `lut` (built on the main thread from the map's stops,
  passed to Worker/preview as plain bytes). Any map declaring `lut` gets its
  editor in the UI automatically. Color's defaults are the legacy
  cyan/purple/yellow at 0/0.5/1 — fresh load looks identical to before.
- **URL persistence:** `Values.lutStops: Record<mapKey, Stop[]>` in the store —
  only customized maps serialize, as `lut_<mapkey>=PPRRGGBB,…` (2-hex position
  byte + 6-hex color per stop); parse reads `lut_*` generically (store stays
  decoupled from the registry) and drops malformed values (→ defaults). Not
  lockable; **excluded from Randomize-all** (`applyLocks` passes only
  `LOCKABLE_KEYS`). No determinism impact (color is post-render).
- **Verified:** 19 new unit tests (LUT math, encode/decode, store round-trip +
  randomize exclusion); live — default stops render at legacy colors/positions,
  drag 50→85% works, keyboard nudge works, Copy-URL emits `lut_color` and reload
  restores the stops, and the exported `_color.png` matches the custom LUT
  within ±2/channel across 530 sampled pixels (cross-checked against the height
  member).

## Decisions (resolved, condensed)

- **A.** Accumulation buffer: single-channel grayscale float (+ alpha channel for
  compositing); RGBA float (~1 GiB at 8192²) rejected.
- **B.** Encoders: `fast-png` for PNG; EXR hand-rolled (small, self-contained;
  keeps `fast-png` the only encoder dep).
- **C.** New rendering baseline accepted; no shim for old URLs.
- **D.** Web Worker done (render + export both off the main thread).
- Zip: `fflate` level 0. Filenames: per-map prefix/suffix around a shared base,
  no timestamp. Normal-map algorithm: Sobel. AO: HBAO with auto-downsample >2048².

## Out of scope

- GPU/WebGL generation (breaks cross-machine determinism).
- Parallelizing the generation loop (breaks PRNG order).
- Group-level locks, lock-all, reroll-as-preset (from the prior locks spec).

## Shipped — UI declutter: app-shell layout + export dialog

The page moved from one long scrolling document to a **fixed-viewport app
shell** (at `lg:`; below that the old stacked scrolling layout remains):

- **Shell** ([Generator.tsx](src/components/pages/Generator/Generator.tsx)):
  `h-dvh` full-width, slim one-line header with the **footer links folded in**.
  Left column = canvas region over a fixed action row over the scrollable
  **output region** (`flex-[0_0_40%] overflow-y-auto`); right column = the
  scrollable **settings region**. Thin theme scrollbars via `global.css`
  (`scrollbar-width/color`).
- **Canvas scaling**: the canvas pane is a size container
  (`[container-type:size]`); the square wrapper is
  `w-[min(100cqw,100cqh)]` — always the largest square that fits, no
  scrollbars. Verified square at 1440×900 with zero page scroll; mobile
  fallback keeps the old stacked flow.
- **Export dialog**: new [ui/Dialog](src/components/ui/Dialog/Dialog.tsx) on
  `@radix-ui/react-dialog` (focus trap/Esc/aria; styled to theme). Holds export
  configuration only — Base + per-map prefix/suffix + live filename preview,
  include checkboxes, per-map bit depth, collision warning, and an in-dialog
  Export button (closes then exports). The action row keeps one-click
  "Export maps (.zip)".
- **Map cards** (output region): one registry-driven card per map — label,
  include-in-export checkbox, preview toggle, param sliders, LUT editor.
  Creative params moved out of the export panel (they drive previews).
- **Declutter**: disabled settings groups **auto-collapse** to their header row
  ([Group.tsx](src/components/pages/Generator/SettingsSection/Group/Group.tsx));
  persistent "Render first…" hint text replaced with hover `title` tooltips
  ([SubSection.tsx](src/components/pages/Generator/CanvasSection/SubSection/SubSection.tsx));
  a corner **toast** ([ui/Toast](src/components/ui/Toast/Toast.tsx), zustand +
  `role='status'`) replaces the Copy-URL label swap and announces export
  completion.
- **Canvas zoom/pan** ([Canvas.tsx](src/components/pages/Generator/CanvasSection/Canvas/Canvas.tsx)):
  native (non-passive) wheel zoom around the cursor (1–8×, pixelated when
  zoomed), drag pan (clamped so content covers the viewport), double-click
  reset, zoom badge; pure CSS transform — rendering/exports untouched; resets
  on resolution change.
- **Click-to-type slider values** ([Slider.tsx](src/components/ui/Slider/Slider.tsx)):
  the readout is click/Enter-editable; commits on Enter/blur clamped to
  min/max and snapped to the step grid, Esc cancels; dual sliders clamp
  against each other.
- **Keyboard shortcuts** (window listener via a fresh-closure ref, guarded
  while typing in fields): `R` render, `E` export dialog, `1..9` preview
  toggles, `?` cheatsheet dialog, Esc closes.

**Verified live** at 1440×900: no page scrollbar, square canvas fits the pane,
two independent scroll panes; R/E/?/Esc shortcuts work and are guarded inside
inputs; dialog export downloads the zip + toast; map cards render for all four
maps; disabled groups collapse; wheel-zoom transform + double-click reset;
typed slider value (3.7) commits. 91 unit tests, tsc, Prettier, and the
production build all green (layout-only change — no pipeline code touched).
