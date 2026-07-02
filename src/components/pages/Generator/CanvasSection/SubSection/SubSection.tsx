import clsx from 'clsx';

export function SubSection({
  disabled,
  title,
  hint,
  children,
}: {
  readonly disabled?: boolean;
  readonly title: string;
  /** Shown as a hover tooltip while the section is disabled. */
  readonly hint?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div
      className={clsx('pt-4', disabled && 'opacity-50')}
      title={disabled ? hint : undefined}
    >
      <h2 className='pb-1'>{title}</h2>
      <div className={clsx(disabled && 'pointer-events-none')}>{children}</div>
    </div>
  );
}
