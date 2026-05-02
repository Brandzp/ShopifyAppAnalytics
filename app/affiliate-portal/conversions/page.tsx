import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { AffiliatePortalNav } from "@/components/affiliate-portal/portal-nav";
import { AffiliateAttributionSyncButton } from "@/components/affiliate-portal/affiliate-attribution-sync-button";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAffiliateConversions } from "@/lib/services/affiliate-portal-service";
import { DataTable } from "@/components/shared/data-table";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export default async function ConversionsPage() {
  const [chrome, conversions] = await Promise.all([getAppChromeData(), getAffiliateConversions()]);

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading eyebrow="Affiliate Portal" title="????? ??????? ?????????" description="?? ??????? ?????? ?????, ????? ?? ????? ??????, ???? ???? ????? ???? ?? ??????." />
          <div className="flex flex-wrap gap-3">
            <AffiliateAttributionSyncButton />
            <Button variant="secondary">Export</Button>
          </div>
        </div>
        <AffiliatePortalNav />
      </section>

      <DataTable
        title="Referral orders"
        description="????? ????? ?? ???? ????? ??????? Shopify ??? ????? ????????? ????? ?????."
        columns={[
          { key: "orderNumber", label: "?????" },
          { key: "date", label: "?????", render: (row) => new Date(row.date).toLocaleString("he-IL") },
          { key: "affiliateName", label: "????????" },
          { key: "total", label: "????", render: (row) => formatCurrency(row.total, chrome.store.currency) },
          { key: "commission", label: "????", render: (row) => formatCurrency(row.commission, chrome.store.currency) },
          { key: "status", label: "?????" },
          { key: "trackingBy", label: "????" },
          { key: "contentTitle", label: "????" }
        ]}
        rows={conversions}
      />
    </AppShell>
  );
}
