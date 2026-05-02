import type { SummarySection } from "@/lib/domain/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ActionPanel({ sections }: { sections: SummarySection[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {sections.map((section) => (
        <Card key={section.title} className="bg-card/95">
          <CardHeader>
            <CardTitle className="text-base">{section.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {section.items.map((item) => (
              <p key={item} className="text-sm leading-6 text-muted-foreground">{item}</p>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
