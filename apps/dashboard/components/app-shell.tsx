import Link from 'next/link';
import { PropsWithChildren } from 'react';
import { LogoutButton } from './logout-button';

const nav = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/projects', label: 'Projects' },
];

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen">
      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <aside className="hidden w-72 shrink-0 lg:block">
          <div className="sticky top-6 rounded-[32px] border border-white/70 bg-ink p-6 text-white shadow-panel">
            <p className="text-xs uppercase tracking-[0.35em] text-moss">RLaaS Platform</p>
            <h1 className="mt-4 text-3xl font-semibold">Traffic control with context.</h1>
            <p className="mt-4 text-sm text-slate-300">
              Monitor requests, shape limits, and spot abuse patterns before they become outages.
            </p>
            <nav className="mt-8 space-y-2">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-2xl px-4 py-3 text-sm text-slate-200 transition hover:bg-white/10 hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </aside>
        <main className="min-w-0 flex-1">
          <div className="mb-6 flex items-center justify-between rounded-[28px] border border-white/70 bg-white/80 px-6 py-4 shadow-panel backdrop-blur">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-pine">Operator Console</p>
              <p className="mt-2 text-sm text-slate-600">
                Built for fast reads, quick fixes, and confident rate-limit tuning.
              </p>
            </div>
            <LogoutButton />
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
