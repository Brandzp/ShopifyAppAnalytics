import { CheckCircle2, HelpCircle, ShieldAlert, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { NarrativeBanner } from "@/components/dashboard-v2/narrative-banner";
import { PageHead, SectionHead } from "@/components/dashboard-v2/section-head";
import { StatTile } from "@/components/dashboard-v2/kpi-tile";
import { StockBadge } from "@/components/dashboard-v2/stock-badge";
import { CollectionChips } from "@/components/dashboard-v2/collection-chips";
import { DataTable } from "@/components/shared/data-table";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAnalyticsRepository } from "@/lib/repositories";
import { getDb } from "@/lib/server/db";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { getAppLocale } from "@/lib/i18n";
import { formatNumber } from "@/lib/utils";
import type { ProductStockRow } from "@/lib/domain/types";

export const metadata = {
  title: "Product follow-ups"
};

const STOCK_COLUMNS = (label: string) => [
  { key: "productTitle" as keyof ProductStockRow, label: "Product" },
  {
    key: "collection" as keyof ProductStockRow,
    label: "Collections",
    tooltip: "Every Shopify collection (smart + manual) the product belongs to. Hover '+N more' to see the rest.",
    render: (row: ProductStockRow) => <CollectionChips collections={row.collections} fallback={row.collection} />
  },
  {
    key: "vendor" as keyof ProductStockRow,
    label: "Vendor",
    render: (row: ProductStockRow) => row.vendor ?? "—"
  },
  {
    key: "variantCount" as keyof ProductStockRow,
    label: "Variants",
    tooltip: "How many variants the product has on Shopify.",
    render: (row: ProductStockRow) => formatNumber(row.variantCount)
  },
  {
    key: "inventoryQuantity" as keyof ProductStockRow,
    label,
    tooltip: "Sum of inventoryQuantity across all variants. Red <20, yellow <50, green ≥50.",
    render: (row: ProductStockRow) => <StockBadge quantity={row.inventoryQuantity} flag={row.flag} />
  }
];

