import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";
import { NarrativeBanner } from "@/components/dashboard-v2/narrative-banner";
import { PageHead, SectionHead } from "@/components/dashboard-v2/section-head";
import { StyledTable } from "@/components/dashboard-v2/styled-table";
import { BarInsightChart } from "@/components/charts/bar-insight-chart";
import { CollectionChips } from "@/components/dashboard-v2/collection-chips";
import { DataTable } from "@/components/shared/data-table";
import { getAppChromeData, getProfitAnalyticsPayload } from "@/lib/services/analytics-service";
import { buildChannelCacReport } from "@/lib/services/channel-cac-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { getAppLocale, getDictionary } from "@/lib/i18n";

export default async function ProfitPage() {
  const locale = await getAppLocale();
  const dictionary = getDictionary(locale);
  const tips = dictionary.profit.tips;
  const overviewColTips = dictionary.overview.colTips;
  const [profit, chrome, storeId] = await Promise.all([
    getProfitAnalyticsPayload(),
    getAppChromeData(),
    resolveActiveStoreId()
  ]);
  const currency = chrome.store.currency;
  const channelCac = storeId
    ? await buildChannelCacReport({
        storeId,
        start: new Date(`${chrome.controls.startDate}T00:00:00Z`),
        end: new Date(`${chrome.controls.endDate}T23:59:59Z`)
      }).catch(() => null)
    : null;

  // Narrative
  const totalRevenue = profit.productPerformance.reduce((acc, row) => acc + row.revenue, 0);
  const totalProfit = profit.productPerformance.reduce((acc, row) => acc + row.estimatedProfit, 0);
  const totalDiscount = profit.productPerformance.reduce((acc, row) => acc + row.discountImpact, 0);
  const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const topProduct = profit.topProducts[0];
  const watchlistFirst = profit.lowProducts[0];

  const narrativeBody = [
    `Margin landed near ${margin.toFixed(1)}% — every ₪100 in revenue kept ${formatCurrency((totalProfit / Math.max(totalRevenue, 1)) * 100, currency)}.`,
    topProduct
      ? `${topProduct.productTitle} is your top profit driver at ${formatCurrency(topProduct.estimatedProfit, currency)}.`
      : null,
    watchlistFirst
      ? `Watchlist: ${watchlistFirst.productTitle} is the lowest-margin SKU and worth a pricing review.`
      : null
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 sm:space-y-8">
        <PageHead
          eyebrow={dictionary.profit.eyebrow}
          title={dictionary.profit.title}
          description={dictionary.profit.description}
        />

        <NarrativeBanner
          eyebrow="Profit at a glance"
          headline={`Estimated profit this period: ${formatCurrency(totalProfit, currency)} on ${formatCurrency(totalRevenue, currency)} revenue.`}
          body={narrativeBody}
          tone={totalProfit > 0 ? "up" : "down"}
          toneLabel={totalProfit > 0 ? "Profit positive" : "Margin pressure"}
        />

        {/* Charts row */}
        <section className="space-y-3">
          <SectionHead
            eyebrow="Step 1"
            title="Where revenue and margin live"
            hint="Left chart = which products bring in the money. Right chart = which collections keep the most after costs."
          />
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-base">{dictionary.profit.salesByProduct}</CardTitle>
                  <HelpTip>{tips.salesByProduct}</HelpTip>
                </div>
                <p className="text-sm text-muted-foreground">{dictionary.profit.salesByProductDescription}</p>
              </CardHeader>
              <CardContent>
                <BarInsightChart
                  data={profit.topProducts.map((item) => ({ title: item.productTitle, revenue: item.revenue }))}
                  dataKey="revenue"
                  xKey="title"
                  format="currency"
                  currency={currency}
                  valueLabel="Revenue"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-base">{dictionary.profit.profitByCollection}</CardTitle>
                  <HelpTip>{tips.profitByCollection}</HelpTip>
                </div>
                <p className="text-sm text-muted-foreground">{dictionary.profit.profitByCollectionDescription}</p>
              </CardHeader>
              <CardContent>
                <BarInsightChart
                  data={(() => {
                    // Render only the top contributors and roll the long tail
                    // into a single "Other" bar. Without this the x-axis crams
                    // 40+ labels into a few hundred pixels and nothing is
                    // readable. Sorted desc so the heroes are on the left.
                    const MAX_BARS = 10;
                    const sorted = [...profit.collectionPerformance]
                      .filter((c) => Number(c.estimatedProfit) > 0)
                      .sort((a, b) => Number(b.estimatedProfit) - Number(a.estimatedProfit));
                    const top = sorted.slice(0, MAX_BARS);
                    const rest = sorted.slice(MAX_BARS);
                    const tailLabel = locale === "he" ? `אחר (${rest.length})` : `Other (${rest.length})`;
                    const tail =
                      rest.length > 0
                        ? [{
                            collection: tailLabel,
                            estimatedProfit: rest.reduce((sum, c) => sum + Number(c.estimatedProfit), 0)
                          }]
                        : [];
                    return [...top.map((item) => ({
                      collection: item.collection,
                      estimatedProfit: Number(item.estimatedProfit)
                    })), ...tail];
                  })()}
                  dataKey="estimatedProfit"
                  xKey="collection"
                  color="#0080FF"
                  format="currency"
                  currency={currency}
                  valueLabel="Estimated profit"
                />
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Tables row */}
        <section className="space-y-3">
          <SectionHead
            eyebrow="Step 2"
            title="The full breakdown"
            hint="Sortable, paginated tables. Use the page-size toggle if you want to see more rows at once."
          />
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <DataTable
              title={dictionary.profit.productTable}
              description={dictionary.profit.productTableDescription}
              tooltip={tips.productTable}
              paginate
              initialPageSize={20}
              pageSizes={[20, 50, 100]}
              columns={[
                { key: "productTitle", label: dictionary.profit.product },
                {
                  key: "collection",
                  label: dictionary.profit.collection,
                  tooltip: "Every Shopify collection the product belongs to.",
                  render: (row) => <CollectionChips collections={row.collections} fallback={row.collection} />
                },
                {
                  key: "unitsSold",
                  label: dictionary.profit.units,
                  tooltip: overviewColTips.units,
                  render: (row) => formatNumber(Number(row.unitsSold))
                },
                {
                  key: "revenue",
                  label: dictionary.profit.revenue,
                  tooltip: overviewColTips.revenue,
                  render: (row) => formatCurrency(Number(row.revenue), currency)
                },
                {
                  key: "discountImpact",
                  label: dictionary.profit.discount,
                  tooltip: tips.discountCol,
                  render: (row) => formatCurrency(Number(row.discountImpact), currency)
                },
                {
                  key: "refundImpact",
                  label: dictionary.profit.refunds,
                  tooltip: tips.refundsCol,
                  render: (row) => formatCurrency(Number(row.refundImpact), currency)
                },
                {
                  key: "estimatedProfit",
                  label: dictionary.profit.estimatedProfit,
                  tooltip: overviewColTips.profit,
                  render: (row) => formatCurrency(Number(row.estimatedProfit), currency)
                }
              ]}
              rows={profit.productPerformance}
            />
            <div className="grid gap-4">
              <DataTable
                title={dictionary.profit.salesByCollection}
                paginate
                initialPageSize={20}
                pageSizes={[20, 50, 100]}
                columns={[
                  { key: "collection", label: dictionary.profit.collection },
                  {
                    key: "revenue",
                    label: dictionary.profit.revenue,
                    tooltip: overviewColTips.revenue,
                    render: (row) => formatCurrency(Number(row.revenue), currency)
                  },
                  {
                    key: "estimatedProfit",
                    label: dictionary.profit.estimatedProfit,
                    tooltip: overviewColTips.profit,
                    render: (row) => formatCurrency(Number(row.estimatedProfit), currency)
                  }
                ]}
                rows={profit.collectionPerformance}
              />
              <DataTable
                title={dictionary.profit.discountImpact}
                paginate
                initialPageSize={20}
                pageSizes={[20, 50, 100]}
                columns={[
                  { key: "code", label: dictionary.profit.discountCode },
                  {
                    key: "orderCount",
                    label: dictionary.profit.orders,
                    render: (row) => formatNumber(Number(row.orderCount))
                  },
                  {
                    key: "revenueInfluenced",
                    label: dictionary.profit.influencedRevenue,
                    render: (row) => formatCurrency(Number(row.revenueInfluenced), currency)
                  },
                  {
                    key: "discountAmount",
                    label: dictionary.profit.discountAmount,
                    tooltip: tips.discountCol,
                    render: (row) => formatCurrency(Number(row.discountAmount), currency)
                  }
                ]}
                rows={profit.discountUsage}
              />
            </div>
          </div>
        </section>

        {/* Top + watchlist row */}
        <section className="space-y-3">
          <SectionHead
            eyebrow="Step 3"
            title="Heroes & watchlist"
            hint="Heroes drove margin this period. Watchlist needs your attention next — pricing, bundles, or refund review."
          />
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <StyledTable
              numbered
              rowKey={(row) => row.productId}
              rows={profit.topProducts}
              columns={[
                { key: "productTitle", label: "Product" },
                {
                  key: "revenue",
                  label: "Revenue",
                  align: "end",
                  render: (row) => formatCurrency(row.revenue, currency)
                },
                {
                  key: "estimatedProfit",
                  label: "Est. profit",
                  align: "end",
                  emphasis: true,
                  render: (row) => formatCurrency(row.estimatedProfit, currency)
                }
              ]}
            />
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-base">{dictionary.profit.watchlistProducts}</CardTitle>
                  <HelpTip width="lg">{tips.watchlist}</HelpTip>
                </div>
                <p className="text-sm text-muted-foreground">{dictionary.profit.watchlistDescription}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {profit.lowProducts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No watchlist items in this window.</p>
                ) : null}
                {profit.lowProducts.map((item) => (
                  <div
                    key={item.productId}
                    className="flex items-start justify-between gap-3 rounded-2xl border border-rose-200/60 bg-rose-50/40 p-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{item.productTitle}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {formatCurrency(item.estimatedProfit, currency)} {dictionary.profit.watchlistCopy}{" "}
                        {formatCurrency(item.discountImpact, currency)} {dictionary.profit.watchlistCopyEnd}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Per-channel CAC & contribution margin */}
        {channelCac && channelCac.rows.length > 0 ? (
          <section className="space-y-3">
            <SectionHead
              eyebrow={locale === "he" ? "ערוצים" : "Channels"}
              title={locale === "he" ? "רווח תרומה ועלות רכישת לקוח לפי ערוץ" : "Channel CAC & contribution margin"}
              hint={
                locale === "he"
                  ? "כמה כל ערוץ עולה לך, מה החזיר בהכנסה, ומה נשאר ברווח תרומה אחרי COGS והוצאת פרסום מיוחסת. מומלצת = להגדיל. לעיון = לבחון קריאייטיב/קהל. להרעיב = לעצור הוצאה."
                  : "How much each channel costs, what it returned in revenue, and what's left as contribution margin after COGS and attributed spend. Push = scale, review = check creative/audience, starve = stop spending."
              }
            />
            <ChannelCacTable report={channelCac} currency={currency} locale={locale} />
          </section>
        ) : null}

        {/* Bundle / refund placeholders */}
        <section className="space-y-3">
          <SectionHead
            eyebrow="Coming next"
            title="Bundles & refunds — what we'll surface here"
            hint="Currently placeholders. They'll light up once we ingest bundle composition and refund reasons."
          />
          <div className="grid items-start gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-base">{dictionary.profit.bundleImpact}</CardTitle>
                  <HelpTip>{tips.bundleImpact}</HelpTip>
                </div>
                <p className="text-sm text-muted-foreground">{dictionary.profit.bundleDescription}</p>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-muted-foreground">{dictionary.profit.bundleTodo}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-base">{dictionary.profit.refundImpact}</CardTitle>
                  <HelpTip>{tips.refundImpact}</HelpTip>
                </div>
                <p className="text-sm text-muted-foreground">{dictionary.profit.refundDescription}</p>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-muted-foreground">{dictionary.profit.refundTodo}</p>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function ChannelCacTable({
  report,
  currency,
  locale
}: {
  report: import("@/lib/services/channel-cac-service").ChannelCacReport;
  currency: string;
  locale: "he" | "en";
}) {
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);
  const fmt = (n: number) => formatCurrency(n, currency);
  const recPill = (rec: import("@/lib/services/channel-cac-service").ChannelCacRow["recommendation"]) => {
    const label = {
      push: { he: "להגדיל", en: "Push" },
      hold: { he: "להחזיק", en: "Hold" },
      review: { he: "לעיין", en: "Review" },
      starve: { he: "להרעיב", en: "Starve" },
      no_data: { he: "אין נתונים", en: "No data" }
    }[rec];
    const cls = {
      push: "bg-emerald-100 text-emerald-900 border-emerald-300",
      hold: "bg-sky-100 text-sky-900 border-sky-300",
      review: "bg-amber-100 text-amber-900 border-amber-300",
      starve: "bg-rose-100 text-rose-900 border-rose-300",
      no_data: "bg-slate-100 text-slate-700 border-slate-300"
    }[rec];
    return (
      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
        {label[isHe ? "he" : "en"]}
      </span>
    );
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-xs">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-3 py-2 text-start text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {lang("ערוץ", "Channel")}
            </th>
            <th className="px-3 py-2 text-end text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {lang("הזמנות", "Orders")}
            </th>
            <th className="px-3 py-2 text-end text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {lang("הכנסה", "Revenue")}
            </th>
            <th className="px-3 py-2 text-end text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {lang("הוצאה", "Spend")}
            </th>
            <th className="px-3 py-2 text-end text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {lang("רווח תרומה", "Contribution")}
            </th>
            <th className="px-3 py-2 text-end text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {lang("מרווח %", "Margin %")}
            </th>
            <th className="px-3 py-2 text-end text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              CAC
            </th>
            <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {lang("המלצה", "Verdict")}
            </th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((r) => (
            <tr key={r.channel} className="border-t border-border">
              <td className="px-3 py-2">
                <div className="font-semibold">{r.displayName}</div>
                <div className="text-[10px] text-muted-foreground">
                  {r.spendSource === "meta_insights"
                    ? lang("מקור עלות: Meta Insights", "Cost source: Meta Insights")
                    : r.spendSource === "affiliate_commission"
                      ? lang("מקור עלות: עמלות שותפים", "Cost source: affiliate commissions")
                      : r.spendSource === "assumed_zero"
                        ? lang("מקור עלות: 0 (אורגני)", "Cost source: 0 (organic)")
                        : lang("מקור עלות: לא ידוע", "Cost source: unknown")}
                </div>
              </td>
              <td className="px-3 py-2 text-end">{r.orders}</td>
              <td className="px-3 py-2 text-end">{fmt(r.revenue)}</td>
              <td className="px-3 py-2 text-end">
                {r.attributedSpend > 0 ? fmt(r.attributedSpend) : "—"}
              </td>
              <td className={`px-3 py-2 text-end font-semibold ${r.contributionMargin < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                {fmt(r.contributionMargin)}
              </td>
              <td className="px-3 py-2 text-end">
                {(r.contributionMarginRate * 100).toFixed(1)}%
              </td>
              <td className="px-3 py-2 text-end">
                {r.cac != null ? fmt(r.cac) : "—"}
              </td>
              <td className="px-3 py-2 text-center">{recPill(r.recommendation)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-border bg-slate-50 px-3 py-2 text-[10px] text-muted-foreground">
        {lang(
          `כיסוי שיוך: ${Math.round(report.attributionCoverage * 100)}% · הקצאת COGS פר ערוץ ב-v1 לפי משקל הכנסה (יחודד בעתיד)`,
          `Attribution coverage: ${Math.round(report.attributionCoverage * 100)}% · v1 allocates COGS per channel by revenue share (refined in future)`
        )}
      </div>
    </div>
  );
}
