'use client';
import clsx from 'clsx';
import {useRef, useState} from 'react';
import {useStore} from '../store';
import {Button} from '@/components/ui/Button';
import {Checkbox} from '@/components/ui/Checkbox';
import {Input} from '@/components/ui/Input';
import {RadioGroup} from '@/components/ui/RadioGroup';
import {Slider} from '@/components/ui/Slider';
import {SectionTitle} from '../SectionTitle';
import {Canvas} from './Canvas';
import {Gradient} from './Gradient';
import {SubSection} from './SubSection';
import {loadSprites, type DrawProps} from './utils/draw';
import {type RenderRequest, type RenderResponse} from './utils/renderWorker';
import {type ExportRequest, type ExportResponse} from './utils/exportWorker';
import {type MapDepth, type MapKind} from './utils/maps/buildMapsZip';
import {toNormalMapRGBA} from './utils/maps/normalMap';
import {toColorMapRGBA, paletteFromRowRGBA} from './utils/maps/colorMap';
import {drawInvert} from './utils/drawInvert';
import {saveImage} from './utils/saveImage';
import {encodeHeightmap16} from './utils/heightmapPng';
import {encodeHeightmapExr} from './utils/heightmapExr';
import {getCtx2dFromRef} from './utils/getCtx2dFromRef';
import {getCanvasDimensions} from './utils/getCanvasDimensions';

type Resolution = '1024' | '2048' | '4096' | '8192';
type PreviewType = 'original' | 'normal' | 'color';
type BitDepth = '8' | '16' | '32';

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