export default async function ProductFollowUpsPage() {
  const repository = await getAnalyticsRepository();
  const [chrome, stock, locale, storeId] = await Promise.all([
    getAppChromeData(),
    repository.getProductStock(),
    getAppLocale(),
    resolveActiveStoreId()
  ]);

  // Inventory freshness — Shopify doesn't bump product.updated_at on
  // inventory-only changes, so the only signal of "is this number
  // current?" is the timestamp of the last FULL product re-sync.
  // The data-refresh cron pulls it every 2h; if that cron is off /
  // failing, this page would otherwise show stale numbers as if they
  // were live. Surface a freshness chip so the founder can see when
  // the snapshot is older than expected.
  const db = getDb();
  const connection = storeId
    ? await db.shopifyConnection.findFirst({
        where: { storeId },
        select: { lastProductsSyncAt: true }
      })
    : null;
  const lastSyncedAt = connection?.lastProductsSyncAt ?? null;
  const syncAgeMinutes = lastSyncedAt
    ? Math.max(0, Math.round((Date.now() - lastSyncedAt.getTime()) / 60000))
    : null;
  const freshnessLabel = (() => {
    if (syncAgeMinutes === null) {
      return locale === "he" ? "מלאי טרם סונכרן" : "Inventory never synced";
    }
    if (syncAgeMinutes < 1) {
      return locale === "he" ? "מלאי מסונכרן כעת" : "Inventory synced just now";
    }
    if (syncAgeMinutes < 60) {
      return locale === "he"
        ? `מלאי סונכרן לפני ${syncAgeMinutes} דק'`
        : `Inventory synced ${syncAgeMinutes} min ago`;
    }
    const hours = Math.round(syncAgeMinutes / 60);
    return locale === "he"
      ? `מלאי סונכרן לפני ${hours} שעות`
      : `Inventory synced ${hours}h ago`;
  })();
  // Anything older than 6 hours is "stale" — see INVENTORY_STALE_HOURS in
  // stockout-imminent-service.ts. At that age the cron has plausibly failed
  // and numbers may be wrong; we color the chip amber.
  const freshnessIsStale = syncAgeMinutes === null || syncAgeMinutes > 6 * 60;

  const red = stock.filter((row) => row.flag === "red");
  const yellow = stock.filter((row) => row.flag === "yellow");
  const green = stock.filter((row) => row.flag === "green");
  const unknown = stock.filter((row) => row.flag === "unknown");

  const tone = red.length > 0 ? "down" : yellow.length > 0 ? "neutral" : "up";
  const headline =
    red.length > 0
      ? `${red.length} product${red.length === 1 ? "" : "s"} critically low — restock today.`
      : yellow.length > 0
        ? `${yellow.length} product${yellow.length === 1 ? "" : "s"} running low — plan a reorder this week.`
        : "All tracked products are at healthy stock levels.";

  const body = [
    `${formatNumber(stock.length)} products in your catalog · ${formatNumber(green.length)} healthy · ${formatNumber(unknown.length)} not tracked.`,
    red.length + yellow.length > 0
      ? `Restock ${formatNumber(red.length + yellow.length)} item${red.length + yellow.length === 1 ? "" : "s"} to keep ad spend efficient and avoid stockouts on bestsellers.`
      : null
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 sm:space-y-8">
        <PageHead
          eyebrow="Product follow-ups"
          title="Stock alerts & restock queue"
          description="Active SKUs only — drafts and archived products are filtered out. Red flag below 20, yellow flag below 50, sorted with the most urgent on top."
        />

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${
              freshnessIsStale
                ? "border-amber-300 bg-amber-50 text-amber-900"
                : "border-emerald-200 bg-emerald-50 text-emerald-900"
            }`}
            title={
              lastSyncedAt
                ? `Last full Shopify product sync: ${lastSyncedAt.toLocaleString()}`
                : "No product sync has run yet for this store."
            }
          >
            {freshnessLabel}
          </span>
        </div>

        <NarrativeBanner
          eyebrow="Stock pulse"
          headline={headline}
          body={body}
          tone={tone}
          toneLabel={tone === "down" ? "Action needed" : tone === "neutral" ? "Watch closely" : "All good"}
        />

        <section className="space-y-3">
          <SectionHead
            eyebrow="Step 1"
            title="How your stock breaks down"
            hint="Four counts that summarize your inventory health right now."
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Red flag"
              value={formatNumber(red.length)}
              icon={ShieldAlert}
              hint="Below 20 units — restock today."
              tooltip="Products with total inventory below 20 across all variants. These can stock out at any moment."
            />
            <StatTile
              label="Yellow flag"
              value={formatNumber(yellow.length)}
              icon={TriangleAlert}
              hint="Below 50 units — plan a reorder."
              tooltip="Products with total inventory between 20 and 49. Place a reorder in the next 1–2 weeks."
            />
            <StatTile
              label="Healthy"
              value={formatNumber(green.length)}
              icon={CheckCircle2}
              hint="50+ units — good shape."
              tooltip="Products with 50 or more units in stock."
            />
            <StatTile
              label="Not tracked"
              value={formatNumber(unknown.length)}
              icon={HelpCircle}
              hint="No inventory data on Shopify."
              tooltip="Variants without inventory tracking enabled. Turn on tracking in Shopify to surface these."
            />
          </div>
        </section>

        {/* Critical (red) */}
        {red.length > 0 ? (
          <section className="space-y-3">
            <SectionHead
              eyebrow="Step 2 — RED FLAG"
              title="Critical: restock today"
              hint="These items have fewer than 20 units across all variants. Pause ads, rush a reorder, or pull from a sister SKU."
            />
            <DataTable
              title={`${red.length} product${red.length === 1 ? "" : "s"} critically low`}
              tooltip="Sorted by lowest stock first."
              paginate
              initialPageSize={20}
              pageSizes={[20, 50, 100]}
              columns={STOCK_COLUMNS("In stock")}
              rows={red}
            />
          </section>
        ) : null}

        {/* Running low (yellow) */}
        {yellow.length > 0 ? (
          <section className="space-y-3">
            <SectionHead
              eyebrow="Step 3 — YELLOW FLAG"
              title="Running low: plan reorders"
              hint="Between 20 and 49 units. Place a PO this week so you don't end up here again next month."
            />
            <DataTable
              title={`${yellow.length} product${yellow.length === 1 ? "" : "s"} running low`}
              tooltip="Sorted by lowest stock first."
              paginate
              initialPageSize={20}
              pageSizes={[20, 50, 100]}
              columns={STOCK_COLUMNS("In stock")}
              rows={yellow}
            />
          </section>
        ) : null}

        {/* Healthy (green) */}
        {green.length > 0 ? (
          <section className="space-y-3">
            <SectionHead
              eyebrow="Step 4 — Healthy"
              title="Stocked and ready"
              hint="50+ units. Skim for outliers — items with thousands sitting may indicate slow movers."
            />
            <DataTable
              title={`${green.length} healthy product${green.length === 1 ? "" : "s"}`}
              paginate
              initialPageSize={20}
              pageSizes={[20, 50, 100]}
              columns={STOCK_COLUMNS("In stock")}
              rows={green}
            />
          </section>
        ) : null}

        {/* Not tracked (unknown) */}
        {unknown.length > 0 ? (
          <section className="space-y-3">
            <SectionHead
              eyebrow="Step 5 — Not tracked"
              title="No inventory data"
              hint="Variants without inventory tracking. Turn on tracking in Shopify (Inventory → Track quantity) so we can flag them."
            />
            <Card>
              <CardContent className="p-5 text-sm leading-6 text-muted-foreground">
                <p>
                  <strong className="text-foreground">{formatNumber(unknown.length)}</strong>{" "}
                  product{unknown.length === 1 ? "" : "s"} have all-untracked variants. We can't generate
                  red/yellow flags for them until tracking is enabled.
                </p>
                <p className="mt-2">
                  Quick fix: open the product in Shopify → Inventory → enable{" "}
                  <em className="font-mono not-italic">Track quantity</em>. Next sync will surface their counts.
                </p>
              </CardContent>
            </Card>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
