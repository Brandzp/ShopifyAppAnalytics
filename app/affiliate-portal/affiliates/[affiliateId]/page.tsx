import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { AffiliatePortalNav } from "@/components/affiliate-portal/portal-nav";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAffiliateById, getCouponTemplates } from "@/lib/services/affiliate-portal-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { DataTable } from "@/components/shared/data-table";
import { AffiliateLinkBuilder } from "@/components/affiliate-portal/affiliate-link-builder";

export default async function AffiliateDetailPage({ params }: { params: Promise<{ affiliateId: string }> }) {
  const [{ affiliateId }, chrome, templates] = await Promise.all([params, getAppChromeData(), getCouponTemplates()]);
  const payload = await getAffiliateById(affiliateId);

  if (!payload) notFound();

  const { affiliate, coupons, conversions, content } = payload;
  const baseStoreUrl = `https://${chrome.store.domain}`;

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <SectionHeading
          eyebrow="Affiliate Portal"
          title={`${affiliate.firstName} ${affiliate.lastName}`}
          description="???? ????????? ??? ?? ?????, ?????? ?????, ???????, ?????? ???? ?????? ?????."
        />
        <AffiliatePortalNav />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">??????</p><p className="mt-2 text-2xl font-semibold">{formatCurrency(affiliate.sales, chrome.store.currency)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">????</p><p className="mt-2 text-2xl font-semibold">{formatCurrency(affiliate.commission, chrome.store.currency)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">??????</p><p className="mt-2 text-2xl font-semibold">{formatNumber(affiliate.orders)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">??????</p><p className="mt-2 text-2xl font-semibold">{formatNumber(affiliate.clicks)}</p></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle>???? ?????????</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">???? ?????????</p>
                <p className="mt-2 text-sm break-all">{affiliate.referralLink}</p>
                <p className="mt-3 text-sm text-muted-foreground">Short link: {affiliate.shortLink}</p>
              </div>
              <AffiliateLinkBuilder
                baseStoreUrl={baseStoreUrl}
                affiliates={[
                  {
                    id: affiliate.id,
                    firstName: affiliate.firstName,
                    lastName: affiliate.lastName,
                    affiliateCode: affiliate.affiliateCode,
                    couponCode: affiliate.couponCode ?? null
                  }
                ]}
                templates={templates}
              />
            </CardContent>
          </Card>

          <DataTable
            title="??????? ???????"
            columns={[
              { key: "code", label: "?????" },
              { key: "template", label: "?????" },
              { key: "discountLabel", label: "????" },
              { key: "applyLink", label: "???? ????", render: (row) => <span className="text-xs break-all">{row.applyLink}</span> }
            ]}
            rows={coupons}
          />

          <DataTable
            title="???? ????? / ?? ????"
            description="??? ????? ???? ???? ???? ????? ??????, ?????? ??????? ???? ?????????? ???."
            columns={[
              { key: "title", label: "????" },
              { key: "views", label: "?????", render: (row) => formatNumber(row.views) },
              { key: "clicks", label: "??????", render: (row) => formatNumber(row.clicks) },
              { key: "orders", label: "??????", render: (row) => formatNumber(row.orders) },
              { key: "sales", label: "??????", render: (row) => formatCurrency(row.sales, chrome.store.currency) }
            ]}
            rows={content}
          />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>?????</CardTitle></CardHeader>
            <CardContent><p className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">{affiliate.status}</p></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>???? ?????????</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p><span className="text-muted-foreground">Email:</span> {affiliate.email}</p>
              <p><span className="text-muted-foreground">Country:</span> {affiliate.country}</p>
              <p><span className="text-muted-foreground">Program:</span> {affiliate.programName}</p>
              <p><span className="text-muted-foreground">Code:</span> {affiliate.affiliateCode}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>???? ?????</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-semibold">{formatCurrency(affiliate.approvedBalance, chrome.store.currency)}</p></CardContent>
          </Card>
          <DataTable
            title="????? ???????"
            columns={[
              { key: "orderNumber", label: "?????" },
              { key: "trackingBy", label: "????" },
              { key: "total", label: "????", render: (row) => formatCurrency(row.total, chrome.store.currency) }
            ]}
            rows={conversions}
          />
        </div>
      </section>
    </AppShell>
  );
}
