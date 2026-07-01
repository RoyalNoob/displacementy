import {quantizeTo8, quantizeTo16} from '../heightmapPng';
import {toNormalMapRGB8, toNormalMapRGB16, toNormalMapRGBA} from './normalMap';
import {toColorMapRGB8, toColorMapRGBA} from './colorMap';
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
    derive: ({heights, width, height, params}, depth) =>
      depth === 16
        ? toNormalMapRGB16(heights, width, height, params.strength)
        : toNormalMapRGB8(heights, width, height, params.strength),
    previewRGBA: ({heights, width, height, params}) =>
      toNormalMapRGBA(heights, width, height, params.strength),
  },
  {
    key: 'color',
    label: 'Color',
    channels: 3,
    depthMode: 'fixed8',
    defaultInclude: true,
    defaultSuffix: '_color',
    params: [],
    derive: ({heights, palette, width, height}) =>
      toColorMapRGB8(heights, palette, width, height),
    previewRGBA: ({heights, palette, width, height}) =>
      toColorMapRGBA(heights, palette, width, height),
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
    derive: ({heights, width, height, params}) =>
      toAO8Auto(heights, width, height, params.radius, params.strength),
    previewRGBA: ({heights, width, height, params}) =>
      toAORGBA(heights, width, height, params.radius, params.strength),
  },
];

/** Look up a descriptor by key (throws if unknown — a programming error). */
export const getMap = (key: string): MapDescriptor => {
  const descriptor = MAP_REGISTRY.find((m) => m.key === key);
  if (!descriptor) throw new Error(`Unknown map key: ${key}`);
  return descriptor;
};
