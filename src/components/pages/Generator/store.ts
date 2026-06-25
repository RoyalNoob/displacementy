import {create} from 'zustand';
import {
  initialSeed,
  iterations,
  backgroundBrightness,
  rectEnabled,
  rectBrightness,
  rectAlpha,
  rectScale,
  gridEnabled,
  gridBrightness,
  gridAlpha,
  gridScale,
  gridAmount,
  gridGap,
  colsEnabled,
  colsBrightness,
  colsAlpha,
  colsScale,
  colsAmount,
  colsGap,
  rowsEnabled,
  rowsBrightness,
  rowsAlpha,
  rowsScale,
  rowsAmount,
  rowsGap,
  linesEnabled,
  linesBrightness,
  linesAlpha,
  linesWidth,
  spritesEnabled,
  spritesPacks,
  spritesRotationEnabled,
  seamlessTextureEnabled,
  compositionModes,
  type SettingConstant,
  type SettingDualConstant,
  type SpritesPack,
  type CompositionMode,
} from './constants';
import {randomBoolean, randomInteger} from '@/utils/random';
import {type NumberDual} from '@/types';

type Values = {
  initialSeed: number;
  iterations: number;
  backgroundBrightness: number;
  rectEnabled: boolean;
  rectBrightness: NumberDual;
  rectAlpha: NumberDual;
  rectScale: number;
  gridEnabled: boolean;
  gridBrightness: NumberDual;
  gridAlpha: NumberDual;
  gridScale: number;
  gridAmount: NumberDual;
  gridGap: number;
  colsEnabled: boolean;
  colsBrightness: NumberDual;
  colsAlpha: NumberDual;
  colsScale: number;
  colsAmount: NumberDual;
  colsGap: number;
  rowsEnabled: boolean;
  rowsBrightness: NumberDual;
  rowsAlpha: NumberDual;
  rowsScale: number;
  rowsAmount: NumberDual;
  rowsGap: number;
  linesEnabled: boolean;
  linesBrightness: NumberDual;
  linesAlpha: NumberDual;
  linesWidth: NumberDual;
  spritesEnabled: boolean;
  spritesPacks: SpritesPack[];
  spritesRotationEnabled: boolean;
  seamlessTextureEnabled: boolean;
  compositionModes: CompositionMode[];
};

type Setters = {
  setInitialSeed: (initialSeed: Values['initialSeed']) => void;
  setIterations: (iterations: Values['iterations']) => void;
  setBackgroundBrightness: (
    backgroundBrightness: Values['backgroundBrightness'],
  ) => void;
  setRectEnabled: (rectEnabled: Values['rectEnabled']) => void;
  setRectBrightness: (rectBrightness: Values['rectBrightness']) => void;
  setRectAlpha: (rectAlpha: Values['rectAlpha']) => void;
  setRectScale: (rectScale: Values['rectScale']) => void;
  setGridEnabled: (gridEnabled: Values['gridEnabled']) => void;
  setGridBrightness: (gridBrightness: Values['gridBrightness']) => void;
  setGridAlpha: (gridAlpha: Values['gridAlpha']) => void;
  setGridScale: (gridScale: Values['gridScale']) => void;
  setGridAmount: (gridAmount: Values['gridAmount']) => void;
  setGridGap: (gridGap: Values['gridGap']) => void;
  setColsEnabled: (colsEnabled: Values['colsEnabled']) => void;
  setColsBrightness: (colsBrightness: Values['colsBrightness']) => void;
  setColsAlpha: (colsAlpha: Values['colsAlpha']) => void;
  setColsScale: (colsScale: Values['colsScale']) => void;
  setColsAmount: (colsAmount: Values['colsAmount']) => void;
  setColsGap: (colsGap: Values['colsGap']) => void;
  setRowsEnabled: (rowsEnabled: Values['rowsEnabled']) => void;
  setRowsBrightness: (rowsBrightness: Values['rowsBrightness']) => void;
  setRowsAlpha: (rowsAlpha: Values['rowsAlpha']) => void;
  setRowsScale: (rowsScale: Values['rowsScale']) => void;
  setRowsAmount: (rowsAmount: Values['rowsAmount']) => void;
  setRowsGap: (rowsGap: Values['rowsGap']) => void;
  setLinesEnabled: (linesEnabled: Values['linesEnabled']) => void;
  setLinesBrightness: (linesBrightness: Values['linesBrightness']) => void;
  setLinesAlpha: (linesAlpha: Values['linesAlpha']) => void;
  setLinesWidth: (linesWidth: Values['linesWidth']) => void;
  setSpritesEnabled: (spritesEnabled: Values['spritesEnabled']) => void;
  setSpritesPacks: (spritesPacks: Values['spritesPacks']) => void;
  setSpritesRotationEnabled: (
    spritesRotationEnabled: Values['spritesEnabled'],
  ) => void;
  setseamlessTextureEnabled: (
    seamlessTextureEnabled: Values['seamlessTextureEnabled'],
  ) => void;
  setCompositionModes: (compositionModes: Values['compositionModes']) => void;
};

