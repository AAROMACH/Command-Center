'use client';

import { Pie, PieChart, ResponsiveContainer, Cell, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const data = [
  { name: 'On Time', value: 85, color: '#CC2200' },
  { name: 'Late', value: 10, color: '#C89B3C' },
  { name: 'Pending', value: 5, color: '#444444' },
];

const renderLegend = (props: any) => {
  const { payload } = props;
  return (
    <div className="flex justify-center gap-4">
      {payload.map((entry: any, index: number) => (
        <div key={`item-${index}`} className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-xs text-text-secondary">{entry.value}</span>
        </div>
      ))}
    </div>
  );
};


export function TechEfficiencyChart() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Techs Efficiency</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={100}
                        innerRadius={70}
                        fill="#8884d8"
                        dataKey="value"
                        stroke="none"
                    >
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                    </Pie>
                    <Legend content={renderLegend} verticalAlign="bottom" />
                </PieChart>
            </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
