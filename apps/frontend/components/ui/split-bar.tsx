import { formatCount, formatPercent } from '@/lib/format';

export interface SplitBarProps {
  allowed: number;
  blocked: number;
  /** Renders the counts and share beneath the bar. */
  showLegend?: boolean;
  className?: string;
}

/**
 * Allowed vs blocked as one proportional bar.
 *
 * A two-slice donut asks the eye to compare arc lengths around a curve; a
 * single bar puts the same split on a straight line where the difference is
 * read instantly. It also encodes magnitude with *length*, so the split still
 * reads for anyone who cannot separate the green from the red.
 */
export function SplitBar({
  allowed,
  blocked,
  showLegend = true,
  className,
}: SplitBarProps) {
  const total = allowed + blocked;
  const blockedShare = total > 0 ? (blocked / total) * 100 : 0;
  const allowedShare = total > 0 ? 100 - blockedShare : 0;

  return (
    <div className={className}>
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
        role="img"
        aria-label={
          total > 0
            ? `${formatCount(allowed)} allowed (${formatPercent(allowedShare)}), ${formatCount(blocked)} blocked (${formatPercent(blockedShare)})`
            : 'No requests recorded yet'
        }
      >
        {total > 0 ? (
          <>
            <span
              className="h-full bg-emerald-500 transition-[width] duration-enter ease-enter"
              style={{ width: `${allowedShare}%` }}
            />
            <span
              className="h-full bg-red-500 transition-[width] duration-enter ease-enter"
              style={{ width: `${blockedShare}%` }}
            />
          </>
        ) : null}
      </div>

      {showLegend ? (
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 text-sm">
          <div className="flex items-baseline gap-2">
            <span className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-full bg-emerald-500" aria-hidden />
            <span className="text-slate-600">Allowed</span>
            <span className="num font-mono font-medium text-slate-900">
              {formatCount(allowed)}
            </span>
            <span className="num text-xs text-slate-500">
              {formatPercent(allowedShare)}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-full bg-red-500" aria-hidden />
            <span className="text-slate-600">Blocked</span>
            <span className="num font-mono font-medium text-slate-900">
              {formatCount(blocked)}
            </span>
            <span className="num text-xs text-slate-500">
              {formatPercent(blockedShare)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
