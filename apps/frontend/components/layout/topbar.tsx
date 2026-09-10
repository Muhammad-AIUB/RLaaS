'use client';

import { LogoMark, MenuIcon } from '@/components/icons';
import { LogoutButton } from './logout-button';
import { ThemeToggle } from './theme-toggle';

export function Topbar({ onOpenNav }: { onOpenNav: () => void }) {
  return (
    /**
     * Opaque, not translucent. The previous `bg-white/80 backdrop-blur` let
     * page headings ghost through the bar while scrolling — a frosted panel
     * only reads as depth when what's behind it is texture, never text.
     */
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-surface">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-colors duration-state hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50 lg:hidden"
          aria-label="Open navigation"
          onClick={onOpenNav}
        >
          <MenuIcon className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 lg:hidden">
          <LogoMark className="h-6 w-6" />
          <span className="text-sm font-semibold text-slate-900">RLaaS</span>
        </div>

        {/* A search field and a help button used to sit here with no handlers
            behind either. A control that looks clickable and does nothing costs
            more trust than the empty space it filled. */}
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
