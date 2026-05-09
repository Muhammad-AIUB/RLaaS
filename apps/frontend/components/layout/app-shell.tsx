'use client';

import { usePathname } from 'next/navigation';
import { PropsWithChildren, useEffect, useState } from 'react';
import clsx from 'clsx';
import { CloseIcon } from '@/components/icons';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

export function AppShell({ children }: PropsWithChildren) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Close mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <div className="min-h-screen bg-canvas">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white lg:block">
        <Sidebar />
      </aside>

      {/* Mobile drawer */}
      <div
        className={clsx(
          'fixed inset-0 z-40 lg:hidden',
          mobileOpen ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        aria-hidden={!mobileOpen}
      >
        <div
          className={clsx(
            'absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity',
            mobileOpen ? 'opacity-100' : 'opacity-0',
          )}
          onClick={() => setMobileOpen(false)}
        />
        <aside
          className={clsx(
            'absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-slate-200 bg-white shadow-xl transition-transform duration-200 ease-out',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="flex items-center justify-end px-5 pt-4">
            <button
              type="button"
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close navigation"
              onClick={() => setMobileOpen(false)}
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </aside>
      </div>

      {/* Main column */}
      <div className="lg:pl-64">
        <Topbar onOpenNav={() => setMobileOpen(true)} />

        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-7xl animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
