'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlgorithmPerformanceRecord } from '@/lib/types';

export function AlgorithmBarChart({
  data,
}: {
  data: AlgorithmPerformanceRecord[];
}) {
  return (
    <div className="h-72 sm:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="algorithm"
            tick={{ fontSize: 11, fill: '#64748b' }}
            axisLine={{ stroke: '#e2e8f0' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: 'rgba(99, 102, 241, 0.06)' }}
            contentStyle={{
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
              fontSize: 12,
            }}
            labelStyle={{ color: '#0f172a', fontWeight: 600 }}
          />
          <Bar dataKey="requests" fill="#6366f1" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
