import {quantizeTo8, quantizeTo16} from '../heightmapPng';
import {toNormalMapRGB8, toNormalMapRGB16, toNormalMapRGBA} from './normalMap';
import {applyLUT, applyLUTRGBA} from './lut';
import {toAO8Auto, toAORGBA} from './ao';
import {type MapDescriptor} from './types';

/**
 * The set of output maps, in UI/export order. Adding a map = one entry here plus
 * its (pure) derivation — no changes to the export worker or the UI wiring.
 */
export const MAP_REGISTRY: MapDescriptor[] = [
  {
    key: 'height',
    label: 'Height',
    channels: 1,
    depthMode: 'global',
    defaultInclude: true,
    defaultSuffix: '_height',
    params: [],
    derive: ({heights}, depth) =>
      depth === 16 ? quantizeTo16(heights) : quantizeTo8(heights),
    // No preview: the "original" view already shows the height map.
  },
  {
    key: 'normal',
    label: 'Normal',
    channels: 3,
    depthMode: 'select8or16',
    defaultInclude: true,
    defaultSuffix: '_normal',
    params: [
      {
        key: 'strength',
        label: 'Strength',
        min: 0.1,
        max: 5,
        step: 0.1,
        default: 1,
      },
    ],
    derive: ({heights, width, height, params, seamless}, depth) =>
      depth === 16
        ? toNormalMapRGB16(heights, width, height, params.strength, seamless)
        : toNormalMapRGB8(heights, width, height, params.strength, seamless),
    previewRGBA: ({heights, width, height, params, seamless}) =>
      toNormalMapRGBA(heights, width, height, params.strength, seamless),
  },
  {
    key: 'color',
    label: 'Color',
    channels: 3,
    depthMode: 'fixed8',
    defaultInclude: true,
    defaultSuffix: '_color',
    params: [],
    lut: {
      mode: 'color',
      // The pre-LUT-editor gradient defaults (cyan → purple → yellow),
      // even-spaced — a fresh load looks identical to before.
      defaultStops: [
        {position: 0, color: {r: 0, g: 255, b: 255}},
        {position: 0.5, color: {r: 149, g: 0, b: 255}},
        {position: 1, color: {r: 255, g: 229, b: 0}},
      ],
    },
    derive: ({heights, lut}) => applyLUT(heights, lut, 3),
    previewRGBA: ({heights, lut}) => applyLUTRGBA(heights, lut),
  },
  {
    key: 'ao',
    label: 'Ambient occlusion',
    channels: 1,
    depthMode: 'fixed8',
    defaultInclude: false, // HBAO is costly — opt in explicitly
    defaultSuffix: '_ao',
    params: [
      {key: 'radius', label: 'Radius', min: 1, max: 64, step: 1, default: 16},
      {
        key: 'strength',
        label: 'Strength',
        min: 0,
        max: 2,
        step: 0.05,
        default: 1,
      },
    ],
    derive: ({heights, width, height, params, seamless}) =>
      toAO8Auto(
        heights,
        width,
        height,
        params.radius,
        params.strength,
        seamless,
      ),
    previewRGBA: ({heights, width, height, params, seamless}) =>
      toAORGBA(
        heights,
        width,
        height,
        params.radius,
        params.strength,
        seamless,
      ),
  },
];

/** Look up a descriptor by key (throws if unknown — a programming error). */
export const getMap = (key: string): MapDescriptor => {
  const descriptor = MAP_REGISTRY.find((m) => m.key === key);
  if (!descriptor) throw new Error(`Unknown map key: ${key}`);
  return descriptor;
};
