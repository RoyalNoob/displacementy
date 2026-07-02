# Displacement Y

Procedural deterministic displacement sci-fi maps generator.

Forked from [Displacement X](https://github.com/satelllte/displacementx)

Live at ▶ **[displacementy.pages.dev](https://displacementy.pages.dev/)**

<img src="./public/banner.png" alt="Displacement Y - social image preview"/>

## User manual

### Quick start

1. Tweak the **Settings** (right pane) or hit **Randomize all**.
2. Press **Render** (or `R`). A progress bar shows long renders.
3. **Download** a single file, or **Export maps (.zip)** for a bundle of
   height / normal / color / AO maps.
4. **Copy URL** to share — the link reproduces the exact same image on any
   machine (generation is fully deterministic).

### Layout

- **Canvas** (top left) — the rendered map, always the largest square that fits.
  **Mouse-wheel** zooms (1–8×), **drag** pans while zoomed, **double-click**
  resets.
- **Output** (below the canvas, scrolls) — resolution, bit depth, inversion,
  and one card per map.
- **Settings** (right, scrolls) — the pattern generators. Groups toggle on/off
  (disabled groups collapse to their header), each has its own **Randomize**,
  and the 🔒 next to a parameter excludes it from randomization. Slider values
  can be **clicked and typed** for exact numbers.

### Output options

- **Resolution** — 1024² to 8192². Changing it resets the canvas. Thanks to
  determinism you can tune at low resolution, then re-render the same seed at
  high resolution.
- **Bit depth** (single-file Download) —
  **8-bit** PNG (the canvas as displayed, including preview/inversion),
  **16-bit** grayscale PNG (full-precision height map, no banding),
  **32-bit float** OpenEXR (lossless float height, for Blender/Nuke/World
  Machine).
- **Seamless Texture** (in Settings → Basics) — makes the height map tile, and
  every derived map (normal, AO) tiles with it.

### Maps

Each card in the Output pane controls one exportable map:

| Map                   | What it is                                   | Controls                                    |
| --------------------- | -------------------------------------------- | ------------------------------------------- |
| **Height**            | The displacement map itself (grayscale)      | Depth follows the global bit-depth selector |
| **Normal**            | Tangent-space normals (3×3 Sobel, OpenGL/+Y) | Strength slider; 8- or 16-bit RGB           |
| **Color**             | Height→color via a gradient LUT              | Gradient editor (below); 8-bit RGB          |
| **Ambient occlusion** | HBAO from the height field                   | Radius + strength; off by default (costly)  |

Every map can be **previewed** on the canvas (toggle back to the original
before switching) and included/excluded from the zip export. Previews and
exports use the same math — what you see is what you export.

**Gradient editor** (Color card): **drag** stops to reposition, **click the
bar** to add a stop, select a stop to recolor or delete it, **Randomize** for
new colors. Custom gradients are part of the shareable URL.

### Export maps (.zip)

**Export options…** (`E`) opens the export dialog: a shared **base name** plus
a per-map **prefix/suffix** (e.g. `_N` for normal, `_C` for color) with a live
filename preview, per-map include checkboxes, and the normal map's bit depth.
Files are named `{prefix}{base}{suffix}.png` inside `{base}.zip`. The plain
**Export maps (.zip)** button exports one-click with the current options.

### Keyboard shortcuts

`R` render · `E` export options · `1/2/3` toggle normal/color/AO preview ·
`?` cheatsheet · `Esc` close dialog.

## Feature parity with Displacement X

Everything Displacement X (v0.5.0) does, Displacement Y does too — same
generators, same look. The differences are additions and internals:

| Feature                                                     | Displacement X                        | Displacement Y                                                                                                              |
| ----------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Pattern generators (rect, grid, cols, rows, lines, sprites) | ✅                                    | ✅ same                                                                                                                     |
| 16 composition modes                                        | ✅                                    | ✅ same                                                                                                                     |
| Resolutions 1024²–8192²                                     | ✅                                    | ✅ same                                                                                                                     |
| Seamless texture option                                     | ✅ height map                         | ✅ height **and** derived maps (normal/AO wrap at edges)                                                                    |
| Normal & color previews                                     | ✅ from 8-bit canvas                  | ✅ from the float buffer (preview = export), plus **AO**                                                                    |
| Rendering core                                              | Native canvas, 8-bit, `Math.random()` | **Deterministic** seeded PRNG on a **32-bit float** core, in a Web Worker with progress bar                                 |
| Reproducibility / sharing                                   | —                                     | **Copy URL** — same link, same pixels, any machine                                                                          |
| Parameter locks                                             | —                                     | 🔒 any parameter against randomization                                                                                      |
| Export                                                      | 8-bit RGBA PNG                        | 8-bit PNG · **16-bit grayscale PNG** · **32-bit float EXR** · **multi-map zip** (height/normal/color/AO) with custom naming |
| Normal map                                                  | Fixed formula, 8-bit canvas grab      | Tunable strength, computed from float heights, dedicated 8/16-bit export                                                    |
| Ambient occlusion                                           | —                                     | HBAO with radius/strength, auto-downsampled at high res                                                                     |
| Color gradient                                              | Fixed, evenly-spaced stops            | **Draggable stop positions**, shareable via URL                                                                             |
| UI                                                          | Single scrolling page                 | Fixed app shell (independent panes), export dialog, canvas **zoom/pan**, click-to-type sliders, keyboard shortcuts, toasts  |

The rendering baseline differs from Displacement X by design: the float core
computes exact values instead of accumulating 8-bit rounding, so images are
cleaner but not byte-identical to the original app's output.

## FAQ

### What is it used for?

Generated height maps and normal maps can be used in 3D software or game engine, such as Houdini, Blender, Unreal, Unity etc.

### What is the difference between this and `Displacement X`?

Displacement Y is a fork of [Displacement X](https://github.com/satelllte/displacementx), with some extra features and UX changes.

The biggest difference is that Displacement Y is "deterministic", i.e., it will produce the same result with the same settings. This allowed finer control and the sharing of results between sessions or users. You can also tune parameters in lower resolution, then render it in higher resolution later; the result will be visually identical.

You can also lock some of the parameters so that randomization will only effect those that you allowed, providing greater control.

### Why not just work on `Displacement X`? Why the fork and name change?

1. I don't want to go through the whole pull request process. I just want to make some changes for my own need.
2. All the changes are coded by AI and I don't want to "taint" the original code base.

### Any future plans for `Displacement Y`?

There are several features planned, such as custom sprite packs and more derived maps (roughness / specular / metalness), but no promises.

### I want to share my work done with the help of `Displacement Y`. Where can I do that?

I don't have anything setup yet, but feel free to link or attribute this repo or [displacementy.pages.dev](https://displacementy.pages.dev/).

## Contributing

Check out [CONTRIBUTING.md](./CONTRIBUTING.md) guide.
