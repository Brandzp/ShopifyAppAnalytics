import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { NarrativeBanner } from "@/components/dashboard-v2/narrative-banner";
import { PageHead, SectionHead } from "@/components/dashboard-v2/section-head";
import { AlertCard } from "@/components/dashboard-v2/alert-card";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAlerts } from "@/lib/services/alert-service";
import { getAppLocale, getDictionary } from "@/lib/i18n";

export default async function AlertsPage() {
  const dictionary = getDictionary(await getAppLocale());
  const tips = dictionary.alertsPage.tips;
  const [alerts, chrome] = await Promise.all([getAlerts(), getAppChromeData()]);

  const high = alerts.filter((a) => a.severity === "high");
  const medium = alerts.filter((a) => a.severity === "medium");
  const low = alerts.filter((a) => a.severity === "low");

  const tone = high.length > 0 ? "down" : medium.length > 0 ? "neutral" : "up";
  const headline =
    high.length > 0
      ? `${high.length} high-priority alert${high.length === 1 ? "" : "s"} need your attention today.`
      : medium.length > 0
        ? `${medium.length} medium-priority alert${medium.length === 1 ? "" : "s"} to review this week.`
        : "All clear — no urgent alerts right now.";

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 sm:space-y-8">
        <PageHead
          eyebrow={dictionary.alertsPage.eyebrow}
          title={dictionary.alertsPage.title}
          description={dictionary.alertsPage.description}
        />

        <NarrativeBanner
          eyebrow="Alerts pulse"
          headline={headline}
          body={tips.severity}
          tone={tone}
          toneLabel={tone === "up" ? "All clear" : tone === "down" ? "Action needed" : "Watch closely"}
        />

        {alerts.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No alerts in this window. We&apos;ll surface anomalies here as they trigger.
            </CardContent>
          </Card>
        ) : null}

        {high.length > 0 ? (
          <section className="space-y-3">
            <SectionHead
              eyebrow="Priority — high"
              title="Today's must-do alerts"
              hint="Something material moved. Read the suggested action and execute today if possible."
            />
            <div className="grid gap-3 lg:grid-cols-2">
              {high.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  severityLabel={dictionary.alertsPage.severity[alert.severity]}
                />
              ))}
            </div>
          </section>
        ) : null}

        {medium.length > 0 ? (
          <section className="space-y-3">
            <SectionHead
              eyebrow="Priority — medium"
              title="This week's review queue"
              hint="Worth investigating during weekly planning. Won't blow up overnight."
            />
            <div className="grid gap-3 lg:grid-cols-2">
              {medium.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  severityLabel={dictionary.alertsPage.severity[alert.severity]}
                />
              ))}
            </div>
          </section>
        ) : null}

        {low.length > 0 ? (
          <section className="space-y-3">
            <SectionHead
              eyebrow="Priority — low"
              title="FYI — informational"
              hint="Background context. Read when you have time, or skip during a busy week."
            />
            <div className="grid gap-3 lg:grid-cols-2">
              {low.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  severityLabel={dictionary.alertsPage.severity[alert.severity]}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