type ComputedValues = {
  getSprites: () => HTMLImageElement[];
  getSettingsQuery: () => string;
};

type Actions = {
  randomize: () => void;
  randomizeRect: () => void;
  randomizeGrid: () => void;
  randomizeCols: () => void;
  randomizeRows: () => void;
  randomizeLines: () => void;
  randomizeSprites: () => void;
  randomizeCompositionModes: () => void;
};

const ALL_SPRITES_PACKS: SpritesPack[] = [
  'classic',
  'bigdata',
  'aggromaxx',
  'crappack',
];

const ALL_COMPOSITION_MODES: CompositionMode[] = [
  'color-burn',
  'color-dodge',
  'darken',
  'difference',
  'exclusion',
  'hard-light',
  'lighten',
  'lighter',
  'luminosity',
  'multiply',
  'overlay',
  'screen',
  'soft-light',
  'source-atop',
  'source-over',
  'xor',
];

export const useStore = create<Values & Setters & ComputedValues & Actions>(
  (set, get) => ({
    // Values
    // ---
    ...getInitialValues(),
    // Setters
    // ---
    setInitialSeed(initialSeed: Values['initialSeed']) {
      set(() => ({initialSeed}));
    },
    setIterations(iterations: Values['iterations']) {
      set(() => ({iterations}));
    },
    setBackgroundBrightness(
      backgroundBrightness: Values['backgroundBrightness'],
    ) {
      set(() => ({backgroundBrightness}));
    },
    setRectEnabled(rectEnabled: Values['rectEnabled']) {
      set(() => ({rectEnabled}));
    },
    setRectBrightness(rectBrightness: Values['rectBrightness']) {
      set(() => ({rectBrightness}));
    },
    setRectAlpha(rectAlpha: Values['rectAlpha']) {
      set(() => ({rectAlpha}));
    },
    setRectScale(rectScale: Values['rectScale']) {
      set(() => ({rectScale}));
    },
    setGridEnabled(gridEnabled: Values['gridEnabled']) {
      set(() => ({gridEnabled}));
    },
    setGridBrightness(gridBrightness: Values['gridBrightness']) {
      set(() => ({gridBrightness}));
    },
    setGridAlpha(gridAlpha: Values['gridAlpha']) {
      set(() => ({gridAlpha}));
    },
    setGridScale(gridScale: Values['gridScale']) {
      set(() => ({gridScale}));
    },
    setGridAmount(gridAmount: Values['gridAmount']) {
      set(() => ({gridAmount}));
    },
    setGridGap(gridGap: Values['gridGap']) {
      set(() => ({gridGap}));
    },
    setColsEnabled(colsEnabled: Values['colsEnabled']) {
      set(() => ({colsEnabled}));
    },
    setColsBrightness(colsBrightness: Values['colsBrightness']) {
      set(() => ({colsBrightness}));
    },
    setColsAlpha(colsAlpha: Values['colsAlpha']) {
      set(() => ({colsAlpha}));
    },
    setColsScale(colsScale: Values['colsScale']) {
      set(() => ({colsScale}));
    },
    setColsAmount(colsAmount: Values['colsAmount']) {
      set(() => ({colsAmount}));
    },
    setColsGap(colsGap: Values['colsGap']) {
      set(() => ({colsGap}));
    },
    setRowsEnabled(rowsEnabled: Values['rowsEnabled']) {
      set(() => ({rowsEnabled}));
    },
    setRowsBrightness(rowsBrightness: Values['rowsBrightness']) {
      set(() => ({rowsBrightness}));
    },
    setRowsAlpha(rowsAlpha: Values['rowsAlpha']) {
      set(() => ({rowsAlpha}));
    },
    setRowsScale(rowsScale: Values['rowsScale']) {
      set(() => ({rowsScale}));
    },
    setRowsAmount(rowsAmount: Values['rowsAmount']) {
      set(() => ({rowsAmount}));
    },
    setRowsGap(rowsGap: Values['rowsGap']) {
      set(() => ({rowsGap}));
    },
    setLinesEnabled(linesEnabled: Values['linesEnabled']) {
      set(() => ({linesEnabled}));
    },
    setLinesBrightness(linesBrightness: Values['linesBrightness']) {
      set(() => ({linesBrightness}));
    },
    setLinesAlpha(linesAlpha: Values['linesAlpha']) {
      set(() => ({linesAlpha}));
    },
    setLinesWidth(linesWidth: Values['linesWidth']) {
      set(() => ({linesWidth}));
    },
    setSpritesEnabled(spritesEnabled: Values['spritesEnabled']) {
      set(() => ({spritesEnabled}));
    },
    setSpritesPacks(spritesPacks: Values['spritesPacks']) {
      set(() => ({spritesPacks}));
    },
    setSpritesRotationEnabled(
      spritesRotationEnabled: Values['spritesRotationEnabled'],
    ) {
      set(() => ({spritesRotationEnabled}));
    },
    setseamlessTextureEnabled(
      seamlessTextureEnabled: Values['seamlessTextureEnabled'],
    ) {
      set(() => ({seamlessTextureEnabled}));
    },
    setCompositionModes(compositionModes: Values['compositionModes']) {
      set(() => ({compositionModes}));
    },
    // ComputedValues
    // ---
    getSprites() {
      const spritesBaseUrl = '/sprites';
      const {spritesPacks} = get();
      const sprites: HTMLImageElement[] = [];

      const hasClassic = spritesPacks.includes('classic');
      const hasBigdata = spritesPacks.includes('bigdata');
      const hasAggromaxx = spritesPacks.includes('aggromaxx');
      const hasCrappack = spritesPacks.includes('crappack');

      const addSprites = (pack: SpritesPack, n: number) => {
        for (let i = 1; i <= n; i++) {
          const sprite = new Image();
          sprite.src = `${spritesBaseUrl}/${pack}/${i}.svg`;
          sprites.push(sprite);
        }
      };

      if (hasClassic) addSprites('classic', 17);
      if (hasBigdata) addSprites('bigdata', 5);
      if (hasAggromaxx) addSprites('aggromaxx', 12);
      if (hasCrappack) addSprites('crappack', 27);

      return sprites;
    },
    getSettingsQuery() {
      return serializeValues(get());
    },
    // Actions
    // ---
    randomize() {
      set(() => randomValues());
    },
    randomizeRect() {
      set(() => ({
        rectBrightness: randDualSetting(rectBrightness),
        rectAlpha: randDualSetting(rectAlpha),
        rectScale: randSetting(rectScale),
      }));
    },
    randomizeGrid() {
      set(() => ({
        gridBrightness: randDualSetting(gridBrightness),
        gridAlpha: randDualSetting(gridAlpha),
        gridScale: randSetting(gridScale),
        gridAmount: randDualSetting(gridAmount),
        gridGap: randSetting(gridGap),
      }));
    },
    randomizeCols() {
      set(() => ({
        colsBrightness: randDualSetting(colsBrightness),
        colsAlpha: randDualSetting(colsAlpha),
        colsScale: randSetting(colsScale),
        colsAmount: randDualSetting(colsAmount),
        colsGap: randSetting(colsGap),
      }));
    },
    randomizeRows() {
      set(() => ({
        rowsBrightness: randDualSetting(rowsBrightness),
        rowsAlpha: randDualSetting(rowsAlpha),
        rowsScale: randSetting(rowsScale),
        rowsAmount: randDualSetting(rowsAmount),
        rowsGap: randSetting(rowsGap),
      }));
    },
    randomizeLines() {
      set(() => ({
        linesBrightness: randDualSetting(linesBrightness),
        linesAlpha: randDualSetting(linesAlpha),
        linesWidth: randDualSetting(linesWidth),
      }));
    },
    randomizeSprites() {
      set(() => ({
        spritesPacks: randSpritesPacks(),
        spritesRotationEnabled: randomBoolean(),
      }));
    },
    randomizeCompositionModes() {
      set(() => ({
        compositionModes: randCompositionModes(),
      }));
    },
  }),
);

