import { Coins, MousePointerClick, ShoppingBag, Trophy, Users2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";
import { NarrativeBanner } from "@/components/dashboard-v2/narrative-banner";
import { PageHead, SectionHead } from "@/components/dashboard-v2/section-head";
import { StatTile } from "@/components/dashboard-v2/kpi-tile";
import { AffiliatePortalNav } from "@/components/affiliate-portal/portal-nav";
import { AffiliateAttributionSyncButton } from "@/components/affiliate-portal/affiliate-attribution-sync-button";
import { AffiliateTrendChart } from "@/components/charts/affiliate-trend-chart";
import { DataTable } from "@/components/shared/data-table";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAffiliatePortalDashboard } from "@/lib/services/affiliate-portal-service";
import { formatCurrency, formatNumber } from "@/lib/utils";

export default async function AffiliatePortalDashboardPage() {
  const [chrome, dashboard] = await Promise.all([getAppChromeData(), getAffiliatePortalDashboard()]);
  const totals = dashboard.totals;
  const currency = chrome.store.currency;

  // Narrative
  const tone = totals.totalSales > 0 ? "up" : "neutral";
  const conversion =
    totals.totalClicks > 0 ? ((totals.totalOrders / totals.totalClicks) * 100).toFixed(1) : "0.0";
  const headline =
    totals.totalSales > 0
      ? `${formatNumber(totals.totalAffiliates)} affiliates drove ${formatCurrency(totals.totalSales, currency)} this period.`
      : "No affiliate-attributed sales yet — onboard your first affiliate or run a sync.";
  const body = [
    `${formatNumber(totals.totalClicks)} clicks → ${formatNumber(totals.totalOrders)} orders (${conversion}% conversion).`,
    totals.totalCommission > 0
      ? `You owe ${formatCurrency(totals.totalCommission, currency)} in commission.`
      : null,
    dashboard.scope.description
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <AppShell store={chrome.store} controls={chrome.controls} localeOverride="en">
      <div className="space-y-6 sm:space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <PageHead
            eyebrow="Affiliate Portal"
            title="Affiliate program performance, creators, and revenue"
            description="One workspace for affiliates, conversions, coupons, content, payouts, and Shopify-attributed sales."
          />
          <AffiliateAttributionSyncButton storeId={chrome.store.id} />
        </div>

        <NarrativeBanner
          eyebrow="Affiliate pulse"
          headline={headline}
          body={body}
          tone={tone}
          toneLabel={totals.totalSales > 0 ? "Driving sales" : "Get started"}
        />

        <AffiliatePortalNav />

        <section className="space-y-3">
          <SectionHead
            eyebrow="Step 1"
            title="Top-level totals"
            hint="Five numbers that tell you how your affiliate program is performing right now."
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatTile
              label="Total sales"
              value={formatCurrency(totals.totalSales, currency)}
              icon={ShoppingBag}
              tooltip="Gross revenue from orders attributed through the active affiliate tracking scope in the selected window."
            />
            <StatTile
              label="Total orders"
              value={formatNumber(totals.totalOrders)}
              icon={Trophy}
              tooltip="Number of orders matched to an affiliate via the active link, coupon, or tracking scope."
            />
            <StatTile
              label="Total clicks"
              value={formatNumber(totals.totalClicks)}
              icon={MousePointerClick}
              tooltip="Affiliate-link clicks logged in the window. Click → order ratio = your funnel signal."
              hint={`${conversion}% click-to-order`}
            />
            <StatTile
              label="Affiliates active"
              value={formatNumber(totals.totalAffiliates)}
              icon={Users2}
              tooltip="Affiliates with at least one click or order in the window."
            />
            <StatTile
              label="Commission owed"
              value={formatCurrency(totals.totalCommission, currency)}
              icon={Coins}
              tooltip="What you owe affiliates for orders in this window. Configure rates per program."
            />
          </div>
        </section>

        <section className="space-y-3">
          <SectionHead
            eyebrow="Step 2"
            title="Trend & active program"
            hint="Left chart = daily sales + clicks, watch the gap (widening = funnel issue). Right card = your live program details."
          />
          <div className="grid items-start gap-4 xl:grid-cols-[1.5fr_1fr]">
            <Card className="min-w-0">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-base">Affiliate sales trend</CardTitle>
                  <HelpTip width="lg">
                    Two series on one chart: revenue from affiliate-attributed orders (left axis) and click volume (right axis). Watch the gap — widening = funnel issue.
                  </HelpTip>
                </div>
                <p className="text-sm text-muted-foreground">
                  Daily sales and clicks generated through the active affiliate tracking scope.
                </p>
              </CardHeader>
              <CardContent>
                <AffiliateTrendChart data={dashboard.trend} currency={currency} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Active program</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border border-indigo-200/60 bg-indigo-50/40 p-4">
                  <p className="text-lg font-semibold">{dashboard.program.name}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {formatNumber(dashboard.program.affiliates)} affiliates · {formatNumber(dashboard.program.orders)} orders · {formatCurrency(dashboard.program.sales, currency)}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-background/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Sign-up link
                  </p>
                  <p className="mt-2 break-all text-sm font-mono">{dashboard.program.signUpLink}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="space-y-3">
          <SectionHead
            eyebrow="Step 3"
            title="Who's bringing in the most"
            hint="Sort affiliates two ways: by sales (best earners) and by clicks (best at driving traffic)."
          />
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <DataTable
              title="Top affiliates by sales"
              tooltip="Affiliates ranked by attributed revenue."
              paginate
              initialPageSize={20}
              pageSizes={[20, 50, 100]}
              columns={[
                { key: "firstName", label: "Affiliate", render: (row) => `${row.firstName} ${row.lastName}` },
                { key: "clicks", label: "Clicks", render: (row) => formatNumber(row.clicks) },
                { key: "orders", label: "Orders", render: (row) => formatNumber(row.orders) },
                { key: "sales", label: "Sales", render: (row) => formatCurrency(row.sales, currency) }
              ]}
              rows={dashboard.topAffiliatesBySales}
            />
            <DataTable
              title="Top affiliates by clicks"
              tooltip="Affiliates ranked by traffic — useful for finding under-converting promoters."
              paginate
              initialPageSize={20}
              pageSizes={[20, 50, 100]}
              columns={[
                { key: "firstName", label: "Affiliate", render: (row) => `${row.firstName} ${row.lastName}` },
                { key: "clicks", label: "Clicks", render: (row) => formatNumber(row.clicks) },
                { key: "orders", label: "Orders", render: (row) => formatNumber(row.orders) },
                { key: "sales", label: "Sales", render: (row) => formatCurrency(row.sales, currency) }
              ]}
              rows={dashboard.topAffiliatesByClicks}
            />
          </div>
        </section>

        <section className="space-y-3">
          <SectionHead
            eyebrow="Step 4"
            title="What products and sources are working"
            hint="Left = best products from affiliate channels. Right = best referral sources (sites, platforms, link tags)."
          />
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <DataTable
              title="Top products from affiliate sales"
              paginate
              initialPageSize={20}
              pageSizes={[20, 50, 100]}
              columns={[
                { key: "name", label: "Product" },
                { key: "sales", label: "Sales", render: (row) => formatCurrency(row.sales, currency) }
              ]}
              rows={dashboard.topProducts}
            />
            <DataTable
              title="Top referral sources"
              paginate
              initialPageSize={20}
              pageSizes={[20, 50, 100]}
              columns={[
                { key: "label", label: "Source" },
                { key: "clicks", label: "Clicks", render: (row) => formatNumber(row.clicks) }
              ]}
              rows={dashboard.topReferralSources}
            />
          </div>
        </section>

        <section className="space-y-3">
          <SectionHead
            eyebrow="Step 5"
            title="Content driving the program"
            hint="The posts and content pieces that produced the most sales — see which creative is working best."
          />
          <DataTable
            title="Top content by sales"
            description="The posts and content pieces that produced the most sales."
            paginate
            initialPageSize={20}
            pageSizes={[20, 50, 100]}
            columns={[
              { key: "affiliateName", label: "Affiliate" },
              { key: "title", label: "Content" },
              { key: "views", label: "Views", render: (row) => formatNumber(row.views) },
              { key: "clicks", label: "Clicks", render: (row) => formatNumber(row.clicks) },
              { key: "orders", label: "Orders", render: (row) => formatNumber(row.orders) },
              { key: "sales", label: "Sales", render: (row) => formatCurrency(row.sales, currency) }
            ]}
            rows={dashboard.contentHighlights}
          />
        </section>
      </div>
    </AppShell>
  );
}
