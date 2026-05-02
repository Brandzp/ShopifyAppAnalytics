import type { InsightItem } from "@/lib/domain/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function InsightGrid({ items }: { items: InsightItem[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <Card key={item.title}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{item.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm leading-6 text-muted-foreground">{item.detail}</p>
            {item.emphasis ? <p className="text-sm font-semibold">{item.emphasis}</p> : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
