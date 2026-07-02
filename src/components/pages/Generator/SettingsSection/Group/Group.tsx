import clsx from 'clsx';
import {Switch} from '@/components/ui/Switch';
import {LockButton} from '@/components/ui/LockButton';

type GroupCommonProps = {
  readonly title: string;
  readonly children: React.ReactNode;
};

type GroupBaseProps = GroupCommonProps & {
  withSwitch?: false;
};

type GroupWithSwitchProps = GroupCommonProps & {
  withSwitch: true;
  readonly enabled: boolean;
  readonly setEnabled: (enabled: boolean) => void;
  readonly locked?: boolean;
  readonly onToggleLock?: () => void;
};

type GroupProps = GroupBaseProps | GroupWithSwitchProps;

export function Group(props: GroupProps) {
  return (
    <div>
      <div className='flex flex-row items-center justify-between gap-4 pb-2'>
        <div
          className={clsx(
            'text-sm',
            props.withSwitch && !props.enabled && 'opacity-50',
          )}
        >
          {props.title}
        </div>
        {props.withSwitch && (
          <div className='flex items-center gap-2'>
            {props.onToggleLock && (
              <LockButton
                locked={Boolean(props.locked)}
                onToggle={props.onToggleLock}
                label={props.title}
              />
            )}
            <Switch isOn={props.enabled} setIsOn={props.setEnabled} />
          </div>
        )}
      </div>
      {/* A disabled group auto-collapses to its header row (switch and lock
          stay reachable) — its controls have no effect anyway. */}
      <div
        className={clsx(
          'flex flex-col gap-2 border-l border-white pl-2',
          props.withSwitch && !props.enabled && 'hidden',
        )}
      >
        {props.children}
      </div>
    </div>
  );
}
