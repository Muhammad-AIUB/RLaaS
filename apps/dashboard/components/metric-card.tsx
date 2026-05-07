import { Panel } from './panel';

export function MetricCard(props: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <Panel className="relative overflow-hidden">
      <div
        className="absolute inset-x-6 top-0 h-1 rounded-full"
        style={{ backgroundColor: props.accent ?? '#235347' }}
      />
      <p className="text-sm uppercase tracking-[0.24em] text-slate-500">
        {props.label}
      </p>
      <p className="mt-4 text-3xl font-semibold text-ink">{props.value}</p>
    </Panel>
  );
}
