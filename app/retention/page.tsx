import { CalendarClock, Repeat, TrendingUp, UserPlus, Users2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";
import { NarrativeBanner } from "@/components/dashboard-v2/narrative-banner";
import { PageHead, SectionHead } from "@/components/dashboard-v2/section-head";
import { StatTile } from "@/components/dashboard-v2/kpi-tile";
import { RetentionLineChartV2 } from "@/components/dashboard-v2/retention-line-chart";
import { BarInsightChart } from "@/components/charts/bar-insight-chart";
import { getAppChromeData, getRetentionPayload } from "@/lib/services/analytics-service";
import { buildCohortRetention } from "@/lib/services/cohort-retention-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { CohortHeatmap } from "@/components/retention/cohort-heatmap";
import { formatNumber } from "@/lib/utils";
import { getAppLocale, getDictionary } from "@/lib/i18n";

export default async function RetentionPage() {
  const locale = await getAppLocale();
  const dictionary = getDictionary(locale);
  const tips = dictionary.retention.tips;
  const [retention, chrome, storeId] = await Promise.all([
    getRetentionPayload(),
    getAppChromeData(),
    resolveActiveStoreId()
  ]);
  const snap = retention.snapshot;
  // 12-month cohort retention — the single best signal for LTV health.
  const cohortReport = storeId
    ? await buildCohortRetention({ storeId, lookbackMonths: 12 }).catch(() => null)
    : null;

  // Narrative
  const repeatRate = snap.repeatPurchaseRate;
  const tone = repeatRate >= 30 ? "up" : repeatRate >= 15 ? "neutral" : "down";
  const headline = `Repeat-purchase rate is ${repeatRate.toFixed(1)}% — ${
    repeatRate >= 30 ? "healthy" : repeatRate >= 15 ? "growing" : "needs work"
  }.`;
  const body = [
    `${formatNumber(snap.newCustomers)} new customers and ${formatNumber(snap.returningCustomers)} returning customers ordered in this window.`,
    snap.averageDaysToSecondOrder > 0
      ? `Returning buyers come back after about ${snap.averageDaysToSecondOrder.toFixed(0)} days on average.`
      : null,
    snap.secondOrderRate > 0
      ? `Second-order rate is ${snap.secondOrderRate.toFixed(1)}% — that's how many first-time buyers came back for a second order.`
      : null
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 sm:space-y-8">
        <PageHead
          eyebrow={dictionary.retention.eyebrow}
          title={dictionary.retention.title}
          description={dictionary.retention.description}
        />

        <NarrativeBanner
          eyebrow="Retention pulse"
          headline={headline}
          body={body}
          tone={tone}
          toneLabel={tone === "up" ? "Healthy" : tone === "down" ? "At risk" : "Watch closely"}
        />

        <section className="space-y-3">
          <SectionHead
            eyebrow="Step 1"
            title="Customer mix this period"
            hint="Five numbers that tell you if buyers come back. Hover any ? for the calculation."
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatTile
              label={dictionary.retention.newCustomers}
              value={formatNumber(snap.newCustomers)}
              icon={UserPlus}
              tooltip={tips.newCustomers}
              hint="First-ever orders in this window."
            />
            <StatTile
              label={dictionary.retention.returningCustomers}
              value={formatNumber(snap.returningCustomers)}
              icon={Users2}
              tooltip={tips.returningCustomers}
              hint="Already had at least one prior order."
            />
            <StatTile
              label={dictionary.retention.repeatPurchaseRate}
              value={`${snap.repeatPurchaseRate.toFixed(1)}%`}
              icon={Repeat}
              tooltip={tips.repeatRate}
              hint="Higher = stickier brand."
            />
            <StatTile
              label={dictionary.retention.secondOrderRate}
              value={`${snap.secondOrderRate.toFixed(1)}%`}
              icon={TrendingUp}
              tooltip={tips.secondOrderRate}
              hint="First-time buyers who came back."
            />
            <StatTile
              label={dictionary.retention.avgDaysToSecondOrder}
              value={formatNumber(snap.averageDaysToSecondOrder)}
              icon={CalendarClock}
              tooltip={tips.avgDaysToSecond}
              hint="Days between order #1 and #2."
            />
          </div>
        </section>

        <section className="space-y-3">
          <SectionHead
            eyebrow="Step 2"
            title="Returning customer trend"
            hint="Indigo area shows the daily share of orders coming from existing customers. Watch for sustained drops."
          />
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{dictionary.retention.repeatRateOverTime}</CardTitle>
            </CardHeader>
            <CardContent>
              <RetentionLineChartV2 data={retention.dailyMetrics} />
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <SectionHead
            eyebrow="Step 3"
            title="What customers buy first vs. what brings them back"
            hint="Left = best acquisition products. Right = best retention products. Different SKUs are normal — and often very revealing."
          />
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-base">{dictionary.retention.topFirstOrderProducts}</CardTitle>
                  <HelpTip>{tips.topFirstOrder}</HelpTip>
                </div>
              </CardHeader>
              <CardContent>
                <BarInsightChart
                  data={retention.firstOrderProducts}
                  dataKey="orders"
                  xKey="title"
                  format="number"
                  valueLabel="First orders"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-base">{dictionary.retention.topSecondOrderProducts}</CardTitle>
                  <HelpTip>{tips.topSecondOrder}</HelpTip>
                </div>
                <p className="text-sm text-muted-foreground">{dictionary.retention.topSecondOrderDescription}</p>
              </CardHeader>
              <CardContent>
                <BarInsightChart
                  data={retention.secondOrderProducts}
                  dataKey="orders"
                  xKey="title"
                  color="#0080FF"
                  format="number"
                  valueLabel="Second orders"
                />
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="space-y-3">
          <SectionHead
            eyebrow="Step 4"
            title="Cohort retention — do customers come back?"
            hint="Each row is a group of customers acquired in the same month. Columns show what percent of that cohort ordered again N months later. Darker = better retention. Compare recent rows (top) to older rows (bottom): if recent cohorts retain worse, marketing is buying first-order tourists."
          />
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-base">{dictionary.retention.cohortView}</CardTitle>
                <HelpTip>{tips.cohort}</HelpTip>
              </div>
              <p className="text-sm text-muted-foreground">{dictionary.retention.cohortDescription}</p>
            </CardHeader>
            <CardContent>
              {cohortReport ? (
                <CohortHeatmap report={cohortReport} locale={locale} display="rate" />
              ) : (
                <p className="text-sm leading-6 text-muted-foreground">{retention.cohortPlaceholder}</p>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </AppShell>
  );
}
