import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getAppChromeData, getProfitAnalyticsPayload } from "@/lib/services/analytics-service";
import { DataTable } from "@/components/shared/data-table";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { BarInsightChart } from "@/components/charts/bar-insight-chart";
import { ChartCard } from "@/components/shared/chart-card";
import { getAppLocale, getDictionary } from "@/lib/i18n";

export default async function ProfitPage() {
  const locale = await getAppLocale();
  const dictionary = getDictionary(locale);
  const [profit, chrome] = await Promise.all([getProfitAnalyticsPayload(), getAppChromeData()]);

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <SectionHeading eyebrow={dictionary.profit.eyebrow} title={dictionary.profit.title} description={dictionary.profit.description} />
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <ChartCard title={dictionary.profit.salesByProduct} description={dictionary.profit.salesByProductDescription}>
          <BarInsightChart data={profit.topProducts.map((item) => ({ title: item.productTitle, revenue: item.revenue }))} dataKey="revenue" xKey="title" format="currency" currency={chrome.store.currency} />
        </ChartCard>
        <ChartCard title={dictionary.profit.profitByCollection} description={dictionary.profit.profitByCollectionDescription}>
          <BarInsightChart data={profit.collectionPerformance.map((item) => ({ collection: item.collection, estimatedProfit: item.estimatedProfit }))} dataKey="estimatedProfit" xKey="collection" color="#16a34a" format="currency" currency={chrome.store.currency} />
        </ChartCard>
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <DataTable
          title={dictionary.profit.productTable}
          description={dictionary.profit.productTableDescription}
          columns={[
            { key: "productTitle", label: dictionary.profit.product },
            { key: "collection", label: dictionary.profit.collection },
            { key: "unitsSold", label: dictionary.profit.units, render: (row) => formatNumber(Number(row.unitsSold)) },
            { key: "revenue", label: dictionary.profit.revenue, render: (row) => formatCurrency(Number(row.revenue), chrome.store.currency) },
            { key: "discountImpact", label: dictionary.profit.discount, render: (row) => formatCurrency(Number(row.discountImpact), chrome.store.currency) },
            { key: "refundImpact", label: dictionary.profit.refunds, render: (row) => formatCurrency(Number(row.refundImpact), chrome.store.currency) },
            { key: "estimatedProfit", label: dictionary.profit.estimatedProfit, render: (row) => formatCurrency(Number(row.estimatedProfit), chrome.store.currency) }
          ]}
          rows={profit.productPerformance}
        />
        <div className="grid gap-4">
          <DataTable
            title={dictionary.profit.salesByCollection}
            columns={[
              { key: "collection", label: dictionary.profit.collection },
              { key: "revenue", label: dictionary.profit.revenue, render: (row) => formatCurrency(Number(row.revenue), chrome.store.currency) },
              { key: "estimatedProfit", label: dictionary.profit.estimatedProfit, render: (row) => formatCurrency(Number(row.estimatedProfit), chrome.store.currency) }
            ]}
            rows={profit.collectionPerformance}
          />
          <DataTable
            title={dictionary.profit.discountImpact}
            columns={[
              { key: "code", label: dictionary.profit.discountCode },
              { key: "orderCount", label: dictionary.profit.orders, render: (row) => formatNumber(Number(row.orderCount)) },
              { key: "revenueInfluenced", label: dictionary.profit.influencedRevenue, render: (row) => formatCurrency(Number(row.revenueInfluenced), chrome.store.currency) },
              { key: "discountAmount", label: dictionary.profit.discountAmount, render: (row) => formatCurrency(Number(row.discountAmount), chrome.store.currency) }
            ]}
            rows={profit.discountUsage}
          />
        </div>
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{dictionary.profit.topProducts}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {profit.topProducts.map((item) => (
              <div key={item.productId} className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="font-semibold">{item.productTitle}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {locale === "he"
                    ? `${dictionary.profit.topProductCopy} ${formatCurrency(item.revenue, chrome.store.currency)} ${dictionary.profit.topProductCopyEnd} ${formatCurrency(item.estimatedProfit, chrome.store.currency)}.`
                    : `${formatCurrency(item.revenue, chrome.store.currency)} ${dictionary.profit.topProductCopy} ${formatCurrency(item.estimatedProfit, chrome.store.currency)} ${dictionary.profit.topProductCopyEnd}`}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{dictionary.profit.watchlistProducts}</CardTitle>
            <CardDescription>{dictionary.profit.watchlistDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {profit.lowProducts.map((item) => (
              <div key={item.productId} className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="font-semibold">{item.productTitle}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatCurrency(item.estimatedProfit, chrome.store.currency)} {dictionary.profit.watchlistCopy} {formatCurrency(item.discountImpact, chrome.store.currency)} {dictionary.profit.watchlistCopyEnd}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{dictionary.profit.bundleImpact}</CardTitle>
            <CardDescription>{dictionary.profit.bundleDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted-foreground">{dictionary.profit.bundleTodo}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{dictionary.profit.refundImpact}</CardTitle>
            <CardDescription>{dictionary.profit.refundDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted-foreground">{dictionary.profit.refundTodo}</p>
          </CardContent>
        </Card>
      </section>
    </AppShell>
  );
}

