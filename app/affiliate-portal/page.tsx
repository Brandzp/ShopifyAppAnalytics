import { Coins, MousePointerClick, ShoppingBag, Trophy, Users2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";
import { NarrativeBanner } from "@/components/dashboard-v2/narrative-banner";
import { PageHead, SectionHead } from "@/components/dashboard-v2/section-head";
import { StatTile } from "@/components/dashboard-v2/kpi-tile";
import { AffiliatePortalNav } from "@/components/affiliate-portal/portal-nav";
import { AffiliateAttributionSyncButton } from "@/components/affiliate-portal/affiliate-attribution-sync-button";
import { AffiliateTrendChart } from "@/components/charts/affiliate-trend-chart";
import { DataTable } from "@/components/shared/data-table";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAffiliatePortalDashboard } from "@/lib/services/affiliate-portal-service";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { getAppLocale } from "@/lib/i18n";

// All page strings kept in one local dictionary so the whole surface can
// be scanned + translated in one place. Chosen over adding to the global
// saas-strings so the affiliate portal owns its own copy — the terms
// ("קופון", "משפיענים", "עמלה") are portal-specific and don't need to
// leak to the app shell.
function strings(isHe: boolean) {
  return {
    // Page head
    eyebrow: isHe ? "פורטל שותפים" : "Affiliate Portal",
    title: isHe
      ? "ביצועי תוכנית השותפים, יוצרים והכנסות"
      : "Affiliate program performance, creators, and revenue",
    description: isHe
      ? "מרחב אחד לניהול שותפים, המרות, קופונים, תוכן, תשלומים ומכירות מיוחסות ב-Shopify."
      : "One workspace for affiliates, conversions, coupons, content, payouts, and Shopify-attributed sales.",
    // Narrative pulse
    pulseLabel: isHe ? "פעימת שותפים" : "Affiliate pulse",
    toneDriving: isHe ? "מייצר מכירות" : "Driving sales",
    toneGetStarted: isHe ? "מתחילים" : "Get started",
    // Sections
    step1Eyebrow: isHe ? "שלב 1" : "Step 1",
    step1Title: isHe ? "סה״כ עליון" : "Top-level totals",
    step1Hint: isHe
      ? "חמישה מספרים שאומרים לך איך תוכנית השותפים שלך מתפקדת כרגע."
      : "Five numbers that tell you how your affiliate program is performing right now.",

    tileSales: isHe ? "סה״כ מכירות" : "Total sales",
    tileSalesTip: isHe
      ? "הכנסה ברוטו מהזמנות מיוחסות דרך היקף מעקב השותפים הפעיל בחלון הזמן הנבחר."
      : "Gross revenue from orders attributed through the active affiliate tracking scope in the selected window.",
    tileOrders: isHe ? "סה״כ הזמנות" : "Total orders",
    tileOrdersTip: isHe
      ? "מספר הזמנות שהותאמו לשותף דרך לינק, קופון או היקף מעקב פעיל."
      : "Number of orders matched to an affiliate via the active link, coupon, or tracking scope.",
    tileClicks: isHe ? "סה״כ קליקים" : "Total clicks",
    tileClicksTip: isHe
      ? "קליקים על לינקי שותפים בחלון הזמן. יחס קליק → הזמנה = סיגנל של המשפך."
      : "Affiliate-link clicks logged in the window. Click → order ratio = your funnel signal.",
    tileClicksHintSuffix: isHe ? "קליק להזמנה" : "click-to-order",
    tileAffiliates: isHe ? "שותפים פעילים" : "Affiliates active",
    tileAffiliatesTip: isHe
      ? "שותפים עם קליק אחד או הזמנה אחת לפחות בחלון הזמן."
      : "Affiliates with at least one click or order in the window.",
    tileCommission: isHe ? "עמלה לתשלום" : "Commission owed",
    tileCommissionTip: isHe
      ? "כמה אתה חייב לשותפים על הזמנות בחלון הזמן. הגדר תעריפים לכל תוכנית."
      : "What you owe affiliates for orders in this window. Configure rates per program.",

    step2Eyebrow: isHe ? "שלב 2" : "Step 2",
    step2Title: isHe ? "מגמה ותוכנית פעילה" : "Trend & active program",
    step2Hint: isHe
      ? "תרשים משמאל = מכירות יומיות + קליקים, שים לב לפער (מתרחב = בעיית משפך). כרטיס מימין = פרטי התוכנית החיה."
      : "Left chart = daily sales + clicks, watch the gap (widening = funnel issue). Right card = your live program details.",

    trendTitle: isHe ? "מגמת מכירות שותפים" : "Affiliate sales trend",
    trendHelp: isHe
      ? "שני סדרות באותו תרשים: הכנסה מהזמנות מיוחסות לשותפים (ציר שמאל) ונפח קליקים (ציר ימין). שים לב לפער — מתרחב = בעיית משפך."
      : "Two series on one chart: revenue from affiliate-attributed orders (left axis) and click volume (right axis). Watch the gap — widening = funnel issue.",
    trendCaption: isHe
      ? "מכירות וקליקים יומיים שנוצרו דרך היקף מעקב השותפים הפעיל."
      : "Daily sales and clicks generated through the active affiliate tracking scope.",

    activeProgram: isHe ? "תוכנית פעילה" : "Active program",
    affiliatesWord: isHe ? "שותפים" : "affiliates",
    ordersWord: isHe ? "הזמנות" : "orders",
    signUpLink: isHe ? "לינק הרשמה" : "Sign-up link",

    step3Eyebrow: isHe ? "שלב 3" : "Step 3",
    step3Title: isHe ? "מי מביא הכי הרבה" : "Who's bringing in the most",
    step3Hint: isHe
      ? "שני מיונים לשותפים: לפי מכירות (המרוויחים ביותר) ולפי קליקים (הכי טובים בהבאת תנועה)."
      : "Sort affiliates two ways: by sales (best earners) and by clicks (best at driving traffic).",
    tableTopBySales: isHe ? "מובילים לפי מכירות" : "Top affiliates by sales",
    tableTopBySalesTip: isHe
      ? "שותפים מדורגים לפי הכנסה מיוחסת."
      : "Affiliates ranked by attributed revenue.",
    tableTopByClicks: isHe ? "מובילים לפי קליקים" : "Top affiliates by clicks",
    tableTopByClicksTip: isHe
      ? "שותפים מדורגים לפי תנועה — שימושי כדי לאתר משפיענים עם המרה נמוכה."
      : "Affiliates ranked by traffic — useful for finding under-converting promoters.",

    colAffiliate: isHe ? "שותף/ה" : "Affiliate",
    colClicks: isHe ? "קליקים" : "Clicks",
    colOrders: isHe ? "הזמנות" : "Orders",
    colSales: isHe ? "מכירות" : "Sales",
    colProduct: isHe ? "מוצר" : "Product",
    colSource: isHe ? "מקור" : "Source",
    colContent: isHe ? "תוכן" : "Content",
    colViews: isHe ? "צפיות" : "Views",

    step4Eyebrow: isHe ? "שלב 4" : "Step 4",
    step4Title: isHe ? "אילו מוצרים ומקורות עובדים" : "What products and sources are working",
    step4Hint: isHe
      ? "משמאל = מוצרים מובילים מערוצי שותפים. מימין = מקורות הפניה מובילים (אתרים, פלטפורמות, תגי לינק)."
      : "Left = best products from affiliate channels. Right = best referral sources (sites, platforms, link tags).",
    tableTopProducts: isHe ? "מוצרים מובילים ממכירות שותפים" : "Top products from affiliate sales",
    tableTopSources: isHe ? "מקורות הפניה מובילים" : "Top referral sources",

    step5Eyebrow: isHe ? "שלב 5" : "Step 5",
    step5Title: isHe ? "תוכן שמניע את התוכנית" : "Content driving the program",
    step5Hint: isHe
      ? "הפוסטים והתכנים שהניבו הכי הרבה מכירות — לראות איזה קריאייטיב עובד הכי טוב."
      : "The posts and content pieces that produced the most sales — see which creative is working best.",
    tableTopContent: isHe ? "תוכן מוביל לפי מכירות" : "Top content by sales",
    tableTopContentDesc: isHe
      ? "הפוסטים והתכנים שהניבו הכי הרבה מכירות."
      : "The posts and content pieces that produced the most sales."
  };
}

