import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { KPI } from "@/lib/domain/types";
import { formatKpiValue } from "@/lib/formatters";
import { cn, formatSignedPercent } from "@/lib/utils";

export function KpiCard({
  kpi,
  currency = "USD",
  changeLabel = "vs prior period"
}: {
  kpi: KPI;
  currency?: string;
  changeLabel?: string;
}) {
  const positive = kpi.change >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <p className="text-sm font-medium text-muted-foreground">{kpi.label}</p>
        <CardTitle className="text-2xl sm:text-3xl">{formatKpiValue(kpi, currency)}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2 pt-1">
        <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", positive ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
          <Icon className="ms-1 h-3.5 w-3.5" />
          {formatSignedPercent(kpi.change)}
        </span>
        <span className="text-xs text-muted-foreground">{changeLabel}</span>
      </CardContent>
    </Card>
  );
}

