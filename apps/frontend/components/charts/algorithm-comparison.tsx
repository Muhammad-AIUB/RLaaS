import {
  algorithmLabel,
  formatCount,
  formatMs,
  formatPercent,
} from '@/lib/format';
import type { AlgorithmPerformanceRecord } from '@/lib/types';

/**
 * Horizontal comparison of the algorithms actually carrying traffic.
 *
 * This was a vertical recharts bar chart. With four categories whose names are
 * long ("Sliding window counter"), a vertical layout has to shrink or rotate
 * the labels, and a y-axis scaled to the largest series leaves the panel almost
 * entirely empty when one algorithm handles 99% of requests — which is the
 * normal shape of this data. Laid out horizontally the labels read at full
 * length, the bars are directly comparable, and each row can carry the latency
 * the panel title promises and the old chart never showed.
 *
 * No charting library: four bars are four divs.
 */
export function AlgorithmComparison({
  data,
}: {
  data: AlgorithmPerformanceRecord[];
}) {
  const rows = [...data]
    .filter((row) => row.requests > 0)
    .sort((a, b) => b.requests - a.requests);

  if (rows.length === 0) {
    return (
      <p className="py-6 text-sm text-slate-500">
        No algorithm has handled a request yet. Traffic through the gateway is
        attributed to whichever rule matched it.
      </p>
    );
  }

  const total = rows.reduce((sum, row) => sum + row.requests, 0);
  const max = rows[0].requests;

  return (
    <div className="space-y-4">
      {rows.map((row) => {
        const width = max > 0 ? Math.max((row.requests / max) * 100, 1) : 0;
        return (
          <div key={row.algorithm}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate text-sm font-medium text-slate-800">
                {algorithmLabel(row.algorithm)}
              </p>
              <div className="flex shrink-0 items-baseline gap-3">
                <span className="num font-mono text-sm text-slate-900">
                  {formatCount(row.requests)}
                </span>
                <span className="num w-14 text-right text-2xs text-slate-500">
                  {formatPercent(total > 0 ? (row.requests / total) * 100 : 0)}
                </span>
              </div>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-slate-700 transition-[width] duration-enter ease-enter"
                style={{ width: `${width}%` }}
              />
            </div>
            <p className="mt-1 text-2xs text-slate-500">
              {formatMs(row.averageResponseTimeMs)} average decision time
              {row.averageRetryAfter > 0
                ? ` · ${formatMs(row.averageRetryAfter)} average retry-after`
                : ''}
            </p>
          </div>
        );
      })}
    </div>
  );
}
