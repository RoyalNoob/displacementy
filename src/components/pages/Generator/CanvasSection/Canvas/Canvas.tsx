import clsx from 'clsx';
import {forwardRef, useEffect, useRef, useState} from 'react';

type CanvasProps = {
  readonly width: number;
  readonly height: number;
  readonly isRendering: boolean;
  readonly isExporting: boolean;
  readonly isPristine: boolean;
  /** Progress in `0..1` (only meaningful while rendering/exporting). */
  readonly progress: number;
};

const zoomMin = 1;
const zoomMax = 8;

type View = {scale: number; tx: number; ty: number};
const viewReset: View = {scale: 1, tx: 0, ty: 0};

export const Canvas = forwardRef<HTMLCanvasElement, CanvasProps>(
  (
    {width, height, isRendering, isExporting, isPristine, progress},
    forwardedRef,
  ) => {
    const isBusy = isRendering || isExporting;
    const busyLabel = isExporting ? 'Exporting' : 'Rendering';

    // Zoom/pan is purely a CSS transform on the <canvas> — rendering, exports
    // and `putImageData` are unaffected. Wheel zooms around the cursor, drag
    // pans, double-click resets.
    const viewportRef = useRef<HTMLDivElement>(null);
    const [view, setView] = useState<View>(viewReset);
    const viewRef = useRef(view);
    viewRef.current = view;
    const dragRef = useRef<
      {pointerX: number; pointerY: number; tx: number; ty: number} | undefined
    >(undefined);

    // Keep the (zoomed) content covering the viewport: t ∈ [S − S·k, 0].
    const clampView = (v: View, size: number): View => {
      const min = size - size * v.scale;
      return {
        scale: v.scale,
        tx: v.tx < min ? min : v.tx > 0 ? 0 : v.tx,
        ty: v.ty < min ? min : v.ty > 0 ? 0 : v.ty,
      };
    };

    // Native wheel listener: React's `onWheel` is passive, so page scroll
    // could not be suppressed from the React handler.
    useEffect(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        const rect = viewport.getBoundingClientRect();
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;
        const previous = viewRef.current;
        const factor = event.deltaY < 0 ? 1.2 : 1 / 1.2;
        const scale = Math.min(
          zoomMax,
          Math.max(zoomMin, previous.scale * factor),
        );
        // Keep the content point under the cursor fixed while scaling.
        const ratio = scale / previous.scale;
        setView(
          clampView(
            {
              scale,
              tx: px - (px - previous.tx) * ratio,
              ty: py - (py - previous.ty) * ratio,
            },
            rect.width,
          ),
        );
      };
      viewport.addEventListener('wheel', onWheel, {passive: false});
      return () => {
        viewport.removeEventListener('wheel', onWheel);
      };
    }, []);

    // Reset the view when the canvas is replaced (resolution change).
    useEffect(() => {
      setView(viewReset);
    }, [width, height]);

    const zoomed = view.scale > 1;
    return (
      <div
        ref={viewportRef}
        className={clsx(
          // Size is controlled by the wrapper (the app shell fits the square
          // to its pane; below `lg` the wrapper caps the width instead).
          'relative flex aspect-square w-full items-center justify-center overflow-hidden border border-dashed',
          isBusy ? 'border-pink' : 'border-white',
          zoomed ? 'cursor-grab' : 'cursor-default',
        )}
        onDoubleClick={() => {
          setView(viewReset);
        }}
        onPointerDown={(event) => {
          if (!zoomed) return;
          dragRef.current = {
            pointerX: event.clientX,
            pointerY: event.clientY,
            tx: view.tx,
            ty: view.ty,
          };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          const viewport = viewportRef.current;
          if (!drag || !viewport) return;
          const size = viewport.getBoundingClientRect().width;
          setView((current) =>
            clampView(
              {
                scale: current.scale,
                tx: drag.tx + (event.clientX - drag.pointerX),
                ty: drag.ty + (event.clientY - drag.pointerY),
              },
              size,
            ),
          );
        }}
        onPointerUp={() => {
          dragRef.current = undefined;
        }}
        onPointerLeave={() => {
          dragRef.current = undefined;
        }}
      >
        <canvas
          ref={forwardedRef}
          className={clsx(
            'absolute inset-0 max-h-full max-w-full',
            zoomed && '[image-rendering:pixelated]',
          )}
          style={{
            transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
            transformOrigin: '0 0',
          }}
          width={width}
          height={height}
          role='img'
          aria-busy={isBusy}
          aria-label={
            isPristine
              ? `Empty canvas, ${width}×${height}. Render to generate a displacement map.`
              : `Generated displacement map, ${width}×${height}.`
          }
        >
          <span className='absolute inset-0 flex items-center justify-center p-2 text-center text-sm'>
            HTML canvas is not supported in this browser
          </span>
        </canvas>
        {zoomed && (
          <span className='absolute right-1 bottom-1 bg-black/60 px-1 font-mono text-xs text-white/70 select-none'>
            {`${view.scale.toFixed(1)}× — double-click to reset`}
          </span>
        )}
        {/* Sighted-only overlay; the live region below announces the busy state. */}
        <div
          aria-hidden='true'
          className={clsx(
            'absolute flex h-full w-full flex-col items-center justify-center gap-3 bg-black/50',
            !isBusy && 'hidden',
          )}
        >
          <span className='animate-pulse text-lg text-pink uppercase'>
            {`${busyLabel} ${Math.round(progress * 100)}%`}
          </span>
          <div className='h-1 w-1/2 overflow-hidden rounded-full bg-white/20'>
            <div
              className='h-full bg-pink transition-[width] duration-150 ease-out'
              style={{width: `${Math.round(progress * 100)}%`}}
            />
          </div>
        </div>
        <span className='sr-only' role='status' aria-live='polite'>
          {isBusy ? `${busyLabel} displacement map` : ''}
        </span>
      </div>
    );
  },
);

Canvas.displayName = 'Canvas';
