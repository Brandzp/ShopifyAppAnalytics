import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatCard } from "@/components/shared/stat-card";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getCreatorAnalyticsPayload } from "@/lib/services/creator-analytics-service";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { ChartCard } from "@/components/shared/chart-card";
import { BarInsightChart } from "@/components/charts/bar-insight-chart";
import { DataTable } from "@/components/shared/data-table";
import { getAppLocale, getDictionary } from "@/lib/i18n";

export default async function CreatorFlowPage() {
  const locale = await getAppLocale();
  const dictionary = getDictionary(locale);
  const [chrome, payload] = await Promise.all([getAppChromeData(), getCreatorAnalyticsPayload()]);

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <SectionHeading
          eyebrow={dictionary.creator.eyebrow}
          title={dictionary.creator.title}
          description={dictionary.creator.description}
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard label={dictionary.creator.postsAnalyzed} value={formatNumber(payload.totalPosts)} />
        <StatCard label={dictionary.creator.likes} value={formatNumber(payload.totalLikes)} />
        <StatCard label={dictionary.creator.comments} value={formatNumber(payload.totalComments)} />
        <StatCard label={dictionary.creator.views} value={formatNumber(payload.totalViews)} />
        <StatCard label={dictionary.creator.attributedSales} value={formatCurrency(payload.attributedSales, chrome.store.currency)} />
        <StatCard label={dictionary.creator.engagementRate} value={`${payload.engagementRate.toFixed(1)}%`} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ChartCard title={dictionary.creator.topPostsTitle} description={dictionary.creator.topPostsDescription}>
          <BarInsightChart
            data={payload.topPosts.map((post) => ({
              caption: post.caption.slice(0, 28),
              attributedSales: post.attributedSales
            }))}
            dataKey="attributedSales"
            xKey="caption"
            format="currency"
            currency={chrome.store.currency}
          />
        </ChartCard>
        <ChartCard title={dictionary.creator.engagementTitle} description={dictionary.creator.engagementDescription}>
          <BarInsightChart
            data={payload.postPerformance.map((post) => ({
              caption: post.caption.slice(0, 28),
              views: post.views || post.likes + post.comments
            }))}
            dataKey="views"
            xKey="caption"
            format="number"
            color="#2563eb"
          />
        </ChartCard>
      </section>

      <DataTable
        title={dictionary.creator.tableTitle}
        description={dictionary.creator.tableDescription}
        columns={[
          { key: "caption", label: dictionary.creator.post },
          { key: "mediaType", label: dictionary.creator.type },
          { key: "likes", label: dictionary.creator.likes, render: (row) => formatNumber(Number(row.likes)) },
          { key: "comments", label: dictionary.creator.comments, render: (row) => formatNumber(Number(row.comments)) },
          { key: "views", label: dictionary.creator.views, render: (row) => formatNumber(Number(row.views)) },
          { key: "attributedSales", label: dictionary.creator.sales, render: (row) => formatCurrency(Number(row.attributedSales), chrome.store.currency) },
          { key: "attributedOrders", label: dictionary.creator.orders, render: (row) => formatNumber(Number(row.attributedOrders)) }
        ]}
        rows={payload.postPerformance}
      />
    </AppShell>
  );
}
