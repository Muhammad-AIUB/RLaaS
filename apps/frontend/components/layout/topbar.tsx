'use client';

import { HelpIcon, LogoMark, MenuIcon, SearchIcon } from '@/components/icons';
import { LogoutButton } from './logout-button';

export function Topbar({ onOpenNav }: { onOpenNav: () => void }) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/70">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden"
          aria-label="Open navigation"
          onClick={onOpenNav}
        >
          <MenuIcon className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 lg:hidden">
          <LogoMark className="h-7 w-7" />
          <span className="text-sm font-semibold text-slate-900">RLaaS</span>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <div className="hidden md:block">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                placeholder="Search projects, rules…"
                className="h-10 w-64 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
              />
            </div>
          </div>
          <button
            type="button"
            className="hidden h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 sm:inline-flex"
            aria-label="Help"
          >
            <HelpIcon className="h-5 w-5" />
          </button>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