// Narrative sentence builders — kept as functions because they interpolate
// live numbers. Formatting uses the locale's number/currency conventions.
function buildHeadline(
  isHe: boolean,
  totals: { totalSales: number; totalAffiliates: number },
  currency: string
): string {
  if (totals.totalSales > 0) {
    const affiliates = formatNumber(totals.totalAffiliates);
    const sales = formatCurrency(totals.totalSales, currency);
    return isHe
      ? `${affiliates} שותפים הביאו ${sales} בתקופה זו.`
      : `${affiliates} affiliates drove ${sales} this period.`;
  }
  return isHe
    ? "עדיין אין מכירות מיוחסות לשותפים — צרפו שותף ראשון או הריצו סנכרון."
    : "No affiliate-attributed sales yet — onboard your first affiliate or run a sync.";
}

function buildBody(
  isHe: boolean,
  totals: { totalClicks: number; totalOrders: number; totalCommission: number },
  scopeDescription: string,
  currency: string,
  conversion: string
): string {
  const clicks = formatNumber(totals.totalClicks);
  const orders = formatNumber(totals.totalOrders);
  const funnel = isHe
    ? `${clicks} קליקים → ${orders} הזמנות (${conversion}% המרה).`
    : `${clicks} clicks → ${orders} orders (${conversion}% conversion).`;
  const commissionLine =
    totals.totalCommission > 0
      ? isHe
        ? `אתה חייב ${formatCurrency(totals.totalCommission, currency)} בעמלות.`
        : `You owe ${formatCurrency(totals.totalCommission, currency)} in commission.`
      : null;
  return [funnel, commissionLine, scopeDescription].filter(Boolean).join(" ");
}

