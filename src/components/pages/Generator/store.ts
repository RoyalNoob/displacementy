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
import {
  encodeStops,
  decodeStops,
  type Stop,
} from './CanvasSection/utils/maps/lut';

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
  /**
   * Per-LUT-map gradient stops, keyed by map key (e.g. `color`). A missing key
   * means "use the map's default stops" — so the record only carries what the
   * user has customized. Not lockable; excluded from Randomize-all (the
   * `LutEditor` has its own Randomize).
   */
  lutStops: Record<string, Stop[]>;
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
  setLutStops: (mapKey: string, stops: Stop[]) => void;
};

type ComputedValues = {
  getSprites: () => HTMLImageElement[];
  getSettingsQuery: () => string;
};

type Actions = {
  /**
   * Resolves the real initial values (URL query params, or a fresh random set
   * when there are none) and applies them. Must be called from a client-side
   * effect after mount — never during render — so that the server-rendered HTML
   * and the first client render both show the deterministic defaults and React
   * can hydrate without a mismatch.
   */
  initializeValues: () => void;
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

/**
 * Every setting that `randomize()` assigns a random value to — i.e. everything
 * in `Values` except `seamlessTextureEnabled` (which is never randomized). These
 * are the parameters that can be locked. `as const satisfies (keyof Values)[]`
 * keeps the list and the `LockableKey` type in sync and rejects typos.
 * Declared above `create()` so it is initialized before the store initializer
 * (which calls `allUnlocked()`) runs.
 */
export const LOCKABLE_KEYS = [
  'initialSeed',
  'iterations',
  'backgroundBrightness',
  'rectEnabled',
  'rectBrightness',
  'rectAlpha',
  'rectScale',
  'gridEnabled',
  'gridBrightness',
  'gridAlpha',
  'gridScale',
  'gridAmount',
  'gridGap',
  'colsEnabled',
  'colsBrightness',
  'colsAlpha',
  'colsScale',
  'colsAmount',
  'colsGap',
  'rowsEnabled',
  'rowsBrightness',
  'rowsAlpha',
  'rowsScale',
  'rowsAmount',
  'rowsGap',
  'linesEnabled',
  'linesBrightness',
  'linesAlpha',
  'linesWidth',
  'spritesEnabled',
  'spritesPacks',
  'spritesRotationEnabled',
  'compositionModes',
] as const satisfies (keyof Values)[];

export type LockableKey = (typeof LOCKABLE_KEYS)[number];
export type Locks = Record<LockableKey, boolean>;

type LockState = {
  /** Which parameters are excluded from randomization. */
  locks: Locks;
  toggleLock: (key: LockableKey) => void;
  setLock: (key: LockableKey, value: boolean) => void;
};

export const useStore = create<
  Values & Setters & ComputedValues & Actions & LockState
>((set, get) => ({
  // Values
  // ---
  // Always start from the deterministic defaults so SSR and the first client
  // render match. The real values (URL params or a random set) are applied
  // client-side via `initializeValues()` after hydration.
  ...defaultValues(),
  locks: allUnlocked(),
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
  setLutStops(mapKey: string, stops: Stop[]) {
    set((state) => ({lutStops: {...state.lutStops, [mapKey]: stops}}));
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
    const state = get();
    return serializeValues(state, state.locks);
  },
  // Actions
  // ---
  initializeValues() {
    set(() => getInitialValues());
  },
  toggleLock(key: LockableKey) {
    set((state) => ({locks: {...state.locks, [key]: !state.locks[key]}}));
  },
  setLock(key: LockableKey, value: boolean) {
    set((state) => ({locks: {...state.locks, [key]: value}}));
  },
  randomize() {
    set((state) => applyLocks(randomValues(), state.locks));
  },
  randomizeRect() {
    set((state) =>
      applyLocks(
        {
          rectBrightness: randDualSetting(rectBrightness),
          rectAlpha: randDualSetting(rectAlpha),
          rectScale: randSetting(rectScale),
        },
        state.locks,
      ),
    );
  },
  randomizeGrid() {
    set((state) =>
      applyLocks(
        {
          gridBrightness: randDualSetting(gridBrightness),
          gridAlpha: randDualSetting(gridAlpha),
          gridScale: randSetting(gridScale),
          gridAmount: randDualSetting(gridAmount),
          gridGap: randSetting(gridGap),
        },
        state.locks,
      ),
    );
  },
  randomizeCols() {
    set((state) =>
      applyLocks(
        {
          colsBrightness: randDualSetting(colsBrightness),
          colsAlpha: randDualSetting(colsAlpha),
          colsScale: randSetting(colsScale),
          colsAmount: randDualSetting(colsAmount),
          colsGap: randSetting(colsGap),
        },
        state.locks,
      ),
    );
  },
  randomizeRows() {
    set((state) =>
      applyLocks(
        {
          rowsBrightness: randDualSetting(rowsBrightness),
          rowsAlpha: randDualSetting(rowsAlpha),
          rowsScale: randSetting(rowsScale),
          rowsAmount: randDualSetting(rowsAmount),
          rowsGap: randSetting(rowsGap),
        },
        state.locks,
      ),
    );
  },
  randomizeLines() {
    set((state) =>
      applyLocks(
        {
          linesBrightness: randDualSetting(linesBrightness),
          linesAlpha: randDualSetting(linesAlpha),
          linesWidth: randDualSetting(linesWidth),
        },
        state.locks,
      ),
    );
  },
  randomizeSprites() {
    set((state) =>
      applyLocks(
        {
          spritesPacks: randSpritesPacks(),
          spritesRotationEnabled: randomBoolean(),
        },
        state.locks,
      ),
    );
  },
  randomizeCompositionModes() {
    set((state) =>
      applyLocks({compositionModes: randCompositionModes()}, state.locks),
    );
  },
}));

/** A fresh lock map with every lockable parameter unlocked. */
function allUnlocked(): Locks {
  const locks = {} as Locks;
  for (const key of LOCKABLE_KEYS) locks[key] = false;
  return locks;
}

/**
 * Filters a would-be randomization patch down to the lockable keys that are
 * currently unlocked. Keys that are locked (or not lockable, e.g.
 * `seamlessTextureEnabled`) are dropped, so a `set()` of the result leaves them
 * untouched. `Object.assign` with a computed key sidesteps TypeScript's
 * indexed-union assignment limitation while staying type-safe at the boundary.
 */
function applyLocks(patch: Partial<Values>, locks: Locks): Partial<Values> {
  const out: Partial<Values> = {};
  for (const key of LOCKABLE_KEYS) {
    if (key in patch && !locks[key]) {
      Object.assign(out, {[key]: patch[key]});
    }
  }
  return out;
}

function randSetting(setting: SettingConstant): number {
  return randomInteger(setting.min, setting.max);
}

function randDualSetting(setting: SettingDualConstant): NumberDual {
  const a = randomInteger(setting.min, setting.max);
  const b = randomInteger(setting.min, setting.max);
  // Always ordered [lo, hi] — the range slider and its type-in editing clamp
  // against the other end and rely on the order.
  return a <= b ? [a, b] : [b, a];
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
    // Empty = per-map defaults. Randomize-all never reaches this key anyway:
    // `applyLocks` passes only LOCKABLE_KEYS through.
    lutStops: {},
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
    lutStops: {},
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
  // Normalize to [lo, hi] — URLs written before duals were ordered (or edited
  // by hand) may carry a reversed pair.
  return parts[0] <= parts[1] ? [parts[0], parts[1]] : [parts[1], parts[0]];
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
 * Resolves the values to apply on the client after mount (via the
 * `initializeValues` action). When the page is opened with query parameters,
 * each known setting is read from the URL (falling back to its default when
 * absent). When opened with no parameters at all, everything is randomized —
 * matching the "fresh pattern on every refresh" behavior. The `window` guard is
 * defensive; this is only ever called client-side.
 */
function getInitialValues(): Values & {locks: Locks} {
  if (typeof window === 'undefined') {
    return {...defaultValues(), locks: allUnlocked()};
  }

  const params = new URLSearchParams(window.location.search);
  if ([...params.keys()].length === 0) {
    return {...randomValues(), locks: allUnlocked()};
  }

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
    lutStops: parseLutStops(params),
    locks: parseLocks(params.get('locks')),
  };
}

/**
 * Collects every `lut_<mapkey>` param into the stops record. Keys are read
 * generically (not validated against the map registry) so the store stays
 * decoupled from it; unknown/malformed entries are simply dropped.
 */
function parseLutStops(params: URLSearchParams): Record<string, Stop[]> {
  const lutStops: Record<string, Stop[]> = {};
  for (const [key, value] of params.entries()) {
    if (!key.startsWith('lut_')) continue;
    const stops = decodeStops(value);
    if (stops) lutStops[key.slice('lut_'.length)] = stops;
  }
  return lutStops;
}

/**
 * Parses the `locks` query param — a comma-separated list of locked parameter
 * names — into a full lock map. Unknown names are ignored (validated against
 * `LOCKABLE_KEYS`); an absent or empty param means everything is unlocked.
 */
function parseLocks(raw: string | null): Locks {
  const locks = allUnlocked();
  if (!raw) return locks;
  const items = raw.split(',').map((p) => p.trim());
  for (const key of LOCKABLE_KEYS) {
    if (items.includes(key)) locks[key] = true;
  }
  return locks;
}

/**
 * Serializes every setting into a query string. The result is the exact
 * inverse of `getInitialValues()`'s parsing: each field is written explicitly,
 * so reloading the resulting URL restores the current settings with nothing
 * left to defaults or randomization.
 */
function serializeValues(values: Values, locks: Locks): string {
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
    locks: LOCKABLE_KEYS.filter((key) => locks[key]).join(','),
  });

  // Customized LUT stops only (a missing key means "map defaults").
  for (const [mapKey, stops] of Object.entries(values.lutStops)) {
    params.set(`lut_${mapKey}`, encodeStops(stops));
  }

  return params.toString();
}
