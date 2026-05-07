import Link from 'next/link';
import { Panel } from './panel';

export function EmptyState(props: {
  title: string;
  description: string;
  href?: string;
  actionLabel?: string;
}) {
  return (
    <Panel className="text-center">
      <p className="text-xs uppercase tracking-[0.3em] text-pine">Starter State</p>
      <h3 className="mt-3 text-2xl font-semibold text-ink">{props.title}</h3>
      <p className="mx-auto mt-3 max-w-xl text-sm text-slate-600">
        {props.description}
      </p>
      {props.href && props.actionLabel ? (
        <Link
          href={props.href}
          className="mt-6 inline-flex rounded-full bg-pine px-5 py-3 text-sm font-medium text-white"
        >
          {props.actionLabel}
        </Link>
      ) : null}
    </Panel>
  );
}
