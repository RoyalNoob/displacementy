import {type Stop} from './lut';

/** PNG bit depth a map can be encoded at. */
export type MapDepth = 8 | 16;

/**
 * How a map's export bit depth is chosen:
 * - `global` — follows the app's global Bit-depth selector (height).
 * - `select8or16` — the map exposes its own 8/16 choice (normal).
 * - `fixed8` — always 8-bit (color, AO).
 */
export type DepthMode = 'global' | 'select8or16' | 'fixed8';

/** A tunable numeric parameter, rendered as a Slider and passed to `derive`. */
export type ParamSpec = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
};

/** Everything a map derivation needs. Pure data — safe to build in a Worker. */
export type MapContext = {
  heights: Float32Array;
  width: number;
  height: number;
  /**
   * This map's LUT (built from its stops via `buildLUT`), packed with the
   * channel count of `MapDescriptor.lut.mode` (`color` → 3, `scalar` → 1).
   * Empty for maps that declare no `lut`.
   */
  lut: Uint8Array;
  /** Resolved param values for this map, keyed by `ParamSpec.key`. */
  params: Record<string, number>;
  /**
   * Whether the height buffer tiles seamlessly (seamless-texture mode). When
   * true, neighbor sampling in derivations must **wrap** at edges rather than
   * clamp, so the derived map tiles too.
   */
  seamless: boolean;
};

/**
 * A derivable output map (height / normal / color / AO / …). Everything the
 * export pipeline and the UI need to treat maps uniformly lives here, so adding
 * a new map is a single registry entry. All functions are **pure and
 * Worker-safe** (no DOM); the gradient palette arrives as data via `MapContext`.
 */
export type MapDescriptor = {
  /** Stable id, also the state/record key and filename token, e.g. `'normal'`. */
  key: string;
  /** Human label for the UI. */
  label: string;
  /** Output channel count (1 = grayscale, 3 = RGB). */
  channels: 1 | 3;
  depthMode: DepthMode;
  /** Included in a fresh export by default? */
  defaultInclude: boolean;
  /** Default filename suffix, e.g. `'_normal'`. */
  defaultSuffix: string;
  /** Tunable params (empty for height/color). */
  params: ParamSpec[];
  /**
   * Declared by LUT maps (height→value remaps): the editor mode and the default
   * stops. Maps with `lut` get a `LutEditor` in the UI and receive their built
   * LUT via `MapContext.lut`.
   */
  lut?: {mode: 'color' | 'scalar'; defaultStops: Stop[]};
  /** Pixels for export at the given depth (length = w*h*channels). */
  derive: (ctx: MapContext, depth: MapDepth) => Uint8Array | Uint16Array;
  /**
   * Opaque RGBA for the on-canvas preview. Omitted for maps with no preview
   * (height's preview is just the rendered "original").
   */
  previewRGBA?: (ctx: MapContext) => Uint8ClampedArray;
};
