export function LoadingState({ label = 'Loading data…' }: { label?: string }) {
  return (
    <div className="card p-8">
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <span
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600"
          aria-hidden
        />
        <span>{label}</span>
      </div>
      <div className="mt-6 grid gap-3">
        <div className="skeleton h-4 w-1/3" />
        <div className="skeleton h-4 w-2/3" />
        <div className="skeleton h-4 w-1/2" />
      </div>
    </div>
  );
}
