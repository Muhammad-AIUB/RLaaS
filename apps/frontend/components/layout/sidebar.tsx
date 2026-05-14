'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import {
  ArrowRightIcon,
  type IconComponent,
  LogoMark,
  OverviewIcon,
  ProjectsIcon,
} from '@/components/icons';

interface NavItem {
  href: string;
  label: string;
  icon: IconComponent;
}

const NAV: ReadonlyArray<NavItem> = [
  { href: '/dashboard', label: 'Overview', icon: OverviewIcon },
  { href: '/projects', label: 'Projects', icon: ProjectsIcon },
];

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(href + '/');
}

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={clsx(
        'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
        active
          ? 'bg-brand-50 text-brand-700'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
      )}
    >
      <Icon
        className={clsx(
          'h-5 w-5 shrink-0',
          active ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600',
        )}
      />
      <span>{item.label}</span>
    </Link>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
        <LogoMark className="h-8 w-8" />
        <div className="leading-tight">
          <p className="text-sm font-semibold text-slate-900">RLaaS</p>
          <p className="text-xs text-slate-500">Operator Console</p>
        </div>
      </div>

      <div className="px-3 pb-2">
        <p className="px-3 pb-1 pt-3 text-2xs font-semibold uppercase tracking-wider text-slate-400">
          Navigation
        </p>
        <nav className="space-y-0.5">
          {NAV.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(pathname, item.href)}
              onNavigate={onNavigate}
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
            href="/docs"
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800"
          >
            View docs
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
