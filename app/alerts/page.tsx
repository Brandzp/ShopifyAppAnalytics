import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAlerts } from "@/lib/services/alert-service";
import { cn } from "@/lib/utils";
import { getAppLocale, getDictionary } from "@/lib/i18n";

const severityClasses = {
  low: "bg-accent text-accent-foreground",
  medium: "bg-warning/15 text-warning-foreground",
  high: "bg-danger/15 text-danger"
};

export default async function AlertsPage() {
  const locale = await getAppLocale();
  const dictionary = getDictionary(locale);
  const [alerts, chrome] = await Promise.all([getAlerts(), getAppChromeData()]);

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <SectionHeading eyebrow={dictionary.alertsPage.eyebrow} title={dictionary.alertsPage.title} description={dictionary.alertsPage.description} />
      </section>

      <div className="space-y-4">
        {alerts.map((alert) => (
          <Card key={alert.id}>
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold uppercase", severityClasses[alert.severity])}>{dictionary.alertsPage.severity[alert.severity]}</span>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{alert.periodLabel}</p>
                </div>
                <CardTitle>{alert.title}</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground">{new Date(alert.timestamp).toLocaleString()}</p>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <p className="text-sm leading-7 text-muted-foreground">{alert.explanation}</p>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{dictionary.alertsPage.suggestedAction}</p>
                <p className="mt-3 text-sm leading-6">{alert.suggestedAction}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}

