import { Lightbulb } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { InsightItem } from "@/lib/domain/types";

export function InsightCard({ insight }: { insight: InsightItem }) {
  return (
    <Card className="transition-shadow hover:shadow-lg">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600">
            <Lightbulb className="h-3.5 w-3.5" aria-hidden />
          </span>
          <CardTitle className="text-sm">{insight.title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm leading-6 text-muted-foreground">{insight.detail}</p>
        {insight.emphasis ? (
          <p className="rounded-md bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-700">
            {insight.emphasis}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function InsightGrid({ items }: { items: InsightItem[] }) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {items.map((insight) => (
        <InsightCard key={insight.title} insight={insight} />
      ))}
    </div>
  );
}
