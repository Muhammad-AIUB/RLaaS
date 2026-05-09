'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { PropsWithChildren, useEffect, useState } from 'react';
import clsx from 'clsx';
import { LogoutButton } from './logout-button';

type IconComponent = (props: { className?: string }) => React.ReactElement;

type NavItem = {
  href: string;
  label: string;
  icon: IconComponent;
};

const Icon = {
  Overview: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 13h8V3H3z" />
      <path d="M13 21h8V11h-8z" />
      <path d="M3 21h8v-6H3z" />
      <path d="M13 9h8V3h-8z" />
    </svg>
  ),
  Projects: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  ),
  Menu: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className={className}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),
  Close: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className={className}>
      <path d="M6 6l12 12M6 18L18 6" />
    </svg>
  ),
  Logo: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#g)" />
      <path d="M7 12h10M7 8h10M7 16h6" stroke="white" strokeWidth="1.75" strokeLinecap="round" />
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="24" y2="24">
          <stop stopColor="#6366f1" />
          <stop offset="1" stopColor="#4338ca" />
        </linearGradient>
      </defs>
    </svg>
  ),
  Search: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  ),
  Help: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7" />
      <path d="M12 17h.01" />
    </svg>
  ),
};

const nav: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: Icon.Overview },
  { href: '/projects', label: 'Projects', icon: Icon.Projects },
];

function NavLink({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick?: () => void;
}) {
  const ActiveIcon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={clsx(
        'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
        active
          ? 'bg-brand-50 text-brand-700'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
      )}
    >
      <ActiveIcon
        className={clsx(
          'h-5 w-5 shrink-0',
          active ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600',
        )}
      />
      <span>{item.label}</span>
    </Link>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
        <Icon.Logo className="h-8 w-8" />
        <div className="leading-tight">
          <p className="text-sm font-semibold text-slate-900">RLaaS</p>
          <p className="text-xs text-slate-500">Operator Console</p>
        </div>
      </div>

      <div className="px-3 pb-2">
        <p className="px-3 pt-3 pb-1 text-2xs font-semibold uppercase tracking-wider text-slate-400">
          Navigation
        </p>
        <nav className="space-y-0.5">
          {nav.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={pathname === item.href || pathname?.startsWith(item.href + '/')}
              onClick={onNavigate}
            />
          ))}
        </nav>
      </div>

      <div className="mt-auto p-4">
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-brand-50 to-white p-4">
          <p className="text-sm font-semibold text-slate-900">
            Need help getting started?
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Browse rule templates and best practices.
          </p>
          <a
            href="#"
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800"
          >
            View docs
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: PropsWithChildren) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile drawer open
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
        <SidebarContent />
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
          <div className="flex items-center justify-between px-5 pt-4">
            <span className="sr-only">Navigation</span>
            <button
              type="button"
              className="ml-auto rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close navigation"
              onClick={() => setMobileOpen(false)}
            >
              <Icon.Close className="h-5 w-5" />
            </button>
          </div>
          <SidebarContent onNavigate={() => setMobileOpen(false)} />
        </aside>
      </div>

      {/* Main column */}
      <div className="lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/70">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Icon.Menu className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2 lg:hidden">
              <Icon.Logo className="h-7 w-7" />
              <span className="text-sm font-semibold text-slate-900">RLaaS</span>
            </div>

            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <div className="hidden md:block">
                <div className="relative">
                  <Icon.Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    placeholder="Search projects, rules…"
                    className="h-10 w-64 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/25 focus:border-brand-500"
                  />
                </div>
              </div>
              <button
                type="button"
                className="hidden h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 sm:inline-flex"
                aria-label="Help"
              >
                <Icon.Help className="h-5 w-5" />
              </button>
              <LogoutButton />
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-7xl animate-fade-in">{children}</div>
        </main>
      </div>
    </div>
  );
}
