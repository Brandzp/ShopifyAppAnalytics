import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { AffiliatePortalNav } from "@/components/affiliate-portal/portal-nav";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAffiliateCoupons, getCouponTemplates, getAffiliates } from "@/lib/services/affiliate-portal-service";
import { DataTable } from "@/components/shared/data-table";
import { AffiliateLinkBuilder } from "@/components/affiliate-portal/affiliate-link-builder";
import { AffiliateAttributionSyncButton } from "@/components/affiliate-portal/affiliate-attribution-sync-button";

export default async function CouponsPage() {
  const [chrome, coupons, templates, affiliates] = await Promise.all([
    getAppChromeData(),
    getAffiliateCoupons(),
    getCouponTemplates(),
    getAffiliates()
  ]);
  const baseStoreUrl = `https://${chrome.store.domain}`;

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading eyebrow="Affiliate Portal" title="??????? ??????? ?? ????" description="????? ????? ????? ?-Shopify, ???? ?????????? ????? ????? ??? ???? ??? ????? ?????? ??? ???? ?????." />
          <AffiliateAttributionSyncButton label="?????? ?????? ???? ????? ?????" />
        </div>
        <AffiliatePortalNav />
      </section>

      <AffiliateLinkBuilder baseStoreUrl={baseStoreUrl} affiliates={affiliates} templates={templates} />

      <DataTable
        title="??????? ??????"
        description="?? ????? ????? ????? ????? ?? apply link ???? ??????."
        columns={[
          { key: "code", label: "?????" },
          { key: "status", label: "?????" },
          { key: "affiliateName", label: "????????" },
          { key: "template", label: "?????" },
          { key: "discountLabel", label: "????" },
          { key: "applyLink", label: "???? apply", render: (row) => <span className="block max-w-[28rem] break-all text-xs text-muted-foreground">{row.applyLink}</span> },
          { key: "createdAt", label: "?????", render: (row) => new Date(row.createdAt).toLocaleString("he-IL") }
        ]}
        rows={coupons}
      />
    </AppShell>
  );
}
