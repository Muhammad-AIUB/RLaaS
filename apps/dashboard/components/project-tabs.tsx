'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname() ?? '';
  const base = `/projects/${projectId}`;
  const tabs = [
    { href: base, label: 'Overview' },
    { href: `${base}/analytics`, label: 'Analytics' },
    { href: `${base}/rules`, label: 'Rules' },
    { href: `${base}/api-keys`, label: 'API Keys' },
    { href: `${base}/members`, label: 'Members' },
    { href: `${base}/webhooks`, label: 'Webhooks' },
    { href: `${base}/audit-logs`, label: 'Audit' },
  ];

  return (
    <div className="-mx-1 mb-6 overflow-x-auto">
      <nav
        className="inline-flex min-w-full gap-1 border-b border-slate-200 px-1 sm:gap-1.5"
        aria-label="Project sections"
      >
        {tabs.map((tab) => {
          const active =
            tab.href === base
              ? pathname === base
              : pathname === tab.href || pathname.startsWith(tab.href + '/');
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={clsx(
                'whitespace-nowrap rounded-t-lg border-b-2 px-3 py-2.5 text-sm font-medium transition',
                active
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800',
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
