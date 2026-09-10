import clsx from 'clsx';
import { ReactNode } from 'react';

export type MetricTone = 'neutral' | 'success' | 'danger' | 'warning';

/**
 * Tone colors the number itself, and only for tones that report a decision —
 * allowed, blocked, degraded. A neutral count stays ink. The card previously
 * carried a small colored dot beside the label, which spent color on decoration
 * and told a reader nothing they could not get from the label.
 */
const toneValue: Record<MetricTone, string> = {
  neutral: 'text-slate-900',
  success: 'text-emerald-700',
  danger: 'text-red-700',
  warning: 'text-amber-700',
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
  return (
    <div className="card p-4 sm:p-5">
      <p className="eyebrow">{label}</p>
      <p
        className={clsx(
          'num mt-2 text-2xl font-semibold tracking-tight sm:text-[1.75rem]',
          toneValue[tone],
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      {trend ? (
        <div className="mt-2 text-xs font-medium text-slate-600">{trend}</div>
      ) : null}
    </div>
  );
}
