import Link from 'next/link';
import { FileIcon } from '@/components/icons';

export interface EmptyStateProps {
  title: string;
  description: string;
  href?: string;
  actionLabel?: string;
}

export function EmptyState({
  title,
  description,
  href,
  actionLabel,
}: EmptyStateProps) {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-12 text-center sm:py-16">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <FileIcon className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold text-slate-900 sm:text-lg">
        {title}
      </h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-500">
        {description}
      </p>
      {href && actionLabel ? (
        <Link href={href} className="btn-primary mt-5">
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
