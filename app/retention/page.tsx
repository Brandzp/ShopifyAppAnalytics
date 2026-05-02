import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { getAppChromeData, getRetentionPayload } from "@/lib/services/analytics-service";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { RetentionChart } from "@/components/charts/retention-chart";
import { BarInsightChart } from "@/components/charts/bar-insight-chart";
import { formatNumber } from "@/lib/utils";
import { StatCard } from "@/components/shared/stat-card";
import { ChartCard } from "@/components/shared/chart-card";
import { getAppLocale, getDictionary } from "@/lib/i18n";

export default async function RetentionPage() {
  const locale = await getAppLocale();
  const dictionary = getDictionary(locale);
  const [retention, chrome] = await Promise.all([getRetentionPayload(), getAppChromeData()]);

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <SectionHeading eyebrow={dictionary.retention.eyebrow} title={dictionary.retention.title} description={dictionary.retention.description} />
      </section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label={dictionary.retention.newCustomers} value={formatNumber(retention.snapshot.newCustomers)} />
        <StatCard label={dictionary.retention.returningCustomers} value={formatNumber(retention.snapshot.returningCustomers)} />
        <StatCard label={dictionary.retention.repeatPurchaseRate} value={`${retention.snapshot.repeatPurchaseRate}%`} />
        <StatCard label={dictionary.retention.secondOrderRate} value={`${retention.snapshot.secondOrderRate}%`} />
        <StatCard label={dictionary.retention.avgDaysToSecondOrder} value={formatNumber(retention.snapshot.averageDaysToSecondOrder)} />
      </section>
      <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <ChartCard title={dictionary.retention.repeatRateOverTime}>
          <RetentionChart data={retention.dailyMetrics} />
        </ChartCard>
        <ChartCard title={dictionary.retention.newVsReturning} description={dictionary.retention.newVsReturningDescription}>
          <BarInsightChart data={[{ segment: dictionary.retention.newLabel, customers: retention.snapshot.newCustomers }, { segment: dictionary.retention.returningLabel, customers: retention.snapshot.returningCustomers }]} dataKey="customers" xKey="segment" color="#2563eb" format="number" />
        </ChartCard>
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <ChartCard title={dictionary.retention.topFirstOrderProducts}>
          <BarInsightChart data={retention.firstOrderProducts} dataKey="orders" xKey="title" format="number" />
        </ChartCard>
        <ChartCard title={dictionary.retention.topSecondOrderProducts} description={dictionary.retention.topSecondOrderDescription}>
          <BarInsightChart data={retention.secondOrderProducts} dataKey="orders" xKey="title" color="#16a34a" format="number" />
        </ChartCard>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{dictionary.retention.cohortView}</CardTitle>
            <CardDescription>{dictionary.retention.cohortDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted-foreground">{retention.cohortPlaceholder}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{dictionary.retention.avgTimeBetweenOrders}</CardTitle>
            <CardDescription>{dictionary.retention.avgTimeDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted-foreground">{dictionary.retention.avgTimeTodo}</p>
          </CardContent>
        </Card>
      </section>
    </AppShell>
  );
}

