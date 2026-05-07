export function LoadingState({ label = 'Loading data...' }: { label?: string }) {
  return (
    <div className="rounded-[28px] border border-dashed border-pine/30 bg-white/60 p-10 text-center text-sm text-slate-600">
      {label}
    </div>
  );
}
