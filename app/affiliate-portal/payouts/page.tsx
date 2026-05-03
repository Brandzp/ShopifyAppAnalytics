import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { AffiliatePortalNav } from "@/components/affiliate-portal/portal-nav";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAffiliatePayouts } from "@/lib/services/affiliate-portal-service";
import { DataTable } from "@/components/shared/data-table";
import { formatCurrency, formatNumber } from "@/lib/utils";

export default async function PayoutsPage() {
  const [chrome, payouts] = await Promise.all([getAppChromeData(), getAffiliatePayouts()]);

  return (
    <AppShell store={chrome.store} controls={chrome.controls} localeOverride="en">
      <section className="space-y-4">
        <SectionHeading
          eyebrow="Affiliate Portal"
          title="Payouts and approved balances"
          description="See who is ready for payment, how many approved orders each affiliate has, and where payment setup is still missing."
        />
        <AffiliatePortalNav />
      </section>

      <DataTable
        title="Approved balance"
        columns={[
          { key: "affiliateName", label: "Affiliate" },
          { key: "paymentMethod", label: "Payment method" },
          { key: "approvedOrders", label: "Approved orders", render: (row) => formatNumber(row.approvedOrders) },
          { key: "approvedBalance", label: "Approved balance", render: (row) => formatCurrency(row.approvedBalance, chrome.store.currency) }
        ]}
        rows={payouts}
      />
    </AppShell>
  );
}
