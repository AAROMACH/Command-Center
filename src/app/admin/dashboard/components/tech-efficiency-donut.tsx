'use client';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

const data = [
  { name: 'On Time', value: 85 },
  { name: 'Late', value: 8 },
  { name: 'Pending', value: 7 },
];

const COLORS = ['var(--brand-red)', 'var(--accent-gold)', 'var(--border-main)'];

export function TechEfficiencyDonut() {
  return (
     <div className="flex items-center justify-center gap-8 h-[160px] w-full">
        <ResponsiveContainer width={140} height="100%">
            <PieChart>
                <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={65}
                    fill="var(--brand-red)"
                    paddingAngle={0}
                    dataKey="value"
                    stroke="none"
                >
                    {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                </Pie>
            </PieChart>
        </ResponsiveContainer>
        <div className="flex flex-col gap-2 text-sm text-text-secondary">
          {data.map((entry, index) => (
            <div key={`item-${index}`} className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[index] }} />
              <span>{entry.name}</span>
            </div>
          ))}
        </div>
    </div>
  );
}
