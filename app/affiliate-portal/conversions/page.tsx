import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { AffiliatePortalNav } from "@/components/affiliate-portal/portal-nav";
import { AffiliateAttributionSyncButton } from "@/components/affiliate-portal/affiliate-attribution-sync-button";
import { UploadConversionsCsvButton } from "@/components/affiliate-portal/upload-conversions-csv-button";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAffiliateConversions } from "@/lib/services/affiliate-portal-service";
import { DataTable } from "@/components/shared/data-table";
import { formatCurrency } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export default async function ConversionsPage() {
  const [chrome, conversions] = await Promise.all([getAppChromeData(), getAffiliateConversions()]);

  return (
    <AppShell store={chrome.store} controls={chrome.controls} localeOverride="en">
      <section className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            eyebrow="Affiliate Portal"
            title="Referral orders and attributions"
            description="Track which affiliate orders were matched, how they were tracked, and what commission they generated."
          />
          <div className="flex flex-wrap items-start gap-3">
            <AffiliateAttributionSyncButton storeId={chrome.store.id} />
            <UploadConversionsCsvButton />
            <a href="/api/affiliate-portal/conversions/export" className={buttonVariants({ variant: "secondary" })}>
              Export CSV
            </a>
          </div>
        </div>
        <AffiliatePortalNav />
      </section>

      <DataTable
        title="Referral orders"
        description="Orders attributed to affiliates from Shopify discount usage and referral matching."
        columns={[
          { key: "orderNumber", label: "Order" },
          { key: "date", label: "Date", render: (row) => new Date(row.date).toLocaleString("en-US") },
          { key: "affiliateName", label: "Affiliate" },
          { key: "total", label: "Total", render: (row) => formatCurrency(row.total, chrome.store.currency) },
          { key: "commission", label: "Commission", render: (row) => formatCurrency(row.commission, chrome.store.currency) },
          { key: "status", label: "Status" },
          { key: "trackingBy", label: "Tracking" },
          { key: "contentTitle", label: "Content" }
        ]}
        rows={conversions}
      />
    </AppShell>
  );
}
