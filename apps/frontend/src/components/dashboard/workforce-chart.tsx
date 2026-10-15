'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const data = [
  { day: 'T2', planned: 82, actual: 78 },
  { day: 'T3', planned: 88, actual: 84 },
  { day: 'T4', planned: 86, actual: 89 },
  { day: 'T5', planned: 92, actual: 87 },
  { day: 'T6', planned: 95, actual: 91 },
  { day: 'T7', planned: 72, actual: 68 },
  { day: 'CN', planned: 64, actual: 62 },
];

export function WorkforceChart() {
  return (
    <div className="h-[250px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 8, left: -24, bottom: 0 }}>
          <defs>
            <linearGradient id="actualHours" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.26} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#dce7f4" strokeDasharray="4 5" vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="day"
            tick={{ fill: '#687994', fontSize: 11, fontWeight: 700 }}
            tickLine={false}
          />
          <YAxis
            axisLine={false}
            tick={{ fill: '#8291a8', fontSize: 10 }}
            tickFormatter={(value: number) => `${value}h`}
            tickLine={false}
          />
          <Tooltip
            cursor={{ stroke: '#bed0e5', strokeDasharray: '3 3' }}
            contentStyle={{
              background: '#183b66',
              border: 0,
              borderRadius: 10,
              color: '#fff',
              fontSize: 12,
              boxShadow: '0 14px 40px rgba(28,70,116,.2)',
            }}
            labelStyle={{ color: '#bfd4ea', marginBottom: 6 }}
          />
          <Area
            dataKey="planned"
            fill="transparent"
            name="Dự kiến"
            stroke="#9bb5d3"
            strokeDasharray="6 5"
            strokeWidth={2}
            type="monotone"
          />
          <Area
            dataKey="actual"
            fill="url(#actualHours)"
            name="Thực tế"
            stroke="#3b82f6"
            strokeWidth={2.5}
            type="monotone"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
