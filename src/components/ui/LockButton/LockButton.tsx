import clsx from 'clsx';
import {LockClosedIcon, LockOpen1Icon} from '@radix-ui/react-icons';

type LockButtonProps = {
  readonly locked: boolean;
  readonly onToggle: () => void;
  /** Name of the parameter this lock controls, used for the accessible label. */
  readonly label: string;
};

/**
 * A small toggle that locks a parameter out of randomization. Locking does not
 * make the control read-only — it only excludes the value from "Randomize".
 */
export function LockButton({locked, onToggle, label}: LockButtonProps) {
  return (
    <button
      type='button'
      onClick={onToggle}
      aria-pressed={locked}
      aria-label={`${locked ? 'Unlock' : 'Lock'} ${label}`}
      title={
        locked
          ? 'Locked — keeps its value when randomizing'
          : 'Unlocked — changes when randomizing'
      }
      className={clsx(
        'inline-flex h-4 w-4 shrink-0 cursor-default items-center justify-center outline-hidden focus-visible:ring-1 focus-visible:ring-sky focus-visible:ring-offset-1 focus-visible:ring-offset-sky',
        locked ? 'text-pink' : 'text-white/70 hover:text-white',
      )}
    >
      {locked ? <LockClosedIcon /> : <LockOpen1Icon />}
    </button>
  );
}