export default async function AffiliatePortalDashboardPage() {
  const [chrome, dashboard, locale] = await Promise.all([
    getAppChromeData(),
    getAffiliatePortalDashboard(),
    getAppLocale()
  ]);
  const isHe = locale === "he";
  const t = strings(isHe);
  const totals = dashboard.totals;
  const currency = chrome.store.currency;

  const tone = totals.totalSales > 0 ? "up" : "neutral";
  const conversion =
    totals.totalClicks > 0 ? ((totals.totalOrders / totals.totalClicks) * 100).toFixed(1) : "0.0";
  const headline = buildHeadline(isHe, totals, currency);
  const body = buildBody(isHe, totals, dashboard.scope.description, currency, conversion);

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 sm:space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <PageHead eyebrow={t.eyebrow} title={t.title} description={t.description} />
          <AffiliateAttributionSyncButton storeId={chrome.store.id} />
        </div>

        <NarrativeBanner
          eyebrow={t.pulseLabel}
          headline={headline}
          body={body}
          tone={tone}
          toneLabel={totals.totalSales > 0 ? t.toneDriving : t.toneGetStarted}
        />

        <AffiliatePortalNav />

        <section className="space-y-3">
          <SectionHead eyebrow={t.step1Eyebrow} title={t.step1Title} hint={t.step1Hint} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatTile
              label={t.tileSales}
              value={formatCurrency(totals.totalSales, currency)}
              icon={ShoppingBag}
              tooltip={t.tileSalesTip}
            />
            <StatTile
              label={t.tileOrders}
              value={formatNumber(totals.totalOrders)}
              icon={Trophy}
              tooltip={t.tileOrdersTip}
            />
            <StatTile
              label={t.tileClicks}
              value={formatNumber(totals.totalClicks)}
              icon={MousePointerClick}
              tooltip={t.tileClicksTip}
              hint={`${conversion}% ${t.tileClicksHintSuffix}`}
            />
            <StatTile
              label={t.tileAffiliates}
              value={formatNumber(totals.totalAffiliates)}
              icon={Users2}
              tooltip={t.tileAffiliatesTip}
            />
            <StatTile
              label={t.tileCommission}
              value={formatCurrency(totals.totalCommission, currency)}
              icon={Coins}
              tooltip={t.tileCommissionTip}
            />
          </div>
        </section>

        <section className="space-y-3">
          <SectionHead eyebrow={t.step2Eyebrow} title={t.step2Title} hint={t.step2Hint} />
          <div className="grid items-start gap-4 xl:grid-cols-[1.5fr_1fr]">
            <Card className="min-w-0">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-base">{t.trendTitle}</CardTitle>
                  <HelpTip width="lg">{t.trendHelp}</HelpTip>
                </div>
                <p className="text-sm text-muted-foreground">{t.trendCaption}</p>
              </CardHeader>
              <CardContent>
                <AffiliateTrendChart data={dashboard.trend} currency={currency} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t.activeProgram}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border border-indigo-200/60 bg-indigo-50/40 p-4">
                  <p className="text-lg font-semibold">{dashboard.program.name}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {formatNumber(dashboard.program.affiliates)} {t.affiliatesWord} ·{" "}
                    {formatNumber(dashboard.program.orders)} {t.ordersWord} ·{" "}
                    {formatCurrency(dashboard.program.sales, currency)}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-background/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t.signUpLink}
                  </p>
                  <p className="mt-2 break-all text-sm font-mono">{dashboard.program.signUpLink}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="space-y-3">
          <SectionHead eyebrow={t.step3Eyebrow} title={t.step3Title} hint={t.step3Hint} />
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <DataTable
              title={t.tableTopBySales}
              tooltip={t.tableTopBySalesTip}
              paginate
              initialPageSize={20}
              pageSizes={[20, 50, 100]}
              columns={[
                { key: "firstName", label: t.colAffiliate, render: (row) => `${row.firstName} ${row.lastName}` },
                { key: "clicks", label: t.colClicks, render: (row) => formatNumber(row.clicks) },
                { key: "orders", label: t.colOrders, render: (row) => formatNumber(row.orders) },
                { key: "sales", label: t.colSales, render: (row) => formatCurrency(row.sales, currency) }
              ]}
              rows={dashboard.topAffiliatesBySales}
            />
            <DataTable
              title={t.tableTopByClicks}
              tooltip={t.tableTopByClicksTip}
              paginate
              initialPageSize={20}
              pageSizes={[20, 50, 100]}
              columns={[
                { key: "firstName", label: t.colAffiliate, render: (row) => `${row.firstName} ${row.lastName}` },
                { key: "clicks", label: t.colClicks, render: (row) => formatNumber(row.clicks) },
                { key: "orders", label: t.colOrders, render: (row) => formatNumber(row.orders) },
                { key: "sales", label: t.colSales, render: (row) => formatCurrency(row.sales, currency) }
              ]}
              rows={dashboard.topAffiliatesByClicks}
            />
          </div>
        </section>

        <section className="space-y-3">
          <SectionHead eyebrow={t.step4Eyebrow} title={t.step4Title} hint={t.step4Hint} />
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <DataTable
              title={t.tableTopProducts}
              paginate
              initialPageSize={20}
              pageSizes={[20, 50, 100]}
              columns={[
                { key: "name", label: t.colProduct },
                { key: "sales", label: t.colSales, render: (row) => formatCurrency(row.sales, currency) }
              ]}
              rows={dashboard.topProducts}
            />
            <DataTable
              title={t.tableTopSources}
              paginate
              initialPageSize={20}
              pageSizes={[20, 50, 100]}
              columns={[
                { key: "label", label: t.colSource },
                { key: "clicks", label: t.colClicks, render: (row) => formatNumber(row.clicks) }
              ]}
              rows={dashboard.topReferralSources}
            />
          </div>
        </section>

        <section className="space-y-3">
          <SectionHead eyebrow={t.step5Eyebrow} title={t.step5Title} hint={t.step5Hint} />
          <DataTable
            title={t.tableTopContent}
            description={t.tableTopContentDesc}
            paginate
            initialPageSize={20}
            pageSizes={[20, 50, 100]}
            columns={[
              { key: "affiliateName", label: t.colAffiliate },
              { key: "title", label: t.colContent },
              { key: "views", label: t.colViews, render: (row) => formatNumber(row.views) },
              { key: "clicks", label: t.colClicks, render: (row) => formatNumber(row.clicks) },
              { key: "orders", label: t.colOrders, render: (row) => formatNumber(row.orders) },
              { key: "sales", label: t.colSales, render: (row) => formatCurrency(row.sales, currency) }
            ]}
            rows={dashboard.contentHighlights}
          />
        </section>
      </div>
    </AppShell>
  );
}
