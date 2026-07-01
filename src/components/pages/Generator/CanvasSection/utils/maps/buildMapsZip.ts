import {encode} from 'fast-png';
import {zipSync} from 'fflate';
import {encodeHeightmap8, encodeHeightmap16} from '../heightmapPng';
import {toNormalMapRGB8, toNormalMapRGB16} from './normalMap';
import {toColorMapRGB8} from './colorMap';

export type MapDepth = 8 | 16;
/** @deprecated alias kept for existing imports. */
export type HeightDepth = MapDepth;

export type MapKind = 'height' | 'normal' | 'color';

export type BuildMapsZipParams = {
  heights: Float32Array;
  width: number;
  height: number;
  /** Gradient palette as RGB triplets (see `paletteFromRowRGBA`). */
  palette: Uint8Array;
  normalStrength: number;
  heightDepth: MapDepth;
  normalDepth: MapDepth;
  /** Which maps to include; at least one must be true. */
  include: Record<MapKind, boolean>;
  /** Per-map member filename stem (no extension), e.g. `{height: 'HM_Rock'}`. */
  memberNames: Record<MapKind, string>;
  /** Coarse per-stage progress in `0..1` (drives the shared progress bar). */
  onProgress?: (fraction: number) => void;
};

/**
 * Derive the height + normal + color maps from the retained float buffer and pack
 * them into a single zip. Pure and synchronous — the Worker wraps this so the
 * (potentially multi-second, 8192²) work stays off the main thread. Deriving every
 * map from the float `heights` avoids the double-quantization of re-reading the
 * 8-bit canvas.
 */
export const buildMapsZip = ({
  heights,
  width,
  height,
  palette,
  normalStrength,
  heightDepth,
  normalDepth,
  include,
  memberNames,
  onProgress,
}: BuildMapsZipParams): Uint8Array => {
  // Only the selected maps; each entry lazily encodes its PNG when reached.
  const encoders: Array<[MapKind, () => Uint8Array]> = [];
  if (include.height)
    encoders.push([
      'height',
      () =>
        heightDepth === 16
          ? encodeHeightmap16(heights, width, height)
          : encodeHeightmap8(heights, width, height),
    ]);
  if (include.normal)
    encoders.push([
      'normal',
      () =>
        encode({
          width,
          height,
          data:
            normalDepth === 16
              ? toNormalMapRGB16(heights, width, height, normalStrength)
              : toNormalMapRGB8(heights, width, height, normalStrength),
          depth: normalDepth,
          channels: 3,
        }),
    ]);
  if (include.color)
    encoders.push([
      'color',
      () =>
        encode({
          width,
          height,
          data: toColorMapRGB8(heights, palette, width, height),
          depth: 8,
          channels: 3,
        }),
    ]);

  const files: Record<string, Uint8Array> = {};
  onProgress?.(0.02);
  encoders.forEach(([kind, encodeMap], i) => {
    files[`${memberNames[kind]}.png`] = encodeMap();
    // Reserve the last slot for the zip step itself.
    onProgress?.((i + 1) / (encoders.length + 1));
  });

  // PNGs are already deflate-compressed, so store them (level 0) rather than
  // waste time re-compressing.
  const zip = zipSync(files, {level: 0});
  onProgress?.(1);

  return zip;
};
