import {useId} from 'react';
import clsx from 'clsx';

type InputProps = {
  readonly label: string;
  readonly value: string;
  readonly setValue: (value: string) => void;
  readonly placeholder?: string;
  /** Visually hide the label (kept for screen readers). */
  readonly hideLabel?: boolean;
};

export function Input({
  label,
  value,
  setValue,
  placeholder,
  hideLabel = false,
}: InputProps) {
  const id = useId();
  return (
    <div className='flex w-full flex-col gap-1 text-sm'>
      <label
        htmlFor={id}
        className={clsx('text-white select-none', hideLabel && 'sr-only')}
      >
        {label}
      </label>
      <input
        id={id}
        type='text'
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          setValue(event.target.value);
        }}
        className='border border-white bg-transparent px-2 py-1 text-sm text-white outline-hidden placeholder:text-white/40 focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-1 focus-visible:ring-offset-sky'
      />
    </div>
  );
}
