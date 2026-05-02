import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { AffiliatePortalNav } from "@/components/affiliate-portal/portal-nav";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAffiliates } from "@/lib/services/affiliate-portal-service";
import { DataTable } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

export default async function AffiliatesPage() {
  const [chrome, affiliates] = await Promise.all([getAppChromeData(), getAffiliates()]);

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading eyebrow="Affiliate Portal" title="ניהול אפליאייטים" description="רשימת אפליאייטים עם סטטוס, מקור הצטרפות, קופון, כניסה אחרונה וגישה לעמוד הפרופיל המלא." />
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary">Import</Button>
            <Button variant="secondary">Export</Button>
            <Button>הוספת אפליאייט</Button>
          </div>
        </div>
        <AffiliatePortalNav />
      </section>

      <DataTable
        title="כל האפליאייטים"
        columns={[
          { key: "firstName", label: "אפליאייט", render: (row) => <Link href={`/affiliate-portal/affiliates/${row.id}`} className="font-semibold hover:underline">{row.firstName} {row.lastName}<br /><span className="font-normal text-muted-foreground">{row.email}</span></Link> },
          { key: "programName", label: "תוכנית" },
          { key: "status", label: "סטטוס" },
          { key: "dateJoined", label: "הצטרף בתאריך", render: (row) => new Date(row.dateJoined).toLocaleString() },
          { key: "lastLogin", label: "כניסה אחרונה", render: (row) => row.lastLogin ? new Date(row.lastLogin).toLocaleString() : "-" },
          { key: "source", label: "מקור" },
          { key: "couponCode", label: "קופון", render: (row) => row.couponCode ?? "-" },
          { key: "sales", label: "מכירות", render: (row) => formatCurrency(row.sales, chrome.store.currency) }
        ]}
        rows={affiliates}
      />
    </AppShell>
  );
}
