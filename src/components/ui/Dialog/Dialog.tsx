import * as RadixDialog from '@radix-ui/react-dialog';
import {Cross2Icon} from '@radix-ui/react-icons';

type DialogProps = {
  readonly title: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly children: React.ReactNode;
};

/**
 * Modal dialog in the app's style (black panel, white border, dimmed backdrop).
 * Controlled: the caller owns `open` (so e.g. keyboard shortcuts can open it).
 * Radix provides focus trap, Esc-to-close, and aria wiring.
 */
export function Dialog({title, open, onOpenChange, children}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className='fixed inset-0 z-40 bg-black/70' />
        <RadixDialog.Content
          className='fixed top-1/2 left-1/2 z-50 max-h-[85dvh] w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto border border-white bg-black p-4 focus:outline-hidden'
          aria-describedby={undefined}
        >
          <div className='flex items-start justify-between gap-4 pb-3'>
            <RadixDialog.Title className='text-lg select-none'>
              {title}
            </RadixDialog.Title>
            <RadixDialog.Close
              className='cursor-default border border-white p-1 text-white outline-hidden hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-sky active:bg-white/30'
              aria-label='Close'
            >
              <Cross2Icon />
            </RadixDialog.Close>
          </div>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
