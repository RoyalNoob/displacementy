'use client';
import clsx from 'clsx';
import {useEffect, useRef, useState} from 'react';
import {useStore} from '../store';
import {Button} from '@/components/ui/Button';
import {Checkbox} from '@/components/ui/Checkbox';
import {Dialog} from '@/components/ui/Dialog';
import {Input} from '@/components/ui/Input';
import {LutEditor} from '@/components/ui/LutEditor';
import {RadioGroup} from '@/components/ui/RadioGroup';
import {Slider} from '@/components/ui/Slider';
import {showToast} from '@/components/ui/Toast';
import {SectionTitle} from '../SectionTitle';
import {Canvas} from './Canvas';
import {SubSection} from './SubSection';
import {loadSprites, type DrawProps} from './utils/draw';
import {type RenderRequest, type RenderResponse} from './utils/renderWorker';
import {type ExportRequest, type ExportResponse} from './utils/exportWorker';
import {MAP_REGISTRY, getMap} from './utils/maps/registry';
import {type MapDepth, type MapDescriptor} from './utils/maps/types';
import {buildLUT, type Stop} from './utils/maps/lut';
import {drawInvert} from './utils/drawInvert';
import {saveImage} from './utils/saveImage';
import {encodeHeightmap16} from './utils/heightmapPng';
import {encodeHeightmapExr} from './utils/heightmapExr';
import {getCtx2dFromRef} from './utils/getCtx2dFromRef';
import {getCanvasDimensions} from './utils/getCanvasDimensions';

type Resolution = '1024' | '2048' | '4096' | '8192';
/** `'original'` (the rendered height) or a map key from the registry. */
type PreviewType = string;
type BitDepth = '8' | '16' | '32';

/** Build a per-map-key record from the registry via `fn`. */
const mapRecord = <T,>(fn: (map: MapDescriptor) => T): Record<string, T> =>
  Object.fromEntries(MAP_REGISTRY.map((map) => [map.key, fn(map)]));

