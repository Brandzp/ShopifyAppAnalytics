import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OverviewNarrative } from "@/components/dashboard-v2/narrative-banner";
import { SectionHead } from "@/components/dashboard-v2/section-head";
import { KpiTile } from "@/components/dashboard-v2/kpi-tile";
import { ComparisonTile } from "@/components/dashboard-v2/comparison-tile";
import { InsightGrid } from "@/components/dashboard-v2/insight-card";
import { AlertCard } from "@/components/dashboard-v2/alert-card";
import { StyledTable } from "@/components/dashboard-v2/styled-table";
import { RevenueChartV2 } from "@/components/dashboard-v2/revenue-chart-v2";
import { StockAlertsCallout } from "@/components/dashboard-v2/stock-alerts-callout";
import { StockBadge } from "@/components/dashboard-v2/stock-badge";
import { CollectionChips } from "@/components/dashboard-v2/collection-chips";
import { getOverviewPayload, getAppChromeData } from "@/lib/services/analytics-service";
import { getAnalyticsRepository } from "@/lib/repositories";
import { formatCurrency, formatDateRange, formatNumber } from "@/lib/utils";
import { getAppLocale, getDictionary } from "@/lib/i18n";

export default async function OverviewPage() {
  const locale = await getAppLocale();
  const dictionary = getDictionary(locale);
  const repository = await getAnalyticsRepository();
  const [overview, chrome, stock] = await Promise.all([
    getOverviewPayload(),
    getAppChromeData(),
    repository.getProductStock()
  ]);
  const topProducts = overview.productPerformance.slice(0, 10);
  const alerts = overview.alerts.slice(0, 5);
  const dateLocale = locale === "he" ? "he-IL" : "en-US";
  const currentRangeLabel = formatDateRange(chrome.controls.startDate, chrome.controls.endDate, dateLocale);
  const comparisonRangeLabel = chrome.controls.comparison?.enabled
    ? formatDateRange(chrome.controls.comparison.startDate, chrome.controls.comparison.endDate, dateLocale)
    : null;
  const comparisonContext = comparisonRangeLabel
    ? locale === "he"
      ? `הטווח הנוכחי: ${currentRangeLabel}. בהשוואה ל: ${comparisonRangeLabel}.`
      : `Current window: ${currentRangeLabel}. Compared with: ${comparisonRangeLabel}.`
    : locale === "he"
      ? `הטווח הנוכחי: ${currentRangeLabel}.`
      : `Current window: ${currentRangeLabel}.`;

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 sm:space-y-8">
        <OverviewNarrative overview={overview} comparisonContext={comparisonContext} />

        {stock.length > 0 ? <StockAlertsCallout stock={stock} /> : null}

        <section className="space-y-3">
          <SectionHead
            eyebrow="Step 1"
            title="Your headline numbers"
            hint="Six metrics that answer 'is the store healthy?' at a glance. Hover any ? for the calculation."
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {overview.kpis.map((kpi) => (
              <KpiTile key={kpi.label} kpi={kpi} currency={overview.store.currency} />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <SectionHead
            eyebrow="Step 2"
            title="How does this period compare?"
            hint="Each metric next to its prior-period value. Big green pill = better, big red pill = worse."
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {overview.comparisonMetrics.map((item) => (
              <ComparisonTile key={item.label} item={item} currency={overview.store.currency} />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <SectionHead
            eyebrow="Step 3"
            title="Daily revenue & profit trend"
            hint="Indigo line is gross revenue, blue is what you actually keep. The gap between them is your margin."
          />
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Revenue vs estimated profit</CardTitle>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#5E6AD2" }} />
                    Revenue
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#0080FF" }} />
                    Profit
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <RevenueChartV2 data={overview.dailyMetrics} currency={overview.store.currency} />
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <SectionHead
            eyebrow="Step 4"
            title="Insights worth acting on"
            hint="Auto-generated takeaways. Each block is one sentence you can send to your team."
          />
          <InsightGrid items={overview.insights.slice(0, 6)} />
        </section>

        <section className="space-y-3">
          <SectionHead
            eyebrow="Step 5"
            title="Products carrying the store"
            hint="Top 10 by revenue. Use this to decide where to send ad budget or which SKUs to keep stocked."
            cta={{ href: "/profit", label: "See the full table →" }}
          />
          <StyledTable
            numbered
            rowKey={(row) => row.productId}
            rows={topProducts}
            columns={[
              { key: "productTitle", label: "Product" },
              {
                key: "collection",
                label: "Collections",
                tooltip: "Every Shopify collection (smart + manual) the product belongs to. Hover '+N more' to see the rest.",
                render: (row) => <CollectionChips collections={row.collections} fallback={row.collection} />
              },
              {
                key: "unitsSold",
                label: "Units sold",
                align: "end",
                tooltip: "Total units sold across all orders in this window.",
                render: (row) => formatNumber(row.unitsSold)
              },
              {
                key: "inventoryQuantity",
                label: "In stock",
                align: "end",
                tooltip: "Current units across all variants. Red <20, yellow <50, green ≥50. 'Not tracked' = no inventory data on Shopify.",
                render: (row) => <StockBadge quantity={row.inventoryQuantity} />
              },
              {
                key: "revenue",
                label: "Revenue",
                align: "end",
                tooltip: "Gross revenue from this product (before refunds & fees).",
                render: (row) => formatCurrency(row.revenue, overview.store.currency)
              },
              {
                key: "estimatedProfit",
                label: "Est. profit",
                align: "end",
                emphasis: true,
                tooltip: "Revenue − discounts − refunds − configured product cost.",
                render: (row) => formatCurrency(row.estimatedProfit, overview.store.currency)
              }
            ]}
          />
        </section>

        <section className="space-y-3">
          <SectionHead
            eyebrow="Step 6"
            title="What to deal with this week"
            hint="Rule-triggered alerts ranked by severity. Red = today, amber = this week, blue = informational."
            cta={{ href: "/alerts", label: "Open alerts center →" }}
          />
          <div className="grid gap-3 lg:grid-cols-2">
            {alerts.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  No alerts in this window. We&apos;ll surface anomalies here as they trigger.
                </CardContent>
              </Card>
            ) : null}
            {alerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                severityLabel={dictionary.alertsPage.severity[alert.severity]}
              />
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
