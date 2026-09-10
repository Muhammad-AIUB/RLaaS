import clsx from 'clsx';
import { ReactNode } from 'react';
import { formatCount } from '@/lib/format';

export interface RankRowProps {
  label: ReactNode;
  sublabel?: ReactNode;
  value: number;
  /** The largest value in the list; the bar is drawn relative to it. */
  max: number;
  /** Renders the label in mono — use for IPs, endpoints, keys. */
  mono?: boolean;
}

/**
 * One row of a ranked list, with the magnitude drawn as a bar behind it.
 *
 * A plain list gives 9,776 requests and 1 request the same visual weight, which
 * is exactly backwards when one address is 99% of your traffic. The bar makes
 * the distribution readable without a chart.
 */
export function RankRow({ label, sublabel, value, max, mono }: RankRowProps) {
  const share = max > 0 ? Math.max((value / max) * 100, 1.5) : 0;

  return (
    <li className="relative isolate flex items-center justify-between gap-3 px-3 py-2 text-sm">
      <span
        className="absolute inset-y-0 left-0 -z-10 rounded-[4px] bg-slate-100"
        style={{ width: `${share}%` }}
        aria-hidden
      />
      <div className="min-w-0">
        <p
          className={clsx(
            'truncate text-slate-800',
            mono && 'font-mono text-[0.8125rem]',
          )}
        >
          {label}
        </p>
        {sublabel ? (
          <p className="mt-0.5 truncate text-2xs text-slate-500">{sublabel}</p>
        ) : null}
      </div>
      <span className="num shrink-0 font-mono text-xs font-medium text-slate-700">
        {formatCount(value)}
      </span>
    </li>
  );
}