/** Strip the Windows-reserved characters that are illegal in filenames. */
const sanitizeFileName = (name: string): string =>
  name.replace(/[<>:"/\\|?*]/g, '').trim();

/** Timestamp for export filenames, e.g. `2026-07-01-143005`. */
const dateTimeStamp = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0'); // Months are zero-based
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d}-${hh}${mm}${ss}`;
};

/** Maps with an on-canvas preview, in registry order (drives the 1..9 keys). */
const PREVIEWABLE_MAPS = MAP_REGISTRY.filter((map) => map.previewRGBA);

export function CanvasSection() {
  const [resolution, setResolution] = useState<Resolution>('2048');
  const width = Number(resolution);
  const height = Number(resolution);

  const [isPristine, setIsPristine] = useState<boolean>(true);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [previewType, setPreviewType] = useState<PreviewType>('original');
  const [bitDepth, setBitDepth] = useState<BitDepth>('8');

  // Multi-map ZIP export options — all keyed by map registry key.
  const [exportDialogOpen, setExportDialogOpen] = useState<boolean>(false);
  const [cheatsheetOpen, setCheatsheetOpen] = useState<boolean>(false);
  const [fileBase, setFileBase] = useState<string>(
    `DisplacementY_${width}x${height}`,
  );
  const [includeMaps, setIncludeMaps] = useState<Record<string, boolean>>(() =>
    mapRecord((map) => map.defaultInclude),
  );
  // Per-map filename affixes: member = `{prefix}{base}{suffix}.png`.
  const [mapAffixes, setMapAffixes] = useState<
    Record<string, {prefix: string; suffix: string}>
  >(() => mapRecord((map) => ({prefix: '', suffix: map.defaultSuffix})));
  // Per-map param values (e.g. normal `strength`), seeded from registry defaults.
  const [mapParams, setMapParams] = useState<
    Record<string, Record<string, number>>
  >(() =>
    mapRecord((map) =>
      Object.fromEntries(map.params.map((p) => [p.key, p.default])),
    ),
  );
  // Per-map bit depth for maps that expose the choice (`depthMode select8or16`).
  const [mapDepths, setMapDepths] = useState<Record<string, MapDepth>>(() =>
    mapRecord(() => 8),
  );

  // Per-LUT-map gradient stops live in the store (they serialize into the
  // shareable URL); a missing key falls back to the map's default stops.
  const lutStops = useStore((state) => state.lutStops);
  const setLutStops = useStore((state) => state.setLutStops);
  const effectiveStops = (map: MapDescriptor): Stop[] =>
    lutStops[map.key] ?? map.lut?.defaultStops ?? [];
  /** Built LUTs for every LUT map (main thread; passed to Worker/preview). */
  const builtLuts = (): Record<string, Uint8Array> =>
    Object.fromEntries(
      MAP_REGISTRY.filter((map) => map.lut).map((map) => [
        map.key,
        buildLUT(effectiveStops(map), map.lut!.mode === 'scalar' ? 1 : 3),
      ]),
    );

  // Any long-running canvas work; blocks re-entrant actions and shows the overlay.
  const isBusy = isRendering || isExporting;

  // Resolve a map's export depth from its `depthMode`.
  const resolveDepth = (map: MapDescriptor): MapDepth =>
    map.depthMode === 'global'
      ? bitDepth === '8'
        ? 8
        : 16 // 32-bit (EXR) maps to 16 in the zip
      : map.depthMode === 'select8or16'
        ? mapDepths[map.key]
        : 8;

  const includedMapKeys = MAP_REGISTRY.filter((m) => includeMaps[m.key]).map(
    (m) => m.key,
  );
  // Per-map member filename stem (no extension); falls back so it's never empty.
  const memberName = (key: string): string => {
    const {prefix, suffix} = mapAffixes[key];
    return (
      sanitizeFileName(`${prefix}${fileBase}${suffix}`) ||
      `DisplacementY_${key}`
    );
  };
  const zipName = sanitizeFileName(fileBase) || 'DisplacementY';
  const includedMemberNames = includedMapKeys.map(memberName);
  // Two included maps must not resolve to the same filename (zip key collision).
  const hasNameCollision =
    new Set(includedMemberNames).size !== includedMemberNames.length;
  const canExport = includedMapKeys.length > 0 && !hasNameCollision;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasOriginalPreviewDataUrl = useRef<string | undefined>(undefined);
  // The most recent render's float height buffer, retained for high-bit-depth
  // export. Independent of preview state; invalidated on resolution change.
  // `seamless` records whether that render tiled (so derived maps wrap to match).
  const lastHeightsRef = useRef<
    | {data: Float32Array; width: number; height: number; seamless: boolean}
    | undefined
  >(undefined);

  const render = () => {
    setIsPristine(false);
    setIsRendering(true);
    setProgress(0);
    setPreviewType('original');

    const ctx2d = getCtx2dFromRef(canvasRef);
    const state = useStore.getState();

    void (async () => {
      // Decode sprites to transferable ImageBitmaps on the main thread (the
      // Worker has no DOM image loading), then hand the whole render off.
      let sprites: ImageBitmap[] = [];
      if (state.spritesEnabled) {
        const loaded = await loadSprites(state.getSprites());
        // Rasterize each sprite to a fixed square. We must draw the SVG onto a
        // canvas first: `createImageBitmap()` called directly on a dimensionless
        // SVG element yields a fully transparent bitmap (and sprites are drawn
        // into a square anyway).
        const spriteRasterSize = 512;
        sprites = await Promise.all(
          loaded.map(async (img) => {
            const canvas = new OffscreenCanvas(
              spriteRasterSize,
              spriteRasterSize,
            );
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, spriteRasterSize, spriteRasterSize);
            return createImageBitmap(canvas);
          }),
        );
      }

      const props: DrawProps = {
        initialSeed: state.initialSeed,
        iterations: state.iterations,
        backgroundBrightness: state.backgroundBrightness,
        rectEnabled: state.rectEnabled,
        rectBrightness: state.rectBrightness,
        rectAlpha: state.rectAlpha,
        rectScale: state.rectScale,
        gridEnabled: state.gridEnabled,
        gridBrightness: state.gridBrightness,
        gridAlpha: state.gridAlpha,
        gridScale: state.gridScale,
        gridAmount: state.gridAmount,
        gridGap: state.gridGap,
        colsEnabled: state.colsEnabled,
        colsBrightness: state.colsBrightness,
        colsAlpha: state.colsAlpha,
        colsScale: state.colsScale,
        colsAmount: state.colsAmount,
        colsGap: state.colsGap,
        rowsEnabled: state.rowsEnabled,
        rowsBrightness: state.rowsBrightness,
        rowsAlpha: state.rowsAlpha,
        rowsScale: state.rowsScale,
        rowsAmount: state.rowsAmount,
        rowsGap: state.rowsGap,
        linesEnabled: state.linesEnabled,
        linesBrightness: state.linesBrightness,
        linesAlpha: state.linesAlpha,
        linesWidth: state.linesWidth,
        spritesEnabled: state.spritesEnabled,
        sprites,
        spritesRotationEnabled: state.spritesRotationEnabled,
        seamlessTextureEnabled: state.seamlessTextureEnabled,
        compositionModes: state.compositionModes,
      };

      // Run the deterministic CPU-float core off the main thread.
      const renderStartTimeMs = performance.now();
      const worker = new Worker(
        new URL('./utils/renderWorker.ts', import.meta.url),
        {type: 'module'},
      );
      worker.onmessage = (event: MessageEvent<RenderResponse>) => {
        const message = event.data;
        if (message.type === 'progress') {
          setProgress(message.fraction);
          return;
        }

        // Retain the float height buffer for high-bit-depth export, tagged with
        // the seamless flag this render used so derived maps can match it.
        lastHeightsRef.current = {
          data: message.heights,
          width: message.width,
          height: message.height,
          seamless: state.seamlessTextureEnabled,
        };

        ctx2d.putImageData(
          new ImageData(message.rgba, message.width, message.height),
          0,
          0,
        );
        worker.terminate();

        // Minimum "visible" render time to prevent flickering on fast renders.
        const minimumTimeBetweenUpdatesMs = 200;
        const renderTimeMs = performance.now() - renderStartTimeMs;
        if (renderTimeMs < minimumTimeBetweenUpdatesMs) {
          setTimeout(
            () => setIsRendering(false),
            minimumTimeBetweenUpdatesMs - renderTimeMs,
          );
        } else {
          setIsRendering(false);
        }
      };

      worker.onerror = (event) => {
        worker.terminate();
        setIsRendering(false);
        throw new Error(`Render worker failed: ${event.message}`);
      };

      const request: RenderRequest = {props, width, height};
      worker.postMessage(request, sprites);
    })();
  };

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const downloadBytes = (
      bytes: Uint8Array,
      fileName: string,
      mimeType: string,
    ): void => {
      const url = URL.createObjectURL(new Blob([bytes], {type: mimeType}));
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    };

    // 16/32-bit: export the retained float height buffer (always the height map,
    // at full precision — independent of any preview or inversion).
    if (bitDepth === '16' || bitDepth === '32') {
      const heightmap = lastHeightsRef.current;
      if (!heightmap) return;
      const {data, width: w, height: h} = heightmap;
      const base = `DisplacementY_${w}x${h}_${dateTimeStamp()}`;

      if (bitDepth === '16') {
        // 16-bit grayscale PNG: lossless heightmap, 65,536 levels.
        downloadBytes(
          encodeHeightmap16(data, w, h),
          `${base}.png`,
          'image/png',
        );
      } else {
        // 32-bit float OpenEXR: the float buffer written verbatim, no loss.
        downloadBytes(
          encodeHeightmapExr(data, w, h),
          `${base}.exr`,
          'image/x-exr',
        );
      }
      return;
    }

    // 8-bit: the visible canvas as-is (respects the current preview/inversion).
    saveImage({
      canvas,
      fileName: `DisplacementY_${width}x${height}_${dateTimeStamp()}`,
    });
  };

  // Export the selected maps as a single zip, derived from the retained float
  // buffer (not the 8-bit canvas) and built off the main thread in a Worker.
  const exportMaps = () => {
    const heightmap = lastHeightsRef.current;
    if (!heightmap) return;
    const {data: heights, width: w, height: h, seamless} = heightmap;

    // Build each LUT map's table from its stops on the main thread — the
    // Worker receives plain bytes.
    const luts = builtLuts();

    setIsExporting(true);
    setProgress(0);

    const worker = new Worker(
      new URL('./utils/exportWorker.ts', import.meta.url),
      {type: 'module'},
    );
    worker.onmessage = (event: MessageEvent<ExportResponse>) => {
      const message = event.data;
      if (message.type === 'progress') {
        setProgress(message.fraction);
        return;
      }

      const url = URL.createObjectURL(
        new Blob([message.zip], {type: 'application/zip'}),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `${zipName}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      worker.terminate();
      setIsExporting(false);
      showToast(`Exported ${zipName}.zip`);
    };
    worker.onerror = (event) => {
      worker.terminate();
      setIsExporting(false);
      throw new Error(`Export worker failed: ${event.message}`);
    };

    // Transfer a COPY of the heights (keep the retained buffer intact for future
    // exports / 16-bit download). LUTs are tiny (≤768 B) — cloned, not transferred.
    const heightsCopy = heights.slice();
    const request: ExportRequest = {
      heights: heightsCopy,
      width: w,
      height: h,
      luts,
      include: includeMaps,
      depths: mapRecord(resolveDepth),
      params: mapParams,
      seamless,
      memberNames: mapRecord((map) => memberName(map.key)),
    };
    worker.postMessage(request, [heightsCopy.buffer]);
  };

  const copyUrl = () => {
    const query = useStore.getState().getSettingsQuery();
    const url = `${window.location.origin}${window.location.pathname}?${query}`;
    // Reflect the current settings in the address bar...
    window.history.replaceState(null, '', url);
    // ...and put the full shareable URL on the clipboard.
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(url);
    }
    showToast('URL copied to clipboard');
  };

  const quickRender = (callback: () => void) => {
    setIsRendering(true);

    // Put a small timeout to allow the UI to update before canvas takes the main thread over
    setTimeout(() => {
      callback();
      setIsRendering(false);
    }, 20);
  };

  const invert = () => {
    quickRender(() => {
      const ctx2d = getCtx2dFromRef(canvasRef);
      drawInvert(ctx2d);
    });
  };

  const togglePreviewFor = (key: string) => () => {
    quickRender(() => {
      const shouldDrawNonOriginal = previewType === 'original';

      const ctx2d = getCtx2dFromRef(canvasRef);

      if (shouldDrawNonOriginal) {
        // Save the current view (may be inverted) to restore on toggle-off.
        canvasOriginalPreviewDataUrl.current = ctx2d.canvas.toDataURL();

        // Derive the preview from the retained float buffer via the map's own
        // pure function (same source and math as export), not the 8-bit canvas.
        const heightmap = lastHeightsRef.current;
        const descriptor = getMap(key);
        if (heightmap && descriptor.previewRGBA) {
          const {data, width: w, height: h, seamless} = heightmap;
          const rgba = descriptor.previewRGBA({
            heights: data,
            width: w,
            height: h,
            lut: descriptor.lut
              ? buildLUT(
                  effectiveStops(descriptor),
                  descriptor.lut.mode === 'scalar' ? 1 : 3,
                )
              : new Uint8Array(0),
            params: mapParams[key],
            seamless,
          });
          ctx2d.putImageData(new ImageData(rgba, w, h), 0, 0);
        }
      } else {
        // Restore original preview
        const dataUrl = canvasOriginalPreviewDataUrl.current;
        if (dataUrl) {
          const {w, h} = getCanvasDimensions(ctx2d);
          const img = new Image();
          img.src = dataUrl;
          img.onload = () => {
            ctx2d.clearRect(0, 0, w, h);
            ctx2d.drawImage(img, 0, 0, w, h);
            canvasOriginalPreviewDataUrl.current = undefined;
          };
        }
      }

      setPreviewType(shouldDrawNonOriginal ? key : 'original');
    });
  };

  const invertDisabled = isPristine || previewType !== 'original';
  // A map's preview toggle is available only from 'original' or its own preview.
  const previewDisabledFor = (key: string): boolean =>
    isPristine || (previewType !== key && previewType !== 'original');

  // Keyboard shortcuts (guarded while typing). Handler lives in a ref so the
  // window listener registers once but always sees fresh state/closures.
  const shortcutsRef = useRef<(event: KeyboardEvent) => void>(() => {});
  shortcutsRef.current = (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    // Don't hijack keys while the user is typing in a field.
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.closest('input, textarea, [contenteditable="true"]')
    )
      return;

    if (event.key === 'r' || event.key === 'R') {
      if (!isBusy) render();
    } else if (event.key === 'e' || event.key === 'E') {
      setExportDialogOpen(true);
    } else if (event.key === '?') {
      setCheatsheetOpen(true);
    } else if (/^[1-9]$/.test(event.key)) {
      const map = PREVIEWABLE_MAPS[Number(event.key) - 1];
      if (map && !isBusy && !previewDisabledFor(map.key)) {
        togglePreviewFor(map.key)();
      }
    }
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      shortcutsRef.current(event);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <section className='flex flex-col lg:h-full lg:min-h-0'>
      {/* Canvas region: the largest square that fits the pane, no scrollbar.
          The pane is a size container; the wrapper picks min(width, height). */}
      <div className='lg:[container-type:size] lg:min-h-0 lg:flex-1'>
        <div className='mx-auto w-full max-w-xl lg:flex lg:h-full lg:max-w-none lg:items-center lg:justify-center'>
          <div className='w-full lg:w-[min(100cqw,100cqh)]'>
            <Canvas
              ref={canvasRef}
              width={width}
              height={height}
              isRendering={isRendering}
              isExporting={isExporting}
              isPristine={isPristine}
              progress={progress}
            />
          </div>
        </div>
      </div>
      {/* Action row (fixed, between canvas and the scrollable output). */}
      <div className='flex flex-wrap gap-1 py-2'>
        <Button disabled={isBusy} title='Shortcut: R' onClick={render}>
          Render
        </Button>
        <Button
          disabled={isPristine || isBusy}
          title={isPristine ? 'Render first to enable download' : undefined}
          onClick={download}
        >
          Download
        </Button>
        <Button
          disabled={isPristine || isBusy || !canExport}
          title={
            isPristine
              ? 'Render first to enable export'
              : includedMapKeys.length === 0
                ? 'Select at least one map in Export options'
                : hasNameCollision
                  ? 'Two maps share a filename — make them unique in Export options'
                  : 'Export the selected maps as a .zip'
          }
          onClick={exportMaps}
        >
          Export maps (.zip)
        </Button>
        <Button
          title='Shortcut: E'
          onClick={() => {
            setExportDialogOpen(true);
          }}
        >
          Export options…
        </Button>
        <Button onClick={copyUrl}>Copy URL</Button>
        <Button
          title='Keyboard shortcuts'
          aria-label='Keyboard shortcuts'
          onClick={() => {
            setCheatsheetOpen(true);
          }}
        >
          ?
        </Button>
      </div>
      {/* Output region: scrolls independently of the canvas and settings. */}
      <div className='lg:min-h-0 lg:flex-[0_0_40%] lg:overflow-y-auto lg:border-t lg:border-dashed lg:border-white/20 lg:pr-1'>
        <SectionTitle>Output</SectionTitle>
        <SubSection title='Resolution'>
          <RadioGroup<Resolution>
            aria-label='Resolution'
            items={[
              {value: '1024', label: '1024x1024'},
              {value: '2048', label: '2048x2048'},
              {value: '4096', label: '4096x4096'},
              {value: '8192', label: '8192x8192'},
            ]}
            value={resolution}
            setValue={(value) => {
              // Changing resolution resets the canvas, so the retained height
              // buffer (and any preview) no longer matches — invalidate them.
              setResolution(value);
              setIsPristine(true);
              setPreviewType('original');
              lastHeightsRef.current = undefined;
              // Keep the default filename base in sync with the new resolution.
              setFileBase(`DisplacementY_${value}x${value}`);
            }}
          />
          <span className='text-xs text-pink italic'>
            Please note that changing the resolution resets canvas!
          </span>
        </SubSection>
        <SubSection title='Bit depth'>
          <RadioGroup<BitDepth>
            aria-label='Export bit depth'
            items={[
              {value: '8', label: '8-bit'},
              {value: '16', label: '16-bit'},
              {value: '32', label: '32-bit float'},
            ]}
            value={bitDepth}
            setValue={setBitDepth}
          />
          <span className='text-xs text-white/70 italic'>
            16-bit exports the grayscale height map at full precision (no
            banding). 32-bit float exports a lossless OpenEXR (.exr) for VFX /
            DCC tools (Blender, Nuke, World Machine).
          </span>
        </SubSection>
        <SubSection
          title='Inversion'
          disabled={invertDisabled}
          hint={
            isPristine
              ? 'Render first to enable.'
              : 'Return to the original preview to enable.'
          }
        >
          <Button disabled={isBusy || invertDisabled} onClick={invert}>
            Invert
          </Button>
        </SubSection>
        {/* One card per registry map: include, preview, params, LUT editor. */}
        <div className='flex flex-col gap-2 pt-4'>
          {MAP_REGISTRY.map((map) => (
            <div
              key={map.key}
              className='flex flex-col gap-2 border border-dashed border-white/20 p-2'
            >
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <h2 className='select-none'>{map.label}</h2>
                <Checkbox
                  label='Include in export'
                  isChecked={includeMaps[map.key]}
                  setIsChecked={(checked) => {
                    setIncludeMaps((prev) => ({...prev, [map.key]: checked}));
                  }}
                />
              </div>
              {map.previewRGBA && (
                <div
                  title={
                    previewDisabledFor(map.key)
                      ? isPristine
                        ? 'Render first to enable.'
                        : 'Showing another preview — return to the original first.'
                      : undefined
                  }
                >
                  <Button
                    disabled={isBusy || previewDisabledFor(map.key)}
                    onClick={togglePreviewFor(map.key)}
                  >
                    Preview{' '}
                    {previewType === map.key
                      ? 'original'
                      : map.label.toLowerCase()}
                  </Button>
                </div>
              )}
              {map.params.map((param) => (
                <Slider
                  key={param.key}
                  label={param.label}
                  min={param.min}
                  max={param.max}
                  step={param.step}
                  value={mapParams[map.key][param.key]}
                  setValue={(value) => {
                    setMapParams((prev) => ({
                      ...prev,
                      [map.key]: {...prev[map.key], [param.key]: value},
                    }));
                  }}
                />
              ))}
              {/* LUT maps get their stop editor here; changes apply on the next
                  preview toggle / export (stops persist via Copy-URL). */}
              {map.lut && (
                <LutEditor
                  label={`${map.label} gradient`}
                  mode={map.lut.mode}
                  stops={effectiveStops(map)}
                  setStops={(stops) => {
                    setLutStops(map.key, stops);
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
      {/* Export configuration dialog. */}
      <Dialog
        title='Export options (.zip)'
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
      >
        <div className='flex flex-col gap-3'>
          <div className='sm:w-1/2'>
            <Input
              label='Base name (shared)'
              value={fileBase}
              setValue={setFileBase}
            />
          </div>
          <div className='flex flex-col gap-3'>
            <span className='text-sm text-white'>
              Maps — filename is{' '}
              <span className='font-mono'>{'{prefix}{base}{suffix}.png'}</span>
            </span>
            {MAP_REGISTRY.map((map) => {
              const {prefix, suffix} = mapAffixes[map.key];
              const setAffix = (patch: {prefix?: string; suffix?: string}) => {
                setMapAffixes((prev) => ({
                  ...prev,
                  [map.key]: {...prev[map.key], ...patch},
                }));
              };
              const included = includeMaps[map.key];
              return (
                <div
                  key={map.key}
                  className='flex flex-col gap-1 border-l border-white/20 pl-2'
                >
                  <Checkbox
                    label={map.label}
                    isChecked={included}
                    setIsChecked={(checked) => {
                      setIncludeMaps((prev) => ({...prev, [map.key]: checked}));
                    }}
                  />
                  <div
                    className={clsx(
                      'flex flex-col gap-1',
                      !included && 'opacity-50',
                    )}
                  >
                    <div className='flex items-end gap-2'>
                      <Input
                        label={`${map.key} prefix`}
                        hideLabel
                        placeholder='prefix'
                        value={prefix}
                        setValue={(value) => {
                          setAffix({prefix: value});
                        }}
                      />
                      <Input
                        label={`${map.key} suffix`}
                        hideLabel
                        placeholder='suffix'
                        value={suffix}
                        setValue={(value) => {
                          setAffix({suffix: value});
                        }}
                      />
                      <span className='shrink-0 pb-1 font-mono text-xs text-white/70'>
                        {`→ ${memberName(map.key)}.png`}
                      </span>
                    </div>
                    {map.depthMode === 'select8or16' && (
                      <RadioGroup<'8' | '16'>
                        aria-label={`${map.label} bit depth`}
                        items={[
                          {value: '8', label: '8-bit'},
                          {value: '16', label: '16-bit'},
                        ]}
                        value={mapDepths[map.key] === 16 ? '16' : '8'}
                        setValue={(value) => {
                          setMapDepths((prev) => ({
                            ...prev,
                            [map.key]: value === '16' ? 16 : 8,
                          }));
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className='text-xs'>
            <span className='text-white/50'>Zip: </span>
            <span className='font-mono text-white/70'>{`${zipName}.zip`}</span>
            {includedMapKeys.length === 0 && (
              <span className='pl-2 text-pink'>Select at least one map.</span>
            )}
            {hasNameCollision && (
              <span className='pl-2 text-pink'>
                Two included maps share a filename — make prefixes/suffixes
                unique.
              </span>
            )}
          </div>
          <span className='text-xs text-white/70 italic'>
            Height depth follows the global Bit depth selector. Color is always
            8-bit RGB.
          </span>
          <div className='flex gap-1 pt-1'>
            <Button
              disabled={isPristine || isBusy || !canExport}
              title={isPristine ? 'Render first to enable export' : undefined}
              onClick={() => {
                setExportDialogOpen(false);
                exportMaps();
              }}
            >
              Export maps (.zip)
            </Button>
          </div>
        </div>
      </Dialog>
      {/* Keyboard shortcuts cheatsheet. */}
      <Dialog
        title='Keyboard shortcuts'
        open={cheatsheetOpen}
        onOpenChange={setCheatsheetOpen}
      >
        <table className='w-full text-sm'>
          <tbody>
            {[
              ['R', 'Render'],
              ['E', 'Open export options'],
              ...PREVIEWABLE_MAPS.map((map, i) => [
                String(i + 1),
                `Toggle ${map.label.toLowerCase()} preview`,
              ]),
              ['?', 'This cheatsheet'],
              ['Esc', 'Close dialog'],
            ].map(([key, action]) => (
              <tr key={key}>
                <td className='w-16 py-1 pr-4'>
                  <kbd className='border border-white/40 px-1.5 py-0.5 font-mono text-xs'>
                    {key}
                  </kbd>
                </td>
                <td className='py-1 text-white/80'>{action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Dialog>
    </section>
  );
}
