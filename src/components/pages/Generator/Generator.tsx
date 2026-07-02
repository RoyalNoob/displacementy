import {useEffect, useRef} from 'react';
import {softwareVersion} from '@/constants/softwareVersion';
import {Toaster} from '@/components/ui/Toast';
import {CanvasSection} from './CanvasSection';
import {SettingsSection} from './SettingsSection';
import {useStore} from './store';

export function Generator() {
  // Apply the URL/random values once after mount. Doing this here (rather than
  // at store creation) keeps the first client render equal to the server render
  // so hydration succeeds; the values update immediately afterwards.
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    useStore.getState().initializeValues();
  }, []);

  // App shell: at `lg:` the page is a fixed-viewport layout — the canvas pane
  // scales (no scrollbar) while the output and settings panes scroll
  // independently. Below `lg` it falls back to a normal stacked scrolling page.
  return (
    <div className='flex flex-col lg:h-dvh lg:overflow-hidden'>
      <header className='flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-dashed border-white/20 px-4 py-2'>
        <div className='flex items-baseline gap-2'>
          <h1 className='text-xl select-none'>Displacement Y</h1>
          <span className='text-xs text-white/50'>{`v${softwareVersion}`}</span>
        </div>
        <div className='flex items-center gap-4 text-xs text-white/50'>
          <span>
            Based on 
            <HeaderLink href='https://github.com/satelllte/displacementx'>
              DisplacementX
            </HeaderLink>
            {' '}by{' '}
            <HeaderLink href='https://github.com/satelllte'>
              @satelllte
            </HeaderLink>
            {' '}Modified by{' '}
            <HeaderLink href='https://github.com/RoyalNoob'>
              @RoyalNoob
            </HeaderLink>
          </span>
          <HeaderLink href='https://github.com/RoyalNoob/displacementy'>
            GitHub
          </HeaderLink>
          <HeaderLink href='https://github.com/RoyalNoob/displacementy/releases'>
            Version History
          </HeaderLink>
        </div>
      </header>
      <main className='flex flex-col gap-8 p-4 lg:min-h-0 lg:flex-1 lg:flex-row lg:gap-6 lg:py-2'>
        <div className='relative flex flex-col lg:min-h-0 lg:min-w-0 lg:flex-1'>
          <CanvasSection />
        </div>
        <div className='relative lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1 xl:flex-2'>
          <SettingsSection />
        </div>
      </main>
      <Toaster />
    </div>
  );
}

function HeaderLink({
  href,
  children,
}: {
  readonly href: string;
  readonly children: string;
}) {
  return (
    <a
      className='text-white underline focus:outline-hidden focus-visible:ring-2 focus-visible:ring-sky'
      rel='noopener noreferrer'
      target='_blank'
      href={href}
    >
      {children}
    </a>
  );
}
