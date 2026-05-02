"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { KPI } from "@/lib/domain/types";
import { formatMetricValue } from "@/lib/formatters";

export function BarInsightChart<T extends object>({
  data,
  dataKey,
  xKey,
  color = "#0f172a",
  format = "number",
  currency = "USD"
}: {
  data: T[];
  dataKey: keyof T & string;
  xKey: keyof T & string;
  color?: string;
  format?: KPI["format"];
  currency?: string;
}) {
  return (
    <div className="h-[220px] w-full sm:h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -12, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" />
          <XAxis dataKey={xKey} tickLine={false} axisLine={false} minTickGap={18} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={60}
            tickFormatter={(value) => formatMetricValue(value, format, { currency, compact: true })}
          />
          <Tooltip formatter={(value: number) => formatMetricValue(value, format, { currency })} />
          <Bar dataKey={dataKey} fill={color} radius={[10, 10, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
