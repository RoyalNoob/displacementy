import {LockButton} from '@/components/ui/LockButton';

type CheckboxesGroupProps = {
  readonly title: string;
  readonly extra?: string;
  readonly children: React.ReactNode;
  readonly locked?: boolean;
  readonly onToggleLock?: () => void;
  /** Accessible name for the lock; defaults to the group title. */
  readonly lockLabel?: string;
};

export function CheckboxesGroup({
  title,
  extra,
  children,
  locked,
  onToggleLock,
  lockLabel,
}: CheckboxesGroupProps) {
  return (
    <div>
      <div className='flex items-center gap-1 pb-1'>
        {onToggleLock && (
          <LockButton
            locked={Boolean(locked)}
            onToggle={onToggleLock}
            label={lockLabel ?? title}
          />
        )}
        <span className='text-sm'>{`${title}:`}</span>
      </div>
      {extra && <div className='pb-1 text-xs text-pink'>{`(${extra})`}</div>}
      <div className='flex flex-wrap gap-2'>{children}</div>
    </div>
  );
}
