import {useEffect, useId, useRef, useState} from 'react';
import clsx from 'clsx';
import {Button} from '@/components/ui/Button';
import {ColorPicker} from '@/components/ui/ColorPicker';
import {Slider} from '@/components/ui/Slider';
import {rgb} from '@/utils/colors';
import {randomColorRGB} from '@/utils/random';
import {
  colorAt,
  sortStops,
  type Stop,
} from '@/components/pages/Generator/CanvasSection/utils/maps/lut';

const stopsMin = 2;
const stopsMax = 20;

type LutEditorProps = {
  /** Accessible name for the editor ("Color gradient", "Roughness curve", …). */
  readonly label: string;
  /** `color` edits stops with a color picker; `scalar` with a 0–255 value slider. */
  readonly mode: 'color' | 'scalar';
  readonly stops: Stop[];
  readonly setStops: (stops: Stop[]) => void;
};

/**
 * Gradient/curve editor for LUT maps: a preview bar with **draggable stop
 * handles** (drag to reposition, click the bar to add, select to edit/delete).
 * Reusable across LUT maps — color today, scalar maps (roughness etc.) later.
 * Pure view over `stops`; all changes go through `setStops`.
 */
export function LutEditor({label, mode, stops, setStops}: LutEditorProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const [selected, setSelected] = useState<number>(0);
  const [dragging, setDragging] = useState<number | undefined>(undefined);
  const selectedStop = stops[Math.min(selected, stops.length - 1)];

  const sorted = sortStops(stops);
  const gradientCss = `linear-gradient(to right, ${sorted
    .map((s) => `${rgb(s.color)} ${(s.position * 100).toFixed(1)}%`)
    .join(', ')})`;

  const updateStop = (index: number, patch: Partial<Stop>) => {
    setStops(stops.map((s, i) => (i === index ? {...s, ...patch} : s)));
  };

  /** Position (0..1) of a pointer event within the bar. */
  const positionOf = (clientX: number): number => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    const t = (clientX - rect.left) / rect.width;
    return t < 0 ? 0 : t > 1 ? 1 : t;
  };

  // Track an active handle drag at the window level, so the drag keeps
  // following the pointer even when it leaves the handle/bar.
  const draggingRef = useRef(dragging);
  draggingRef.current = dragging;
  const stopsRef = useRef(stops);
  stopsRef.current = stops;
  useEffect(() => {
    if (dragging === undefined) return;
    const onMove = (event: PointerEvent) => {
      const index = draggingRef.current;
      if (index === undefined) return;
      const position = positionOf(event.clientX);
      setStops(
        stopsRef.current.map((s, i) => (i === index ? {...s, position} : s)),
      );
    };
    const onUp = () => {
      setDragging(undefined);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  const addStopAt = (position: number) => {
    if (stops.length >= stopsMax) return;
    // New stop takes the gradient's current color there → no visual jump.
    setStops([...stops, {position, color: colorAt(stops, position)}]);
    setSelected(stops.length);
  };

  const deleteSelected = () => {
    if (stops.length <= stopsMin) return;
    setStops(stops.filter((_, i) => i !== selected));
    setSelected(0);
  };

  const randomize = () => {
    setStops(
      stops.map((s) => {
        if (mode === 'scalar') {
          const v = randomColorRGB().r;
          return {...s, color: {r: v, g: v, b: v}};
        }
        return {...s, color: randomColorRGB()};
      }),
    );
  };

  return (
    <div className='flex w-full max-w-md flex-col gap-2 select-none'>
      <span id={labelId} className='sr-only'>
        {label}
      </span>
      {/* Preview bar: click an empty spot to add a stop. */}
      <div className='pt-3'>
        <div
          ref={barRef}
          className='relative h-9 border border-white'
          style={{background: gradientCss}}
          onPointerDown={(event) => {
            // Only bar clicks (handles stop propagation) add stops.
            addStopAt(positionOf(event.clientX));
          }}
        >
          {stops.map((stop, index) => (
            <div
              key={index}
              role='slider'
              tabIndex={0}
              aria-labelledby={labelId}
              aria-label={`${label} stop ${index + 1} position`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(stop.position * 100)}
              aria-valuetext={`${Math.round(stop.position * 100)}%`}
              className={clsx(
                'absolute -top-3 h-4 w-4 -translate-x-1/2 cursor-ew-resize border focus:outline-hidden',
                index === selected
                  ? 'z-10 border-pink shadow-[0_0_0_2px] shadow-pink'
                  : 'border-white',
              )}
              style={{
                left: `${stop.position * 100}%`,
                background: rgb(stop.color),
              }}
              onPointerDown={(event) => {
                event.stopPropagation(); // don't add a stop underneath
                event.preventDefault(); // no text selection while dragging
                setSelected(index);
                setDragging(index);
              }}
              onKeyDown={(event) => {
                const step =
                  event.key === 'ArrowLeft'
                    ? -0.01
                    : event.key === 'ArrowRight'
                      ? 0.01
                      : 0;
                if (step === 0) return;
                event.preventDefault();
                setSelected(index);
                const next = stop.position + step;
                updateStop(index, {
                  position: next < 0 ? 0 : next > 1 ? 1 : next,
                });
              }}
            />
          ))}
        </div>
      </div>
      {/* Selected-stop editor. */}
      {selectedStop && (
        <div className='flex flex-wrap items-center gap-2'>
          {mode === 'color' ? (
            <ColorPicker
              color={selectedStop.color}
              setColor={(color) => {
                updateStop(selected, {color});
              }}
            />
          ) : (
            <div className='w-40'>
              <Slider
                label='Value'
                min={0}
                max={255}
                step={1}
                value={selectedStop.color.r}
                setValue={(v) => {
                  updateStop(selected, {color: {r: v, g: v, b: v}});
                }}
              />
            </div>
          )}
          <span className='font-mono text-xs text-white/70'>
            {`@ ${Math.round(selectedStop.position * 100)}%`}
          </span>
          <Button disabled={stops.length <= stopsMin} onClick={deleteSelected}>
            Delete
          </Button>
        </div>
      )}
      <div className='flex gap-1'>
        <Button
          disabled={stops.length >= stopsMax}
          onClick={() => {
            // Add in the middle of the widest gap (keyboard-friendly).
            const s = sortStops(stops);
            let bestGap = s[0].position; // gap before the first stop
            let bestPos = s[0].position / 2;
            for (let i = 1; i < s.length; i++) {
              const gap = s[i].position - s[i - 1].position;
              if (gap > bestGap) {
                bestGap = gap;
                bestPos = (s[i].position + s[i - 1].position) / 2;
              }
            }
            if (1 - s[s.length - 1].position > bestGap) {
              bestPos = (1 + s[s.length - 1].position) / 2;
            }
            addStopAt(bestPos);
          }}
        >
          Add stop
        </Button>
        <Button onClick={randomize}>Randomize</Button>
      </div>
      <span className='text-xs text-white/70 italic'>
        Drag stops to reposition; click the bar to add a stop.
      </span>
    </div>
  );
}
