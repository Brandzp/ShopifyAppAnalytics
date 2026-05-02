import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { AffiliatePortalNav } from "@/components/affiliate-portal/portal-nav";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAffiliateContentPerformance } from "@/lib/services/affiliate-portal-service";
import { DataTable } from "@/components/shared/data-table";
import { formatCurrency, formatNumber } from "@/lib/utils";

export default async function AffiliateContentPage() {
  const [chrome, content] = await Promise.all([getAppChromeData(), getAffiliateContentPerformance()]);

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <SectionHeading eyebrow="Affiliate Portal" title="מה עובד בתוכן ומה לא" description="הדף הקריטי למטרה שלך: לקבל דאטה פר אפיליאייט ולראות איזה תוכן באמת מביא קליקים, הזמנות ומכירות." />
        <AffiliatePortalNav />
      </section>

      <DataTable
        title="ביצועי תוכן לפי אפיליאייט"
        columns={[
          { key: "affiliateName", label: "אפליאייט" },
          { key: "title", label: "תוכן" },
          { key: "contentType", label: "סוג" },
          { key: "views", label: "צפיות", render: (row) => formatNumber(row.views) },
          { key: "clicks", label: "קליקים", render: (row) => formatNumber(row.clicks) },
          { key: "orders", label: "הזמנות", render: (row) => formatNumber(row.orders) },
          { key: "sales", label: "מכירות", render: (row) => formatCurrency(row.sales, chrome.store.currency) }
        ]}
        rows={content}
      />
    </AppShell>
  );
}
