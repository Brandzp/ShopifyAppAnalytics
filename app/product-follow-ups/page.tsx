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
import { getAppLocale, type AppLocale } from "@/lib/i18n";
import { formatNumber } from "@/lib/utils";
import type { ProductStockRow } from "@/lib/domain/types";

export const metadata = {
  title: "Product follow-ups"
};

const STOCK_COLUMNS = (label: string, locale: AppLocale) => [
  {
    key: "productTitle" as keyof ProductStockRow,
    label: locale === "he" ? "מוצר" : "Product"
  },
  {
    key: "collection" as keyof ProductStockRow,
    label: locale === "he" ? "קטגוריות" : "Collections",
    tooltip:
      locale === "he"
        ? "כל הקטגוריות של Shopify (חכמות וידניות) שאליהן המוצר משויך. ריחוף על '+N נוספות' מציג את היתר."
        : "Every Shopify collection (smart + manual) the product belongs to. Hover '+N more' to see the rest.",
    render: (row: ProductStockRow) => <CollectionChips collections={row.collections} fallback={row.collection} />
  },
  {
    key: "vendor" as keyof ProductStockRow,
    label: locale === "he" ? "ספק" : "Vendor",
    render: (row: ProductStockRow) => row.vendor ?? "—"
  },
  {
    key: "variantCount" as keyof ProductStockRow,
    label: locale === "he" ? "וריאציות" : "Variants",
    tooltip:
      locale === "he"
        ? "כמה וריאציות יש למוצר ב־Shopify."
        : "How many variants the product has on Shopify.",
    render: (row: ProductStockRow) => formatNumber(row.variantCount)
  },
  {
    key: "inventoryQuantity" as keyof ProductStockRow,
    label,
    tooltip:
      locale === "he"
        ? "סכום המלאי בכל הוריאציות. אדום מתחת ל־20, צהוב מתחת ל־50, ירוק 50 ומעלה."
        : "Sum of inventoryQuantity across all variants. Red <20, yellow <50, green ≥50.",
    render: (row: ProductStockRow) => <StockBadge quantity={row.inventoryQuantity} flag={row.flag} locale={locale} />
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
      ? locale === "he"
        ? `${formatNumber(red.length)} מוצרים במלאי קריטי — לחדש מלאי היום.`
        : `${red.length} product${red.length === 1 ? "" : "s"} critically low — restock today.`
      : yellow.length > 0
        ? locale === "he"
          ? `${formatNumber(yellow.length)} מוצרים מתקרבים לסוף המלאי — לתכנן הזמנה השבוע.`
          : `${yellow.length} product${yellow.length === 1 ? "" : "s"} running low — plan a reorder this week.`
        : locale === "he"
          ? "כל המוצרים במעקב במצב מלאי בריא."
          : "All tracked products are at healthy stock levels.";

  const body = [
    locale === "he"
      ? `${formatNumber(stock.length)} מוצרים בקטלוג · ${formatNumber(green.length)} במצב בריא · ${formatNumber(unknown.length)} לא במעקב.`
      : `${formatNumber(stock.length)} products in your catalog · ${formatNumber(green.length)} healthy · ${formatNumber(unknown.length)} not tracked.`,
    red.length + yellow.length > 0
      ? locale === "he"
        ? `כדאי לחדש ${formatNumber(red.length + yellow.length)} פריטים כדי לשמור על תקציב פרסום יעיל ולמנוע חוסר במוצרים מובילים.`
        : `Restock ${formatNumber(red.length + yellow.length)} item${red.length + yellow.length === 1 ? "" : "s"} to keep ad spend efficient and avoid stockouts on bestsellers.`
      : null
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 sm:space-y-8">
        <PageHead
          eyebrow={locale === "he" ? "מעקבי מוצרים" : "Product follow-ups"}
          title={locale === "he" ? "התראות מלאי ותור חידוש" : "Stock alerts & restock queue"}
          description={
            locale === "he"
              ? "רק SKU פעילים — טיוטות ומוצרים בארכיון מסוננים. דגל אדום מתחת ל־20, דגל צהוב מתחת ל־50, ממוין כך שהכי דחוף בראש."
              : "Active SKUs only — drafts and archived products are filtered out. Red flag below 20, yellow flag below 50, sorted with the most urgent on top."
          }
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
                ? locale === "he"
                  ? `סנכרון מוצרים מלא אחרון מ־Shopify: ${lastSyncedAt.toLocaleString()}`
                  : `Last full Shopify product sync: ${lastSyncedAt.toLocaleString()}`
                : locale === "he"
                  ? "עדיין לא בוצע סנכרון מוצרים לחנות הזו."
                  : "No product sync has run yet for this store."
            }
          >
            {freshnessLabel}
          </span>
        </div>

        <NarrativeBanner
          eyebrow={locale === "he" ? "דופק המלאי" : "Stock pulse"}
          headline={headline}
          body={body}
          tone={tone}
          toneLabel={
            tone === "down"
              ? locale === "he"
                ? "נדרשת פעולה"
                : "Action needed"
              : tone === "neutral"
                ? locale === "he"
                  ? "לעקוב מקרוב"
                  : "Watch closely"
                : locale === "he"
                  ? "הכול תקין"
                  : "All good"
          }
        />

        <section className="space-y-3">
          <SectionHead
            eyebrow={locale === "he" ? "שלב 1" : "Step 1"}
            title={locale === "he" ? "פילוח המלאי שלך" : "How your stock breaks down"}
            hint={
              locale === "he"
                ? "ארבעה מספרים שמסכמים את בריאות המלאי כרגע."
                : "Four counts that summarize your inventory health right now."
            }
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label={locale === "he" ? "דגל אדום" : "Red flag"}
              value={formatNumber(red.length)}
              icon={ShieldAlert}
              hint={locale === "he" ? "מתחת ל־20 יחידות — לחדש מלאי היום." : "Below 20 units — restock today."}
              tooltip={
                locale === "he"
                  ? "מוצרים שסך המלאי שלהם בכל הוריאציות מתחת ל־20. עלולים להיגמר בכל רגע."
                  : "Products with total inventory below 20 across all variants. These can stock out at any moment."
              }
            />
            <StatTile
              label={locale === "he" ? "דגל צהוב" : "Yellow flag"}
              value={formatNumber(yellow.length)}
              icon={TriangleAlert}
              hint={locale === "he" ? "מתחת ל־50 יחידות — לתכנן הזמנה." : "Below 50 units — plan a reorder."}
              tooltip={
                locale === "he"
                  ? "מוצרים עם מלאי כולל בין 20 ל־49. כדאי להזמין בשבוע־שבועיים הקרובים."
                  : "Products with total inventory between 20 and 49. Place a reorder in the next 1–2 weeks."
              }
            />
            <StatTile
              label={locale === "he" ? "במצב בריא" : "Healthy"}
              value={formatNumber(green.length)}
              icon={CheckCircle2}
              hint={locale === "he" ? "50 יחידות ומעלה — מצב טוב." : "50+ units — good shape."}
              tooltip={
                locale === "he"
                  ? "מוצרים עם 50 יחידות או יותר במלאי."
                  : "Products with 50 or more units in stock."
              }
            />
            <StatTile
              label={locale === "he" ? "לא במעקב" : "Not tracked"}
              value={formatNumber(unknown.length)}
              icon={HelpCircle}
              hint={locale === "he" ? "אין נתוני מלאי ב־Shopify." : "No inventory data on Shopify."}
              tooltip={
                locale === "he"
                  ? "וריאציות שלא מופעל עליהן מעקב מלאי. הפעלת מעקב ב־Shopify תחשוף אותן."
                  : "Variants without inventory tracking enabled. Turn on tracking in Shopify to surface these."
              }
            />
          </div>
        </section>

        {/* Critical (red) */}
        {red.length > 0 ? (
          <section className="space-y-3">
            <SectionHead
              eyebrow={locale === "he" ? "שלב 2 — דגל אדום" : "Step 2 — RED FLAG"}
              title={locale === "he" ? "קריטי: לחדש מלאי היום" : "Critical: restock today"}
              hint={
                locale === "he"
                  ? "לפריטים האלה פחות מ־20 יחידות בכל הוריאציות. כדאי להשהות פרסומים, לזרז הזמנה או לעבור ל־SKU תחליפי."
                  : "These items have fewer than 20 units across all variants. Pause ads, rush a reorder, or pull from a sister SKU."
              }
            />
            <DataTable
              title={
                locale === "he"
                  ? `${formatNumber(red.length)} מוצרים במלאי קריטי`
                  : `${red.length} product${red.length === 1 ? "" : "s"} critically low`
              }
              tooltip={locale === "he" ? "ממוין מהמלאי הנמוך ביותר." : "Sorted by lowest stock first."}
              paginate
              initialPageSize={20}
              pageSizes={[20, 50, 100]}
              columns={STOCK_COLUMNS(locale === "he" ? "במלאי" : "In stock", locale)}
              rows={red}
            />
          </section>
        ) : null}

        {/* Running low (yellow) */}
        {yellow.length > 0 ? (
          <section className="space-y-3">
            <SectionHead
              eyebrow={locale === "he" ? "שלב 3 — דגל צהוב" : "Step 3 — YELLOW FLAG"}
              title={locale === "he" ? "מתקרב לסוף: לתכנן הזמנות" : "Running low: plan reorders"}
              hint={
                locale === "he"
                  ? "בין 20 ל־49 יחידות. כדאי להוציא הזמנת רכש השבוע כדי לא להגיע שוב למצב הזה בחודש הבא."
                  : "Between 20 and 49 units. Place a PO this week so you don't end up here again next month."
              }
            />
            <DataTable
              title={
                locale === "he"
                  ? `${formatNumber(yellow.length)} מוצרים מתקרבים לסוף המלאי`
                  : `${yellow.length} product${yellow.length === 1 ? "" : "s"} running low`
              }
              tooltip={locale === "he" ? "ממוין מהמלאי הנמוך ביותר." : "Sorted by lowest stock first."}
              paginate
              initialPageSize={20}
              pageSizes={[20, 50, 100]}
              columns={STOCK_COLUMNS(locale === "he" ? "במלאי" : "In stock", locale)}
              rows={yellow}
            />
          </section>
        ) : null}

        {/* Healthy (green) */}
        {green.length > 0 ? (
          <section className="space-y-3">
            <SectionHead
              eyebrow={locale === "he" ? "שלב 4 — מצב בריא" : "Step 4 — Healthy"}
              title={locale === "he" ? "במלאי ומוכן" : "Stocked and ready"}
              hint={
                locale === "he"
                  ? "50 יחידות ומעלה. כדאי לסרוק חריגים — פריטים שיושבים אלפים על המדף עלולים להיות תנועה איטית."
                  : "50+ units. Skim for outliers — items with thousands sitting may indicate slow movers."
              }
            />
            <DataTable
              title={
                locale === "he"
                  ? `${formatNumber(green.length)} מוצרים במצב בריא`
                  : `${green.length} healthy product${green.length === 1 ? "" : "s"}`
              }
              paginate
              initialPageSize={20}
              pageSizes={[20, 50, 100]}
              columns={STOCK_COLUMNS(locale === "he" ? "במלאי" : "In stock", locale)}
              rows={green}
            />
          </section>
        ) : null}

        {/* Not tracked (unknown) */}
        {unknown.length > 0 ? (
          <section className="space-y-3">
            <SectionHead
              eyebrow={locale === "he" ? "שלב 5 — לא במעקב" : "Step 5 — Not tracked"}
              title={locale === "he" ? "אין נתוני מלאי" : "No inventory data"}
              hint={
                locale === "he"
                  ? "וריאציות בלי מעקב מלאי. כדאי להפעיל מעקב ב־Shopify (מלאי → מעקב כמות) כדי שנוכל לסמן אותן."
                  : "Variants without inventory tracking. Turn on tracking in Shopify (Inventory → Track quantity) so we can flag them."
              }
            />
            <Card>
              <CardContent className="p-5 text-sm leading-6 text-muted-foreground">
                <p>
                  {locale === "he" ? (
                    <>
                      ל־<strong className="text-foreground">{formatNumber(unknown.length)}</strong> מוצרים כל
                      הוריאציות ללא מעקב. לא נוכל להפיק עבורם דגלים אדומים/צהובים עד שיופעל מעקב.
                    </>
                  ) : (
                    <>
                      <strong className="text-foreground">{formatNumber(unknown.length)}</strong>{" "}
                      product{unknown.length === 1 ? "" : "s"} have all-untracked variants. We can't generate
                      red/yellow flags for them until tracking is enabled.
                    </>
                  )}
                </p>
                <p className="mt-2">
                  {locale === "he" ? (
                    <>
                      תיקון מהיר: לפתוח את המוצר ב־Shopify → מלאי → להפעיל{" "}
                      <em className="font-mono not-italic">Track quantity</em>. הסנכרון הבא יחשוף את הכמויות.
                    </>
                  ) : (
                    <>
                      Quick fix: open the product in Shopify → Inventory → enable{" "}
                      <em className="font-mono not-italic">Track quantity</em>. Next sync will surface their counts.
                    </>
                  )}
                </p>
              </CardContent>
            </Card>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
