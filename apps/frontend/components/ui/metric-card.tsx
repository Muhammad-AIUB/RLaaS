import clsx from 'clsx';
import { ReactNode } from 'react';

export type MetricTone = 'neutral' | 'success' | 'danger' | 'warning' | 'brand';

const toneStyles: Record<MetricTone, { dot: string; text: string }> = {
  neutral: { dot: 'bg-slate-400', text: 'text-slate-700' },
  success: { dot: 'bg-emerald-500', text: 'text-emerald-700' },
  danger: { dot: 'bg-red-500', text: 'text-red-700' },
  warning: { dot: 'bg-amber-500', text: 'text-amber-700' },
  brand: { dot: 'bg-brand-600', text: 'text-brand-700' },
};

export interface MetricCardProps {
  label: string;
  value: string;
  tone?: MetricTone;
  hint?: string;
  trend?: ReactNode;
}

export function MetricCard({
  label,
  value,
  tone = 'neutral',
  hint,
  trend,
}: MetricCardProps) {
  const t = toneStyles[tone];

  return (
    <div className="card p-5 transition hover:shadow-card-hover sm:p-6">
      <div className="flex items-center gap-2">
        <span className={clsx('h-1.5 w-1.5 rounded-full', t.dot)} aria-hidden />
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {label}
        </p>
      </div>
      <p className="mt-3 text-2xl font-semibold text-slate-900 sm:text-3xl">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      {trend ? (
        <div className={clsx('mt-2 text-xs font-medium', t.text)}>{trend}</div>
      ) : null}
    </div>
  );
}
