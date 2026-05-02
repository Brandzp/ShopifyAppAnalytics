import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getLatestSummary } from "@/lib/services/summary-service";
import { getAppLocale, getDictionary } from "@/lib/i18n";

export default async function WeeklySummaryPage() {
  const locale = await getAppLocale();
  const dictionary = getDictionary(locale);
  const [summary, chrome] = await Promise.all([getLatestSummary(), getAppChromeData()]);

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <SectionHeading eyebrow={dictionary.weeklySummary.eyebrow} title={dictionary.weeklySummary.title} description={dictionary.weeklySummary.description} />
        <div className="grid gap-2 sm:grid-cols-3 lg:flex">
          <Button variant="secondary">{dictionary.weeklySummary.regenerate}</Button>
          <Button variant="secondary">{dictionary.weeklySummary.copy}</Button>
          <Button>{dictionary.weeklySummary.share}</Button>
        </div>
      </section>
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/70 bg-dashboard-glow">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{dictionary.weeklySummary.generatedAt} {new Date(summary.generatedAt).toLocaleString()}</p>
          <CardTitle className="max-w-4xl text-2xl leading-tight sm:text-3xl">{summary.headline}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 p-4 sm:p-6 xl:grid-cols-2">
          {summary.sections.map((section) => (
            <div key={section.title} className="rounded-2xl border border-border/70 bg-background/70 p-5">
              <h3 className="text-lg font-semibold">{section.title}</h3>
              <div className="mt-4 space-y-3">
                {section.items.map((item) => (
                  <p key={item} className="text-sm leading-7 text-muted-foreground">{item}</p>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{dictionary.weeklySummary.generationTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted-foreground">{dictionary.weeklySummary.generationTodo}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{dictionary.weeklySummary.deliveryTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted-foreground">{dictionary.weeklySummary.deliveryTodo}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{dictionary.weeklySummary.dependenciesTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted-foreground">{dictionary.weeklySummary.dependenciesTodo}</p>
          </CardContent>
        </Card>
      </section>
    </AppShell>
  );
}

