import {useId, useState} from 'react';
import * as RadixSlider from '@radix-ui/react-slider';
import {LockButton} from '@/components/ui/LockButton';
import {type NumberDual} from '@/types';

type SliderBaseProps = {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly locked?: boolean;
  readonly onToggleLock?: () => void;
};

type SliderSoloProps = SliderBaseProps & {
  readonly dual?: false;
  readonly value: number;
  readonly setValue: (value: number) => void;
};

type SliderDualProps = SliderBaseProps & {
  readonly dual: true;
  readonly values: NumberDual;
  readonly setValues: (values: NumberDual) => void;
};

type SliderProps = SliderSoloProps | SliderDualProps;

export function Slider({
  label,
  min,
  max,
  step,
  locked,
  onToggleLock,
  ...dynamicProps
}: SliderProps) {
  const labelId = useId();
  const thumb0Id = useId();
  const thumb1Id = useId();
  return (
    <div className='w-full text-sm select-none'>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-1'>
          {onToggleLock && (
            <LockButton
              locked={Boolean(locked)}
              onToggle={onToggleLock}
              label={label}
            />
          )}
          <label id={labelId}>{label}</label>
        </div>
        <div>
          {dynamicProps.dual ? (
            <>
              <EditableValue
                htmlFor={thumb0Id}
                label={`${label} minimum`}
                value={dynamicProps.values[0]}
                min={min}
                max={Math.min(max, dynamicProps.values[1])}
                step={step}
                setValue={(v) => {
                  dynamicProps.setValues([v, dynamicProps.values[1]]);
                }}
              />
              <span>{` - `}</span>
              <EditableValue
                htmlFor={thumb1Id}
                label={`${label} maximum`}
                value={dynamicProps.values[1]}
                min={Math.max(min, dynamicProps.values[0])}
                max={max}
                step={step}
                setValue={(v) => {
                  dynamicProps.setValues([dynamicProps.values[0], v]);
                }}
              />
            </>
          ) : (
            <EditableValue
              htmlFor={thumb0Id}
              label={label}
              value={dynamicProps.value}
              min={min}
              max={max}
              step={step}
              setValue={dynamicProps.setValue}
            />
          )}
        </div>
      </div>
      <RadixSlider.Root
        className='relative flex h-[20px] items-center'
        min={min}
        max={max}
        step={step}
        value={dynamicProps.dual ? dynamicProps.values : [dynamicProps.value]}
        onValueChange={(values) => {
          if (dynamicProps.dual) {
            dynamicProps.setValues([values[0], values[1]]);
          } else {
            dynamicProps.setValue(values[0]);
          }
        }}
      >
        <RadixSlider.Track className='relative block h-1 grow rounded-full bg-white'>
          <RadixSlider.Range className='absolute h-full rounded-full bg-pink' />
        </RadixSlider.Track>
        <Thumb
          id={thumb0Id}
          labelledBy={labelId}
          ariaLabel={dynamicProps.dual ? `${label} minimum` : undefined}
        />
        {dynamicProps.dual && (
          <Thumb
            id={thumb1Id}
            labelledBy={labelId}
            ariaLabel={`${label} maximum`}
          />
        )}
      </RadixSlider.Root>
    </div>
  );
}

type EditableValueProps = {
  readonly htmlFor: string;
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly setValue: (value: number) => void;
};

/**
 * The slider's numeric readout, click- (or Enter-) editable for typing exact
 * values. Commits on Enter/blur, clamped to `min..max` and snapped to the step
 * grid; Esc cancels.
 */
function EditableValue({
  htmlFor,
  label,
  value,
  min,
  max,
  step,
  setValue,
}: EditableValueProps) {
  const [draft, setDraft] = useState<string | undefined>(undefined);

  const commit = () => {
    if (draft === undefined) return;
    setDraft(undefined);
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(max, Math.max(min, parsed));
    // Snap to the step grid (fix float noise via the step's decimal count).
    const decimals = (String(step).split('.')[1] ?? '').length;
    const snapped = Number(
      (Math.round((clamped - min) / step) * step + min).toFixed(decimals),
    );
    setValue(snapped);
  };

  if (draft !== undefined) {
    return (
      <input
        autoFocus
        type='text'
        inputMode='decimal'
        aria-label={`${label} value`}
        value={draft}
        className='w-14 border border-white bg-black px-1 text-right text-sm text-white outline-hidden focus-visible:ring-2 focus-visible:ring-sky'
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') setDraft(undefined);
        }}
      />
    );
  }

  return (
    <output
      htmlFor={htmlFor}
      tabIndex={0}
      role='button'
      aria-label={`${label} value — press Enter to type`}
      title='Click to type a value'
      className='cursor-text underline decoration-white/30 decoration-dotted underline-offset-2 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-sky'
      onClick={() => {
        setDraft(String(value));
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') setDraft(String(value));
      }}
    >
      {value}
    </output>
  );
}

type ThumbProps = {
  readonly id: string;
  readonly labelledBy: string;
  readonly ariaLabel?: string;
};

function Thumb({id, labelledBy, ariaLabel}: ThumbProps) {
  return (
    <RadixSlider.Thumb
      id={id}
      className='block h-3 w-3 bg-white hover:shadow-[0_0_0_2px] hover:shadow-pink focus:shadow-[0_0_0_2px] focus:shadow-pink focus:outline-hidden'
      // A dual slider has two thumbs sharing one visible label, so give each a
      // distinct accessible name ("… minimum" / "… maximum"); a solo thumb
      // falls back to the visible label.
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel ? undefined : labelledBy}
    />
  );
}
