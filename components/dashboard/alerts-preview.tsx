import type { Alert } from "@/lib/domain/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const severityStyles: Record<Alert["severity"], string> = {
  low: "bg-accent text-accent-foreground",
  medium: "bg-warning/15 text-warning-foreground",
  high: "bg-danger/15 text-danger"
};

export function AlertsPreview({
  items,
  title = "Alerts requiring attention",
  severityLabels
}: {
  items: Alert[];
  title?: string;
  severityLabels?: Record<Alert["severity"], string>;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((alert) => (
          <div key={alert.id} className="rounded-2xl border border-border/70 bg-background/70 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold uppercase", severityStyles[alert.severity])}>{severityLabels?.[alert.severity] ?? alert.severity}</span>
              <p className="text-xs text-muted-foreground">{alert.periodLabel}</p>
            </div>
            <p className="mt-3 font-semibold">{alert.title}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{alert.explanation}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

