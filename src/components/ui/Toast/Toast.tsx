import {useEffect} from 'react';
import {create} from 'zustand';

type ToastState = {
  message: string | undefined;
  /** Bumped per show() so repeating the same message restarts the timer. */
  nonce: number;
  show: (message: string) => void;
  clear: () => void;
};

const useToastStore = create<ToastState>((set) => ({
  message: undefined,
  nonce: 0,
  show(message: string) {
    set((state) => ({message, nonce: state.nonce + 1}));
  },
  clear() {
    set(() => ({message: undefined}));
  },
}));

/** Show a transient corner toast (e.g. "URL copied"). Callable from anywhere. */
export function showToast(message: string) {
  useToastStore.getState().show(message);
}

const dismissAfterMs = 2500;

/**
 * Fixed bottom-right toast host; mount once in the app shell. A `status` live
 * region, so screen readers announce messages too.
 */
export function Toaster() {
  const message = useToastStore((state) => state.message);
  const nonce = useToastStore((state) => state.nonce);
  const clear = useToastStore((state) => state.clear);

  useEffect(() => {
    if (message === undefined) return;
    const timer = setTimeout(clear, dismissAfterMs);
    return () => {
      clearTimeout(timer);
    };
  }, [message, nonce, clear]);

  return (
    <div
      role='status'
      aria-live='polite'
      className='pointer-events-none fixed right-4 bottom-4 z-50'
    >
      {message !== undefined && (
        <div className='border border-white bg-black px-3 py-2 text-sm text-white shadow-[0_0_0_1px] shadow-black select-none'>
          {message}
        </div>
      )}
    </div>
  );
}
