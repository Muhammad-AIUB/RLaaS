'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

export function RequestsDonut(props: { allowed: number; blocked: number }) {
  const total = props.allowed + props.blocked;
  const data = [
    { name: 'Allowed', value: props.allowed, color: '#10b981' },
    { name: 'Blocked', value: props.blocked, color: '#ef4444' },
  ];

  return (
    <div className="relative">
      <div className="h-60 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="88%"
              paddingAngle={3}
              stroke="none"
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                borderRadius: 10,
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
                fontSize: 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {/* Center label */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Total
        </p>
        <p className="mt-0.5 text-2xl font-semibold text-slate-900">
          {total.toLocaleString()}
        </p>
      </div>
      {/* Legend */}
      <div className="mt-4 flex items-center justify-center gap-5 text-xs text-slate-600">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: d.color }}
              aria-hidden
            />
            <span className="font-medium text-slate-700">{d.name}</span>
            <span className="text-slate-500">{d.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
