import { Sparkles } from "lucide-react";
import type { InsightItem } from "@/lib/domain/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function InsightGrid({ items }: { items: InsightItem[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <Card key={item.title} className="group/insight transition-shadow hover:shadow-lg">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/60 text-accent-foreground">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
              </span>
              <CardTitle className="text-base">{item.title}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm leading-6 text-muted-foreground">{item.detail}</p>
            {item.emphasis ? (
              <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm font-semibold">{item.emphasis}</p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
