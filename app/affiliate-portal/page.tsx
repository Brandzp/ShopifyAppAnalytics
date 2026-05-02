import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { AffiliatePortalNav } from "@/components/affiliate-portal/portal-nav";
import { AffiliateAttributionSyncButton } from "@/components/affiliate-portal/affiliate-attribution-sync-button";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAffiliatePortalDashboard } from "@/lib/services/affiliate-portal-service";
import { StatCard } from "@/components/shared/stat-card";
import { ChartCard } from "@/components/shared/chart-card";
import { AffiliateTrendChart } from "@/components/charts/affiliate-trend-chart";
import { DataTable } from "@/components/shared/data-table";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AffiliatePortalDashboardPage() {
  const [chrome, dashboard] = await Promise.all([getAppChromeData(), getAffiliatePortalDashboard()]);

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            eyebrow="Affiliate Portal"
            title="פורטל שותפים לניהול תוכנית, יוצרים וביצועים"
            description="מרכז אחד לניהול אפיליאייטים, המרות, קופונים, תוכן, תשלומים וביצועי מכירה שמגיעים מ-Shopify."
          />
          <AffiliateAttributionSyncButton label="סנכרון המרות אפיליאייט מ-Shopify" />
        </div>
        <AffiliatePortalNav />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="סה״כ מכירות" value={formatCurrency(dashboard.totals.totalSales, chrome.store.currency)} />
        <StatCard label="סה״כ הזמנות" value={formatNumber(dashboard.totals.totalOrders)} />
        <StatCard label="סה״כ קליקים" value={formatNumber(dashboard.totals.totalClicks)} />
        <StatCard label="כמות שותפים" value={formatNumber(dashboard.totals.totalAffiliates)} />
        <StatCard label="סה״כ עמלה" value={formatCurrency(dashboard.totals.totalCommission, chrome.store.currency)} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <ChartCard title="מגמת מכירות שותפים" description="מבט יומי על מכירות וקליקים שהגיעו דרך תוכנית השותפים.">
          <AffiliateTrendChart data={dashboard.trend} currency={chrome.store.currency} />
        </ChartCard>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">תוכנית פעילה</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
              <p className="text-lg font-semibold">{dashboard.program.name}</p>
              <p className="mt-2 text-sm text-muted-foreground">{dashboard.program.affiliates} שותפים · {dashboard.program.orders} הזמנות · {formatCurrency(dashboard.program.sales, chrome.store.currency)}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
              <p className="text-sm text-muted-foreground">לינק הרשמה</p>
              <p className="mt-2 text-sm break-all">{dashboard.program.signUpLink}</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <DataTable
          title="שותפים מובילים לפי מכירות"
          columns={[
            { key: "firstName", label: "שם", render: (row) => `${row.firstName} ${row.lastName}` },
            { key: "clicks", label: "קליקים", render: (row) => formatNumber(row.clicks) },
            { key: "orders", label: "הזמנות", render: (row) => formatNumber(row.orders) },
            { key: "sales", label: "מכירות", render: (row) => formatCurrency(row.sales, chrome.store.currency) }
          ]}
          rows={dashboard.topAffiliatesBySales}
        />
        <DataTable
          title="שותפים מובילים לפי קליקים"
          columns={[
            { key: "firstName", label: "שם", render: (row) => `${row.firstName} ${row.lastName}` },
            { key: "clicks", label: "קליקים", render: (row) => formatNumber(row.clicks) },
            { key: "orders", label: "הזמנות", render: (row) => formatNumber(row.orders) },
            { key: "sales", label: "מכירות", render: (row) => formatCurrency(row.sales, chrome.store.currency) }
          ]}
          rows={dashboard.topAffiliatesByClicks}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <DataTable
          title="מוצרים מובילים ממכירות שותפים"
          columns={[
            { key: "name", label: "מוצר" },
            { key: "sales", label: "מכירות", render: (row) => formatCurrency(row.sales, chrome.store.currency) }
          ]}
          rows={dashboard.topProducts}
        />
        <DataTable
          title="מקורות תנועה מובילים"
          columns={[
            { key: "label", label: "מקור" },
            { key: "clicks", label: "קליקים", render: (row) => formatNumber(row.clicks) }
          ]}
          rows={dashboard.topReferralSources}
        />
      </section>

      <DataTable
        title="תוכן מוביל לפי מכירות"
        description="הפוסטים והתכנים שהביאו הכי הרבה מכירות, כדי להבין איזה סוג תוכן עובד הכי טוב אצל השותפים שלך."
        columns={[
          { key: "affiliateName", label: "שותף" },
          { key: "title", label: "תוכן" },
          { key: "views", label: "צפיות", render: (row) => formatNumber(row.views) },
          { key: "clicks", label: "קליקים", render: (row) => formatNumber(row.clicks) },
          { key: "orders", label: "הזמנות", render: (row) => formatNumber(row.orders) },
          { key: "sales", label: "מכירות", render: (row) => formatCurrency(row.sales, chrome.store.currency) }
        ]}
        rows={dashboard.contentHighlights}
      />
    </AppShell>
  );
}
