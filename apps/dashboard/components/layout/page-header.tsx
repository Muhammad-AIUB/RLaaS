import Link from 'next/link';
import { ReactNode } from 'react';
import { ChevronRightIcon } from '@/components/icons';

export interface Crumb {
  href?: string;
  label: string;
}

export interface PageHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  crumbs?: Crumb[];
  actions?: ReactNode;
  meta?: ReactNode;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  crumbs,
  actions,
  meta,
}: PageHeaderProps) {
  return (
    <header className="mb-6">
      {crumbs && crumbs.length > 0 ? (
        <nav
          aria-label="Breadcrumb"
          className="mb-2 flex items-center gap-1 text-xs text-slate-500"
        >
          {crumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-slate-700">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-slate-700">{crumb.label}</span>
              )}
              {i < crumbs.length - 1 ? (
                <ChevronRightIcon className="h-3 w-3 text-slate-300" />
              ) : null}
            </span>
          ))}
        </nav>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {meta ? <div className="mt-4">{meta}</div> : null}
    </header>
  );
}