function randSetting(setting: SettingConstant): number {
  return randomInteger(setting.min, setting.max);
}

function randDualSetting(setting: SettingDualConstant): NumberDual {
  return [
    randomInteger(setting.min, setting.max),
    randomInteger(setting.min, setting.max),
  ];
}

function randSpritesPacks(): SpritesPack[] {
  return ALL_SPRITES_PACKS.filter(() => randomBoolean());
}

function randCompositionModes(): CompositionMode[] {
  return ALL_COMPOSITION_MODES.filter(() => randomBoolean());
}

/**
 * A fully randomized set of values, used by `randomize()` and as the
 * fallback when the page is loaded without any query parameters.
 */
function randomValues(): Values {
  return {
    initialSeed: randSetting(initialSeed),
    iterations: randSetting(iterations),
    backgroundBrightness: randSetting(backgroundBrightness),
    rectEnabled: randomBoolean(),
    rectBrightness: randDualSetting(rectBrightness),
    rectAlpha: randDualSetting(rectAlpha),
    rectScale: randSetting(rectScale),
    gridEnabled: randomBoolean(),
    gridBrightness: randDualSetting(gridBrightness),
    gridAlpha: randDualSetting(gridAlpha),
    gridScale: randSetting(gridScale),
    gridAmount: randDualSetting(gridAmount),
    gridGap: randSetting(gridGap),
    colsEnabled: randomBoolean(),
    colsBrightness: randDualSetting(colsBrightness),
    colsAlpha: randDualSetting(colsAlpha),
    colsScale: randSetting(colsScale),
    colsAmount: randDualSetting(colsAmount),
    colsGap: randSetting(colsGap),
    rowsEnabled: randomBoolean(),
    rowsBrightness: randDualSetting(rowsBrightness),
    rowsAlpha: randDualSetting(rowsAlpha),
    rowsScale: randSetting(rowsScale),
    rowsAmount: randDualSetting(rowsAmount),
    rowsGap: randSetting(rowsGap),
    linesEnabled: randomBoolean(),
    linesBrightness: randDualSetting(linesBrightness),
    linesAlpha: randDualSetting(linesAlpha),
    linesWidth: randDualSetting(linesWidth),
    spritesEnabled: randomBoolean(),
    spritesPacks: randSpritesPacks(),
    spritesRotationEnabled: randomBoolean(),
    seamlessTextureEnabled: seamlessTextureEnabled.default,
    compositionModes: randCompositionModes(),
  };
}

