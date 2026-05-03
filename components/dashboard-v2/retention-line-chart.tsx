"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { DailyMetric } from "@/lib/domain/types";

export function RetentionLineChartV2({ data }: { data: DailyMetric[] }) {
  return (
    <div className="h-[260px] w-full sm:h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: 8, right: 16, top: 16, bottom: 0 }}>
          <defs>
            <linearGradient id="ov2-retention" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5E6AD2" stopOpacity={0.32} />
              <stop offset="100%" stopColor="#5E6AD2" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            minTickGap={32}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={48}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(value: number) => `${value.toFixed(0)}%`}
          />
          <Tooltip
            cursor={{ stroke: "#5E6AD2", strokeWidth: 1, strokeDasharray: "4 4" }}
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "0.75rem",
              color: "hsl(var(--foreground))",
              boxShadow: "0 18px 45px -24px rgba(15, 23, 42, 0.28)"
            }}
            labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
            formatter={(value: number) => [`${value.toFixed(1)}%`, "Returning customers"]}
          />
          <Area
            type="monotone"
            dataKey="returningCustomerRate"
            stroke="#5E6AD2"
            strokeWidth={2.2}
            fill="url(#ov2-retention)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
