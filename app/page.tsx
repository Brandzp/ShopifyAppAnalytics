import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { getAppChromeData, getOverviewPayload } from "@/lib/services/analytics-service";
import { RevenueProfitChart } from "@/components/charts/revenue-profit-chart";
import { RetentionChart } from "@/components/charts/retention-chart";
import { InsightGrid } from "@/components/dashboard/insight-grid";
import { ActionPanel } from "@/components/dashboard/action-panel";
import { DataTable } from "@/components/shared/data-table";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { AlertsPreview } from "@/components/dashboard/alerts-preview";
import { ComparisonGrid } from "@/components/dashboard/comparison-grid";
import { ChartCard } from "@/components/shared/chart-card";
import { getAppLocale, getDictionary } from "@/lib/i18n";

export default async function OverviewPage() {
  const locale = await getAppLocale();
  const dictionary = getDictionary(locale);
  const [overview, chrome] = await Promise.all([getOverviewPayload(), getAppChromeData()]);

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-6">
        <SectionHeading eyebrow={dictionary.overview.eyebrow} title={dictionary.overview.title} description={dictionary.overview.description} />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {overview.kpis.map((kpi) => (
            <KpiCard key={kpi.label} kpi={kpi} currency={overview.store.currency} changeLabel={dictionary.overview.changeLabel} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading title={dictionary.overview.comparisonTitle} description={dictionary.overview.comparisonDescription} />
        <ComparisonGrid items={overview.comparisonMetrics} priorLabel={dictionary.overview.priorLabel} percentLabels={overview.comparisonMetrics.slice(2).map((item) => item.label)} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <ChartCard title={dictionary.overview.revenueProfitTrend}>
          <RevenueProfitChart data={overview.dailyMetrics} currency={overview.store.currency} />
        </ChartCard>
        <ChartCard title={dictionary.overview.returningTrend}>
          <RetentionChart data={overview.dailyMetrics} />
        </ChartCard>
      </section>

      <section className="space-y-4">
        <SectionHeading title={dictionary.overview.insightsTitle} description={dictionary.overview.insightsDescription} />
        <InsightGrid items={overview.insights} />
      </section>

      <section className="space-y-4">
        <SectionHeading title={dictionary.overview.actionsTitle} description={dictionary.overview.actionsDescription} />
        <ActionPanel sections={overview.actionPanel} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)]">
        <DataTable
          title={dictionary.overview.topProductPerformance}
          description={dictionary.overview.topProductDescription}
          columns={[
            { key: "productTitle", label: dictionary.overview.product },
            { key: "collection", label: dictionary.overview.collection },
            { key: "unitsSold", label: dictionary.overview.units, render: (row) => formatNumber(Number(row.unitsSold)) },
            { key: "revenue", label: dictionary.overview.revenue, render: (row) => formatCurrency(Number(row.revenue), overview.store.currency) },
            { key: "estimatedProfit", label: dictionary.overview.estimatedProfit, render: (row) => formatCurrency(Number(row.estimatedProfit), overview.store.currency) }
          ]}
          rows={overview.productPerformance.slice(0, 5)}
        />
        <AlertsPreview items={overview.alerts.slice(0, 3)} title={dictionary.overview.alertsPreviewTitle} severityLabels={dictionary.alertsPage.severity} />
      </section>
    </AppShell>
  );
}