/** The deterministic default values, used as a base when parsing query params. */
function defaultValues(): Values {
  return {
    initialSeed: initialSeed.default,
    iterations: iterations.default,
    backgroundBrightness: backgroundBrightness.default,
    rectEnabled: rectEnabled.default,
    rectBrightness: rectBrightness.default,
    rectAlpha: rectAlpha.default,
    rectScale: rectScale.default,
    gridEnabled: gridEnabled.default,
    gridBrightness: gridBrightness.default,
    gridAlpha: gridAlpha.default,
    gridScale: gridScale.default,
    gridAmount: gridAmount.default,
    gridGap: gridGap.default,
    colsEnabled: colsEnabled.default,
    colsBrightness: colsBrightness.default,
    colsAlpha: colsAlpha.default,
    colsScale: colsScale.default,
    colsAmount: colsAmount.default,
    colsGap: colsGap.default,
    rowsEnabled: rowsEnabled.default,
    rowsBrightness: rowsBrightness.default,
    rowsAlpha: rowsAlpha.default,
    rowsScale: rowsScale.default,
    rowsAmount: rowsAmount.default,
    rowsGap: rowsGap.default,
    linesEnabled: linesEnabled.default,
    linesBrightness: linesBrightness.default,
    linesAlpha: linesAlpha.default,
    linesWidth: linesWidth.default,
    spritesEnabled: spritesEnabled.default,
    spritesPacks: spritesPacks.default,
    spritesRotationEnabled: spritesRotationEnabled.default,
    seamlessTextureEnabled: seamlessTextureEnabled.default,
    compositionModes: compositionModes.default,
  };
}

