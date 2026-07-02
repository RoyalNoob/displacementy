# Spec — Rendering core, export & derived maps

> Status: everything under **Shipped** is done, tested, and verified in-browser
> (91 unit tests green at last count). Active work: **UI declutter — app-shell
> layout + export dialog** (final section). (The prior parameter-locks spec was
> fully implemented and removed; the code is its record.)

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
- **Options panel** (collapsible; uses the new
  [Input](src/components/ui/Input/Input.tsx) text primitive): per-map include
  checkboxes, per-map prefix/suffix with live filename preview, per-map param
  sliders, per-map bit-depth where applicable.
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

---

## Active — UI declutter: app-shell layout + export dialog (planned)

The current page is one long scrolling document; `CanvasSection` has accreted
canvas + actions + export panel + per-map controls into a single cluttered
column. Restructure into a **fixed viewport app shell** and move export
configuration into a **dialog**. All work conforms to the existing style
language (black bg, white text, dashed white borders, `pink` accent, `sky`
focus rings, square corners, small type).

### Target layout (`lg:` and up)

```
┌──────────────────────────────────────────────────────────┐
│ Displacement Y · v0.1.x         @credit · GitHub · Vers. │  slim header
├──────────────────────────────┬───────────────────────────┤
│                              │ SETTINGS                  │
│         canvas               │ Basics / Rect / Grid /    │
│    (square, scales to fit,   │ Cols / Rows / Lines /     │
│     centered, no scroll)     │ Sprites / Other           │
│                              │                           │
├──────────────────────────────┤        (scrolls           │
│ Render Download Export▸ Copy │      independently)       │
│ ──────────── OUTPUT ──────── │                           │
│ Resolution · Bit depth ·     │                           │
│ Inversion · map cards        │                           │
│        (scrolls independently)│                          │
└──────────────────────────────┴───────────────────────────┘
```

1. **Shell** ([Generator.tsx](src/components/pages/Generator/Generator.tsx)) —
   `h-dvh flex flex-col overflow-hidden`, full-width (drop `max-w-screen-2xl`).
   Slim one-line header; the **footer folds into the header** (right-aligned
   small links: credit, GitHub, version history) — a fixed shell has no room for
   a footer row. `main` = `flex flex-1 min-h-0`, two columns:
   - **Left column** (`flex-1 min-w-0 flex flex-col`):
     - **Canvas region** (`flex-1 min-h-0`, no scrollbar): the pane is a size
       container (`[container-type:size]`); the square canvas wrapper is
       `aspect-square w-[min(100cqw,100cqh)]`, centered — always the largest
       square that fits the pane. Busy overlay/progress unchanged.
     - **Action row** (fixed, non-scrolling, between canvas and output):
       Render · Download · Export maps (.zip) · Export options… · Copy URL.
     - **Output region** (`overflow-y-auto min-h-0`, ~40% of the column):
       Resolution, Bit depth, Inversion, and one **map card** per registry map
       (see below).
   - **Right column — Settings region** (`overflow-y-auto min-h-0`, wider
     share): `SettingsSection` unchanged inside.
   - **Responsive:** the shell is `lg:`-gated; below `lg` keep today's stacked,
     page-scrolling layout.
   - **Scrollbars:** thin/dark theme-matching rules in `global.css`
     (`scrollbar-width: thin` + webkit) for the scrolling panes.

2. **Export dialog** — new `ui/Dialog` primitive on **`@radix-ui/react-dialog`**
   (matches the existing Radix-primitive-with-custom-styling pattern; focus
   trap/Esc/aria for free). Panel: centered, `bg-black border border-white`,
   `bg-black/70` backdrop. The current inline "Export options" panel moves in:
   shared Base + per-map prefix/suffix + live filename preview, per-map include
   checkboxes, per-map bit depth, collision warning, plus an **Export button
   inside the dialog**. The action row's "Export maps (.zip)" stays as a
   one-click export with current options.
   **Split rule:** only export *configuration* lives in the dialog; creative
   parameters (normal strength, AO radius/strength, LUT stops) move to the map
   cards because they drive previews too.

3. **Map cards** (output region) — one consistent card per registry map
   replacing the scattered preview SubSections + export-panel param rows:
   title, include-in-export checkbox, preview toggle (when `previewRGBA`),
   param sliders, LUT editor (when `lut`). Registry-driven like everything
   else — a future map gets a full card for free.

4. **Auto-collapse disabled settings groups** — in `SettingsSection`, a group
   whose enable switch is off collapses to its header row (switch + lock +
   randomize stay reachable). Halves the settings column's visual weight.

5. **Tooltip hints replace persistent hint text** — drop the italic
   "Render first to enable." lines under disabled sections; use `title`
   attributes (already the pattern on buttons).

6. **Toast** — small hand-rolled corner toast (bottom-right, auto-dismiss ~2 s,
   `role='status'` live region): "URL copied", "Exported {name}.zip". Replaces
   the Copy-URL label swap and gives export completion visible confirmation.

7. **Canvas zoom/pan** — wheel-zoom (around cursor, clamp ~1–8×) + drag-pan +
   double-click reset, as a CSS transform on the canvas inside the square
   viewport (`overflow-hidden`; rendering/`putImageData` unaffected). Needed to
   judge detail at 4096²/8192² where the preview is heavily downscaled.

8. **Click-to-type slider values** — the `Slider` numeric readout becomes
   click-to-edit (commit on Enter/blur, Esc cancels, clamped to min/max/step).

9. **Keyboard shortcuts** — `R` render, `E` export dialog, `1/2/3…` preview
   toggles, `?` opens a cheatsheet (reuses `ui/Dialog`). Ignored while an
   input/textarea has focus.

**Suggested order:** shell + regions (1) → dialog + map cards (2, 3) →
declutter passes (4, 5, 6) → interaction extras (7, 8, 9). Each step leaves the
app working; existing unit tests are unaffected (layout-only) except any
CanvasSection reorganization keeps the registry-driven wiring intact.

**Verification:** all 91 unit tests stay green; live checks — canvas fits both
pane dimensions with no scrollbars at multiple window sizes, both panes scroll
independently, dialog export round-trips (naming/include/depth), collapsed
groups re-expand on enable, zoom/pan doesn't affect exports, shortcuts guarded
while typing, `lg`-down fallback still scrolls as today.