export function CanvasSection() {
  const [resolution, setResolution] = useState<Resolution>('2048');
  const width = Number(resolution);
  const height = Number(resolution);

  const [isPristine, setIsPristine] = useState<boolean>(true);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [previewType, setPreviewType] = useState<PreviewType>('original');
  const [justCopiedUrl, setJustCopiedUrl] = useState<boolean>(false);
  const [bitDepth, setBitDepth] = useState<BitDepth>('8');
  const [normalStrength, setNormalStrength] = useState<number>(1);

  // Multi-map ZIP export options.
  const [exportOptionsOpen, setExportOptionsOpen] = useState<boolean>(false);
  const [fileBase, setFileBase] = useState<string>(
    `DisplacementY_${width}x${height}`,
  );
  const [includeMaps, setIncludeMaps] = useState<Record<MapKind, boolean>>({
    height: true,
    normal: true,
    color: true,
  });
  // Per-map filename affixes: member = `{prefix}{base}{suffix}.png`.
  const [mapAffixes, setMapAffixes] = useState<
    Record<MapKind, {prefix: string; suffix: string}>
  >({
    height: {prefix: '', suffix: '_height'},
    normal: {prefix: '', suffix: '_normal'},
    color: {prefix: '', suffix: '_color'},
  });
  const [normalDepth, setNormalDepth] = useState<MapDepth>(8);

  // Any long-running canvas work; blocks re-entrant actions and shows the overlay.
  const isBusy = isRendering || isExporting;

  const includedMapKinds = (['height', 'normal', 'color'] as const).filter(
    (kind) => includeMaps[kind],
  );
  // Per-map member filename stem (no extension); falls back so it's never empty.
  const memberName = (kind: MapKind): string => {
    const {prefix, suffix} = mapAffixes[kind];
    return (
      sanitizeFileName(`${prefix}${fileBase}${suffix}`) ||
      `DisplacementY_${kind}`
    );
  };
  const zipName = sanitizeFileName(fileBase) || 'DisplacementY';
  const includedMemberNames = includedMapKinds.map(memberName);
  // Two included maps must not resolve to the same filename (zip key collision).
  const hasNameCollision =
    new Set(includedMemberNames).size !== includedMemberNames.length;
  const canExport = includedMapKinds.length > 0 && !hasNameCollision;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasOriginalPreviewDataUrl = useRef<string | undefined>(undefined);
  const gradientCanvasRef = useRef<HTMLCanvasElement>(null);
  // The most recent render's float height buffer, retained for high-bit-depth
  // export. Independent of preview state; invalidated on resolution change.
  const lastHeightsRef = useRef<
    {data: Float32Array; width: number; height: number} | undefined
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

        // Retain the float height buffer for high-bit-depth export.
        lastHeightsRef.current = {
          data: message.heights,
          width: message.width,
          height: message.height,
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

  // Export height + normal + color maps as a single zip, derived from the retained
  // float buffer (not the 8-bit canvas) and built off the main thread in a Worker.
  const exportMaps = () => {
    const heightmap = lastHeightsRef.current;
    if (!heightmap) return;
    const {data: heights, width: w, height: h} = heightmap;

    // Read the gradient palette (top row) on the main thread — the Worker has no
    // DOM canvas — and pass it along.
    const gradientCtx = getCtx2dFromRef(gradientCanvasRef);
    const {w: gradientWidth} = getCanvasDimensions(gradientCtx);
    const palette = paletteFromRowRGBA(
      gradientCtx.getImageData(0, 0, gradientWidth, 1).data,
    );

    // Zip height depth follows the global selector; 32-bit (EXR) maps to 16 here.
    const heightDepth: MapDepth = bitDepth === '8' ? 8 : 16;

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
    };
    worker.onerror = (event) => {
      worker.terminate();
      setIsExporting(false);
      throw new Error(`Export worker failed: ${event.message}`);
    };

    // Transfer a COPY of the heights (keep the retained buffer intact for future
    // exports / 16-bit download); the palette is freshly built, safe to transfer.
    const heightsCopy = heights.slice();
    const request: ExportRequest = {
      heights: heightsCopy,
      width: w,
      height: h,
      palette,
      normalStrength,
      heightDepth,
      normalDepth,
      include: includeMaps,
      memberNames: {
        height: memberName('height'),
        normal: memberName('normal'),
        color: memberName('color'),
      },
    };
    worker.postMessage(request, [heightsCopy.buffer, palette.buffer]);
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
    setJustCopiedUrl(true);
    setTimeout(() => setJustCopiedUrl(false), 1500);
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

  const togglePreviewFor = (type: PreviewType) => () => {
    quickRender(() => {
      const shouldDrawNonOriginal = previewType === 'original';

      const ctx2d = getCtx2dFromRef(canvasRef);

      if (shouldDrawNonOriginal) {
        // Save the current view (may be inverted) to restore on toggle-off.
        canvasOriginalPreviewDataUrl.current = ctx2d.canvas.toDataURL();

        // Derive the preview from the retained float buffer (same source and math
        // as the map export), not the 8-bit canvas.
        const heightmap = lastHeightsRef.current;
        if (heightmap) {
          const {data, width: w, height: h} = heightmap;
          if (type === 'normal') {
            const rgba = toNormalMapRGBA(data, w, h, normalStrength);
            ctx2d.putImageData(new ImageData(rgba, w, h), 0, 0);
          } else if (type === 'color') {
            const gradientCtx = getCtx2dFromRef(gradientCanvasRef);
            const {w: gradientWidth} = getCanvasDimensions(gradientCtx);
            const palette = paletteFromRowRGBA(
              gradientCtx.getImageData(0, 0, gradientWidth, 1).data,
            );
            const rgba = toColorMapRGBA(data, palette, w, h);
            ctx2d.putImageData(new ImageData(rgba, w, h), 0, 0);
          }
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

      setPreviewType(shouldDrawNonOriginal ? type : 'original');
    });
  };

  const invertDisabled = isPristine || previewType !== 'original';
  const normalDisabled =
    isPristine || (previewType !== 'normal' && previewType !== 'original');
  const colorDisabled =
    isPristine || (previewType !== 'color' && previewType !== 'original');

  return (
    <section>
      <SectionTitle>Output</SectionTitle>
      <div className='flex gap-1'>
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
      <div className='flex flex-wrap gap-1 pt-2'>
        <Button disabled={isBusy} onClick={render}>
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
              : includedMapKinds.length === 0
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
          aria-expanded={exportOptionsOpen}
          onClick={() => {
            setExportOptionsOpen((open) => !open);
          }}
        >
          {`Export options ${exportOptionsOpen ? '▾' : '▸'}`}
        </Button>
        <Button onClick={copyUrl}>
          {justCopiedUrl ? 'Copied!' : 'Copy URL'}
        </Button>
      </div>
      <span className='sr-only' role='status' aria-live='polite'>
        {justCopiedUrl ? 'Shareable URL copied to clipboard' : ''}
      </span>
      {exportOptionsOpen && (
        <div className='mt-2 flex flex-col gap-3 border border-dashed border-white/40 p-3'>
          <p className='text-sm text-white'>Export options (.zip)</p>
          <div className='sm:w-1/2'>
            <Input
              label='Base name (shared)'
              value={fileBase}
              setValue={setFileBase}
            />
          </div>
          <div className='flex flex-col gap-2'>
            <span className='text-sm text-white'>
              Maps — filename is{' '}
              <span className='font-mono'>{'{prefix}{base}{suffix}.png'}</span>
            </span>
            {(['height', 'normal', 'color'] as const).map((kind) => {
              const {prefix, suffix} = mapAffixes[kind];
              const setAffix = (patch: {prefix?: string; suffix?: string}) => {
                setMapAffixes((prev) => ({
                  ...prev,
                  [kind]: {...prev[kind], ...patch},
                }));
              };
              return (
                <div
                  key={kind}
                  className='flex flex-col gap-1 border-l border-white/20 pl-2'
                >
                  <Checkbox
                    label={kind[0].toUpperCase() + kind.slice(1)}
                    isChecked={includeMaps[kind]}
                    setIsChecked={(checked) => {
                      setIncludeMaps((prev) => ({...prev, [kind]: checked}));
                    }}
                  />
                  <div
                    className={clsx(
                      'flex items-end gap-2',
                      !includeMaps[kind] && 'opacity-50',
                    )}
                  >
                    <Input
                      label={`${kind} prefix`}
                      hideLabel
                      placeholder='prefix'
                      value={prefix}
                      setValue={(value) => {
                        setAffix({prefix: value});
                      }}
                    />
                    <Input
                      label={`${kind} suffix`}
                      hideLabel
                      placeholder='suffix'
                      value={suffix}
                      setValue={(value) => {
                        setAffix({suffix: value});
                      }}
                    />
                    <span className='shrink-0 pb-1 font-mono text-xs text-white/70'>
                      {`→ ${memberName(kind)}.png`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className='text-xs'>
            <span className='text-white/50'>Zip: </span>
            <span className='font-mono text-white/70'>{`${zipName}.zip`}</span>
            {includedMapKinds.length === 0 && (
              <span className='pl-2 text-pink'>Select at least one map.</span>
            )}
            {hasNameCollision && (
              <span className='pl-2 text-pink'>
                Two included maps share a filename — make prefixes/suffixes
                unique.
              </span>
            )}
          </div>
          <div className='flex flex-col gap-1'>
            <span className='text-sm text-white'>Normal map bit depth</span>
            <RadioGroup<'8' | '16'>
              aria-label='Normal map bit depth'
              items={[
                {value: '8', label: '8-bit'},
                {value: '16', label: '16-bit'},
              ]}
              value={normalDepth === 16 ? '16' : '8'}
              setValue={(value) => {
                setNormalDepth(value === '16' ? 16 : 8);
              }}
            />
            <span className='text-xs text-white/70 italic'>
              Height depth follows the global Bit depth selector. Color is
              always 8-bit RGB.
            </span>
          </div>
        </div>
      )}
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
          banding). 32-bit float exports a lossless OpenEXR (.exr) for VFX / DCC
          tools (Blender, Nuke, World Machine).
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
      <SubSection
        title='Normal'
        disabled={normalDisabled}
        hint={
          isPristine
            ? 'Render first to enable.'
            : 'Showing another preview — return to the original first.'
        }
      >
        <Button
          disabled={isBusy || normalDisabled}
          onClick={togglePreviewFor('normal')}
        >
          Preview {previewType === 'normal' ? 'original' : 'normal'}
        </Button>
      </SubSection>
      <SubSection
        title='Normal map strength'
        disabled={isPristine}
        hint='Render first to enable.'
      >
        <Slider
          label='Strength'
          min={0.1}
          max={5}
          step={0.1}
          value={normalStrength}
          setValue={setNormalStrength}
        />
        <span className='text-xs text-white/70 italic'>
          Controls relief depth of the exported normal map (and the normal
          preview on next toggle).
        </span>
      </SubSection>
      <SubSection
        title='Color'
        disabled={colorDisabled}
        hint={
          isPristine
            ? 'Render first to enable.'
            : 'Showing another preview — return to the original first.'
        }
      >
        <Button
          disabled={isBusy || colorDisabled}
          onClick={togglePreviewFor('color')}
        >
          Preview {previewType === 'color' ? 'original' : 'color'}
        </Button>
        <Gradient ref={gradientCanvasRef} />
      </SubSection>
    </section>
  );
}