// -------------------
// QUERY PARAM PARSING
// -------------------

function parseNumber(raw: string | null, fallback: number): number {
  if (raw === null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function parseDual(raw: string | null, fallback: NumberDual): NumberDual {
  if (raw === null) return fallback;
  const parts = raw.split(',').map((p) => Number(p.trim()));
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) {
    return fallback;
  }
  return [parts[0], parts[1]];
}

function parseBoolean(raw: string | null, fallback: boolean): boolean {
  if (raw === null) return fallback;
  if (raw === '1' || raw === 'true') return true;
  if (raw === '0' || raw === 'false') return false;
  return fallback;
}

function parseList<T extends string>(
  raw: string | null,
  allowed: T[],
  fallback: T[],
): T[] {
  if (raw === null) return fallback;
  if (raw === '') return [];
  const items = raw.split(',').map((p) => p.trim());
  return allowed.filter((value) => items.includes(value));
}

/**
 * Initial values for the store. When the page is opened with query
 * parameters, each known setting is read from the URL (falling back to its
 * default when absent). When opened with no parameters at all, everything is
 * randomized — matching the previous "fresh pattern on every refresh" behavior.
 */
function getInitialValues(): Values {
  if (typeof window === 'undefined') return defaultValues();

  const params = new URLSearchParams(window.location.search);
  if ([...params.keys()].length === 0) return randomValues();

  const base = defaultValues();
  const num = (key: string, fallback: number) =>
    parseNumber(params.get(key), fallback);
  const dual = (key: string, fallback: NumberDual) =>
    parseDual(params.get(key), fallback);
  const bool = (key: string, fallback: boolean) =>
    parseBoolean(params.get(key), fallback);

  return {
    initialSeed: num('initialSeed', base.initialSeed),
    iterations: num('iterations', base.iterations),
    backgroundBrightness: num(
      'backgroundBrightness',
      base.backgroundBrightness,
    ),
    rectEnabled: bool('rectEnabled', base.rectEnabled),
    rectBrightness: dual('rectBrightness', base.rectBrightness),
    rectAlpha: dual('rectAlpha', base.rectAlpha),
    rectScale: num('rectScale', base.rectScale),
    gridEnabled: bool('gridEnabled', base.gridEnabled),
    gridBrightness: dual('gridBrightness', base.gridBrightness),
    gridAlpha: dual('gridAlpha', base.gridAlpha),
    gridScale: num('gridScale', base.gridScale),
    gridAmount: dual('gridAmount', base.gridAmount),
    gridGap: num('gridGap', base.gridGap),
    colsEnabled: bool('colsEnabled', base.colsEnabled),
    colsBrightness: dual('colsBrightness', base.colsBrightness),
    colsAlpha: dual('colsAlpha', base.colsAlpha),
    colsScale: num('colsScale', base.colsScale),
    colsAmount: dual('colsAmount', base.colsAmount),
    colsGap: num('colsGap', base.colsGap),
    rowsEnabled: bool('rowsEnabled', base.rowsEnabled),
    rowsBrightness: dual('rowsBrightness', base.rowsBrightness),
    rowsAlpha: dual('rowsAlpha', base.rowsAlpha),
    rowsScale: num('rowsScale', base.rowsScale),
    rowsAmount: dual('rowsAmount', base.rowsAmount),
    rowsGap: num('rowsGap', base.rowsGap),
    linesEnabled: bool('linesEnabled', base.linesEnabled),
    linesBrightness: dual('linesBrightness', base.linesBrightness),
    linesAlpha: dual('linesAlpha', base.linesAlpha),
    linesWidth: dual('linesWidth', base.linesWidth),
    spritesEnabled: bool('spritesEnabled', base.spritesEnabled),
    spritesPacks: parseList(
      params.get('spritesPacks'),
      ALL_SPRITES_PACKS,
      base.spritesPacks,
    ),
    spritesRotationEnabled: bool(
      'spritesRotationEnabled',
      base.spritesRotationEnabled,
    ),
    seamlessTextureEnabled: bool(
      'seamlessTextureEnabled',
      base.seamlessTextureEnabled,
    ),
    compositionModes: parseList(
      params.get('compositionModes'),
      ALL_COMPOSITION_MODES,
      base.compositionModes,
    ),
  };
}

/**
 * Serializes every setting into a query string. The result is the exact
 * inverse of `getInitialValues()`'s parsing: each field is written explicitly,
 * so reloading the resulting URL restores the current settings with nothing
 * left to defaults or randomization.
 */
function serializeValues(values: Values): string {
  const bool = (b: boolean): string => (b ? '1' : '0');
  const dual = (d: NumberDual): string => `${d[0]},${d[1]}`;

  const params = new URLSearchParams({
    initialSeed: String(values.initialSeed),
    iterations: String(values.iterations),
    backgroundBrightness: String(values.backgroundBrightness),
    rectEnabled: bool(values.rectEnabled),
    rectBrightness: dual(values.rectBrightness),
    rectAlpha: dual(values.rectAlpha),
    rectScale: String(values.rectScale),
    gridEnabled: bool(values.gridEnabled),
    gridBrightness: dual(values.gridBrightness),
    gridAlpha: dual(values.gridAlpha),
    gridScale: String(values.gridScale),
    gridAmount: dual(values.gridAmount),
    gridGap: String(values.gridGap),
    colsEnabled: bool(values.colsEnabled),
    colsBrightness: dual(values.colsBrightness),
    colsAlpha: dual(values.colsAlpha),
    colsScale: String(values.colsScale),
    colsAmount: dual(values.colsAmount),
    colsGap: String(values.colsGap),
    rowsEnabled: bool(values.rowsEnabled),
    rowsBrightness: dual(values.rowsBrightness),
    rowsAlpha: dual(values.rowsAlpha),
    rowsScale: String(values.rowsScale),
    rowsAmount: dual(values.rowsAmount),
    rowsGap: String(values.rowsGap),
    linesEnabled: bool(values.linesEnabled),
    linesBrightness: dual(values.linesBrightness),
    linesAlpha: dual(values.linesAlpha),
    linesWidth: dual(values.linesWidth),
    spritesEnabled: bool(values.spritesEnabled),
    spritesPacks: values.spritesPacks.join(','),
    spritesRotationEnabled: bool(values.spritesRotationEnabled),
    seamlessTextureEnabled: bool(values.seamlessTextureEnabled),
    compositionModes: values.compositionModes.join(','),
  });

  return params.toString();
}
