import {encode} from 'fast-png';
import {zipSync} from 'fflate';
import {MAP_REGISTRY} from './registry';
import {type MapDepth} from './types';

export type {MapDepth} from './types';

export type BuildMapsZipParams = {
  heights: Float32Array;
  width: number;
  height: number;
  /** Gradient palette as RGB triplets (see `paletteFromRowRGBA`). */
  palette: Uint8Array;
  /** Which maps to include, keyed by map key; at least one must be true. */
  include: Record<string, boolean>;
  /** Resolved export depth per map key. */
  depths: Record<string, MapDepth>;
  /** Param values per map key (e.g. `{normal: {strength: 1}}`). */
  params: Record<string, Record<string, number>>;
  /** Per-map member filename stem (no extension), keyed by map key. */
  memberNames: Record<string, string>;
  /** Coarse per-stage progress in `0..1` (drives the shared progress bar). */
  onProgress?: (fraction: number) => void;
};

/**
 * Derive the selected maps from the retained float buffer and pack them into a
 * single zip. Pure and synchronous — the Worker wraps this so the (potentially
 * multi-second, 8192²) work stays off the main thread. Every map derives from the
 * float `heights` (avoiding the double-quantization of re-reading the 8-bit
 * canvas), driven entirely by the map registry.
 */
export const buildMapsZip = ({
  heights,
  width,
  height,
  palette,
  include,
  depths,
  params,
  memberNames,
  onProgress,
}: BuildMapsZipParams): Uint8Array => {
  const included = MAP_REGISTRY.filter((map) => include[map.key]);

  const files: Record<string, Uint8Array> = {};
  onProgress?.(0.02);
  included.forEach((map, i) => {
    const depth = depths[map.key];
    const data = map.derive(
      {heights, width, height, palette, params: params[map.key] ?? {}},
      depth,
    );
    files[`${memberNames[map.key]}.png`] = encode({
      width,
      height,
      data,
      depth,
      channels: map.channels,
    });
    // Reserve the last slot for the zip step itself.
    onProgress?.((i + 1) / (included.length + 1));
  });

  // PNGs are already deflate-compressed, so store them (level 0) rather than
  // waste time re-compressing.
  const zip = zipSync(files, {level: 0});
  onProgress?.(1);

  return zip;
};
