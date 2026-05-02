import type { ComparisonMetric } from "@/lib/domain/types";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatSignedPercent } from "@/lib/utils";

function renderValue(label: string, value: number, percentLabels: string[]) {
  if (percentLabels.includes(label) || label.toLowerCase().includes("rate")) return `${value.toFixed(1)}%`;
  return formatCurrency(value);
}

export function ComparisonGrid({ items, priorLabel = "Prior", percentLabels = [] }: { items: ComparisonMetric[]; priorLabel?: string; percentLabels?: string[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="space-y-3 p-6">
            <p className="text-sm font-medium text-muted-foreground">{item.label}</p>
            <p className="text-2xl font-semibold">{renderValue(item.label, item.current, percentLabels)}</p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{priorLabel}: {renderValue(item.label, item.previous, percentLabels)}</span>
              <span className={item.change >= 0 ? "text-success" : "text-danger"}>{formatSignedPercent(item.change)}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

