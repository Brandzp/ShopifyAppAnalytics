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
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <SectionHeading eyebrow="Affiliate Portal" title="תשלומים ויתרות מאושרות" description="מי זכאי לתשלום, כמה הזמנות מאושרות יש לכל אפיליאייט ואיפה חסר payment method." />
        <AffiliatePortalNav />
      </section>

      <DataTable
        title="Approved balance"
        columns={[
          { key: "affiliateName", label: "אפליאייט" },
          { key: "paymentMethod", label: "אמצעי תשלום" },
          { key: "approvedOrders", label: "הזמנות מאושרות", render: (row) => formatNumber(row.approvedOrders) },
          { key: "approvedBalance", label: "יתרה מאושרת", render: (row) => formatCurrency(row.approvedBalance, chrome.store.currency) }
        ]}
        rows={payouts}
      />
    </AppShell>
  );
}
