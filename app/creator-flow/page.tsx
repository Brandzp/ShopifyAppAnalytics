import { Camera, Eye, Heart, MessageCircle, Percent, ShoppingBag } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";
import { NarrativeBanner } from "@/components/dashboard-v2/narrative-banner";
import { PageHead, SectionHead } from "@/components/dashboard-v2/section-head";
import { StatTile } from "@/components/dashboard-v2/kpi-tile";
import { BarInsightChart } from "@/components/charts/bar-insight-chart";
import { DataTable } from "@/components/shared/data-table";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getCreatorAnalyticsPayload } from "@/lib/services/creator-analytics-service";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { getAppLocale, getDictionary } from "@/lib/i18n";

export default async function CreatorFlowPage() {
  const locale = await getAppLocale();
  const dictionary = getDictionary(locale);
  const [chrome, payload] = await Promise.all([getAppChromeData(), getCreatorAnalyticsPayload()]);
  const currency = chrome.store.currency;

  // Narrative
  const tone = payload.attributedSales > 0 ? "up" : "neutral";
  const headline =
    payload.totalPosts > 0
      ? `${formatNumber(payload.totalPosts)} posts analyzed — ${formatNumber(payload.totalLikes)} likes, ${formatNumber(payload.totalComments)} comments.`
      : "Connect a creator account in Settings to start analyzing posts.";
  const body = [
    payload.attributedSales > 0
      ? `Attributed sales: ${formatCurrency(payload.attributedSales, currency)}.`
      : null,
    payload.engagementRate > 0
      ? `Engagement rate is ${payload.engagementRate.toFixed(1)}% — ${
          payload.engagementRate >= 5 ? "strong" : payload.engagementRate >= 2 ? "average" : "low"
        }.`
      : null
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 sm:space-y-8">
        <PageHead
          eyebrow={dictionary.creator.eyebrow}
          title={dictionary.creator.title}
          description={dictionary.creator.description}
        />

        <NarrativeBanner
          eyebrow="Creator commerce pulse"
          headline={headline}
          body={body}
          tone={tone}
          toneLabel={payload.attributedSales > 0 ? "Driving sales" : "Connect to start"}
        />

        <section className="space-y-3">
          <SectionHead
            eyebrow="Step 1"
            title="Reach & engagement at a glance"
            hint="Six numbers that tell you which creator content actually moves product."
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <StatTile
              label={dictionary.creator.postsAnalyzed}
              value={formatNumber(payload.totalPosts)}
              icon={Camera}
              tooltip="Posts pulled from connected creator accounts in the selected window."
              hint="From connected accounts."
            />
            <StatTile
              label={dictionary.creator.likes}
              value={formatNumber(payload.totalLikes)}
              icon={Heart}
              tooltip="Total likes across the analyzed posts."
            />
            <StatTile
              label={dictionary.creator.comments}
              value={formatNumber(payload.totalComments)}
              icon={MessageCircle}
              tooltip="Total comments across the analyzed posts."
            />
            <StatTile
              label={dictionary.creator.views}
              value={formatNumber(payload.totalViews)}
              icon={Eye}
              tooltip="Reach / view count where the platform exposes it."
            />
            <StatTile
              label={dictionary.creator.attributedSales}
              value={formatCurrency(payload.attributedSales, currency)}
              icon={ShoppingBag}
              tooltip="Sales matched back to creator posts via referral links, codes, or campaign tags."
              hint="Linked to specific posts."
            />
            <StatTile
              label={dictionary.creator.engagementRate}
              value={`${payload.engagementRate.toFixed(1)}%`}
              icon={Percent}
              tooltip="(likes + comments) ÷ views, averaged across analyzed posts. Higher = stickier content."
              hint="(likes + comments) ÷ views."
            />
          </div>
        </section>

        <section className="space-y-3">
          <SectionHead
            eyebrow="Step 2"
            title="Where reach turns into revenue"
            hint="Left chart = posts ranked by attributed revenue. Right chart = posts ranked by views — gaps between them = monetization opportunity."
          />
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-base">{dictionary.creator.topPostsTitle}</CardTitle>
                  <HelpTip>Posts ranked by attributed revenue — your highest commercial-value content.</HelpTip>
                </div>
                <p className="text-sm text-muted-foreground">{dictionary.creator.topPostsDescription}</p>
              </CardHeader>
              <CardContent>
                <BarInsightChart
                  data={payload.topPosts.map((post) => ({
                    caption: post.caption.slice(0, 28),
                    attributedSales: post.attributedSales
                  }))}
                  dataKey="attributedSales"
                  xKey="caption"
                  format="currency"
                  currency={currency}
                  valueLabel="Attributed sales"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-base">{dictionary.creator.engagementTitle}</CardTitle>
                  <HelpTip>Find posts that get attention but under-convert. Strong views with low attributed sales = monetization opportunity.</HelpTip>
                </div>
                <p className="text-sm text-muted-foreground">{dictionary.creator.engagementDescription}</p>
              </CardHeader>
              <CardContent>
                <BarInsightChart
                  data={payload.postPerformance.map((post) => ({
                    caption: post.caption.slice(0, 28),
                    views: post.views || post.likes + post.comments
                  }))}
                  dataKey="views"
                  xKey="caption"
                  format="number"
                  color="#0080FF"
                  valueLabel="Views"
                />
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="space-y-3">
          <SectionHead
            eyebrow="Step 3"
            title="The full post performance table"
            hint="Per-post breakdown of engagement and attributed sales. Sortable + paginated."
          />
          <DataTable
            title={dictionary.creator.tableTitle}
            description={dictionary.creator.tableDescription}
            tooltip="Per-post breakdown: caption, type, engagement, and attributed sales."
            paginate
            initialPageSize={20}
            pageSizes={[20, 50, 100]}
            columns={[
              { key: "caption", label: dictionary.creator.post },
              { key: "mediaType", label: dictionary.creator.type, tooltip: "Reel, image, carousel, or story." },
              { key: "likes", label: dictionary.creator.likes, render: (row) => formatNumber(Number(row.likes)) },
              {
                key: "comments",
                label: dictionary.creator.comments,
                render: (row) => formatNumber(Number(row.comments))
              },
              { key: "views", label: dictionary.creator.views, render: (row) => formatNumber(Number(row.views)) },
              {
                key: "attributedSales",
                label: dictionary.creator.sales,
                tooltip: "Revenue attributed to this specific post.",
                render: (row) => formatCurrency(Number(row.attributedSales), currency)
              },
              {
                key: "attributedOrders",
                label: dictionary.creator.orders,
                tooltip: "Number of orders attributed to this post.",
                render: (row) => formatNumber(Number(row.attributedOrders))
              }
            ]}
            rows={payload.postPerformance}
          />
        </section>
      </div>
    </AppShell>
  );
}
