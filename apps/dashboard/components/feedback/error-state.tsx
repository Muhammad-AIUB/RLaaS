import { InfoCircleIcon } from '@/components/icons';

export interface ErrorStateProps {
  message: string;
  title?: string;
}

export function ErrorState({
  message,
  title = 'Something went wrong',
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-800"
    >
      <InfoCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-red-700/90">{message}</p>
      </div>
    </div>
  );
}
