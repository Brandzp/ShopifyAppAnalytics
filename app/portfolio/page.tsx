import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Crown,
  Flame,
  Minus,
  ShoppingBag,
  ShieldAlert,
  Sparkles,
  TrendingUp
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { PageHead, SectionHead } from "@/components/dashboard-v2/section-head";
import { KpiTile } from "@/components/dashboard-v2/kpi-tile";
import { NarrativeBanner } from "@/components/dashboard-v2/narrative-banner";
import { PortfolioBrandTable } from "@/components/portfolio/portfolio-brand-table";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { buildPortfolioOverview } from "@/lib/services/portfolio-service";
import { getAppLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// /portfolio — the board / multi-brand operator view.
//
// Aggregates the active org's brands into a single rollup: total revenue
// + orders + weighted-rate KPIs, per-brand breakdown table with click-to-
// switch, and highlights for the biggest mover and stale brands.
//
// Audience: portfolio owner reviewing performance across 2+ brands. Hidden
// from the nav for users with only one connected store — they get the
// single-brand Overview anyway, no value in a "portfolio of one".

export const dynamic = "force-dynamic";
export const metadata = { title: "Portfolio" };

export default async function PortfolioPage() {
  const [chrome, portfolio, locale] = await Promise.all([
    getAppChromeData(),
    buildPortfolioOverview(),
    getAppLocale()
  ]);
  const isHe = locale === "he";

  const t = isHe
    ? {
        eyebrow: "סקירת תיק מותגים",
        title: "כל המותגים שלך, בתמונה אחת",
        description: "סיכום הכנסות, רווחיות ושימור לקוחות מצטבר מכל המותגים בארגון. לחץ על שורה כדי לעבור לתצוגה של מותג בודד.",
        bannerEyebrow: "דופק התיק",
        revenue: "הכנסה כוללת",
        orders: "סך הזמנות",
        aov: "AOV ממוצע",
        returning: "שיעור לקוחות חוזרים",
        refundRate: "שיעור החזרים",
        brandsActive: "מותגים פעילים",
        perBrandTitle: "ביצועים לפי מותג",
        perBrandHint: "ממוין לפי הכנסה. השוואה לתקופה הקודמת ב-30 ימים אחורה.",
        highlightsTitle: "תובנות מהירות",
        highlightsHint: "מה לבדוק קודם — המותג הגדול, המתקדם ביותר, ומי דורש תשומת לב.",
        topBrandLabel: "המותג המוביל",
        biggestMoverLabel: "השינוי הגדול",
        staleLabel: "מותגים עם נתונים ישנים",
        quietLabel: "מותגים שקטים",
        noBrands: "עדיין אין מותגים מחוברים. חברו לפחות מותג אחד מהגדרות.",
        oneBrand: "תצוגת התיק שימושית כשיש 2+ מותגים. כרגע מחובר מותג אחד — חברו עוד מותגים כדי לראות השוואה.",
        connectAnother: "← חיבור מותג נוסף",
        currencyMixedNote: portfolio.currencyNote
      }
    : {
        eyebrow: "Portfolio overview",
        title: "All your brands at a glance",
        description: "Aggregated revenue, profitability, and retention across every brand in your organization. Click a row to drill into a single brand.",
        bannerEyebrow: "Portfolio pulse",
        revenue: "Total revenue",
        orders: "Total orders",
        aov: "Average AOV",
        returning: "Returning rate",
        refundRate: "Refund rate",
        brandsActive: "Active brands",
        perBrandTitle: "Performance by brand",
        perBrandHint: "Sorted by revenue. Comparison is vs the previous window of equal length.",
        highlightsTitle: "Quick read",
        highlightsHint: "What to look at first — biggest brand, biggest mover, who needs attention.",
        topBrandLabel: "Top brand",
        biggestMoverLabel: "Biggest mover",
        staleLabel: "Stale data",
        quietLabel: "Quiet brands",
        noBrands: "No brands connected yet. Connect at least one brand from Settings.",
        oneBrand: "Portfolio view helps once you have 2+ brands. You currently have one connected — connect more brands to see the comparison.",
        connectAnother: "← Connect another brand",
        currencyMixedNote: portfolio.currencyNote
      };

  const brandCount = portfolio.brands.length;

  // Empty / single-brand states.
  if (brandCount === 0) {
    return (
      <AppShell store={chrome.store} controls={chrome.controls}>
        <PageHead eyebrow={t.eyebrow} title={t.title} description={t.description} />
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground" aria-hidden />
            <p className="max-w-md text-sm text-muted-foreground">{t.noBrands}</p>
            <Link href={"/connect-brand" as never} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
              {t.connectAnother}
            </Link>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  // Headline narrative.
  const headline = (() => {
    const total = formatCurrency(portfolio.totals.totalSales, portfolio.currency, isHe);
    const change = portfolio.totalSalesChange;
    if (change === null) {
      return isHe
        ? `${portfolio.totals.activeBrands} מותגים פעילים, הכנסה כוללת של ${total} בתקופה.`
        : `${portfolio.totals.activeBrands} active brands, total revenue ${total} this period.`;
    }
    const arrow = change >= 0 ? (isHe ? "↑" : "↑") : isHe ? "↓" : "↓";
    return isHe
      ? `${portfolio.totals.activeBrands} מותגים פעילים, הכנסה כוללת ${total}. ${arrow} ${Math.abs(change).toFixed(1)}% לעומת התקופה הקודמת.`
      : `${portfolio.totals.activeBrands} active brands, total revenue ${total} — ${arrow} ${Math.abs(change).toFixed(1)}% vs the previous window.`;
  })();
  const tone =
    portfolio.totalSalesChange === null
      ? "neutral"
      : portfolio.totalSalesChange >= 5
        ? "up"
        : portfolio.totalSalesChange <= -5
          ? "down"
          : "neutral";

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 sm:space-y-8">
        <PageHead eyebrow={t.eyebrow} title={t.title} description={t.description} />

        {brandCount === 1 ? (
          <Card>
            <CardContent className="flex flex-col items-start gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">{t.oneBrand}</p>
              <Link
                href={"/connect-brand" as never}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
              >
                {t.connectAnother}
              </Link>
            </CardContent>
          </Card>
        ) : null}

        <NarrativeBanner
          eyebrow={t.bannerEyebrow}
          headline={headline}
          body={t.currencyMixedNote ?? undefined}
          tone={tone}
          locale={locale}
        />

        {/* KPI strip — portfolio totals */}
        <section className="space-y-3">
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            <KpiTile
              kpi={{
                label: t.revenue,
                value: portfolio.totals.totalSales,
                change: portfolio.totalSalesChange ?? undefined,
                format: "currency"
              }}
              currency={portfolio.currency}
              icon={Crown}
            />
            <KpiTile
              kpi={{
                label: t.orders,
                value: portfolio.totals.orders,
                change:
                  portfolio.previousTotals.orders > 0
                    ? ((portfolio.totals.orders - portfolio.previousTotals.orders) /
                        portfolio.previousTotals.orders) *
                      100
                    : undefined,
                format: "number"
              }}
              currency={portfolio.currency}
              icon={ShoppingBag}
            />
            <KpiTile
              kpi={{
                label: t.aov,
                value: portfolio.totals.averageOrderValue,
                format: "currency"
              }}
              currency={portfolio.currency}
              icon={TrendingUp}
            />
            <KpiTile
              kpi={{
                label: t.returning,
                value: portfolio.totals.returningCustomerRate,
                format: "percent"
              }}
              currency={portfolio.currency}
              icon={Flame}
            />
            <KpiTile
              kpi={{
                label: t.refundRate,
                value: portfolio.totals.refundRate,
                format: "percent"
              }}
              currency={portfolio.currency}
              icon={ShieldAlert}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {isHe
              ? `${portfolio.totals.activeBrands} מתוך ${portfolio.totals.connectedBrands} מותגים מחוברים יצרו מכירה בתקופה זו.`
              : `${portfolio.totals.activeBrands} of ${portfolio.totals.connectedBrands} connected brands generated sales this period.`}
          </p>
        </section>

        {/* Per-brand breakdown */}
        <section className="space-y-3">
          <SectionHead
            eyebrow={isHe ? "שלב 1" : "Step 1"}
            title={t.perBrandTitle}
            hint={t.perBrandHint}
          />
          <PortfolioBrandTable
            rows={portfolio.brands}
            currency={portfolio.currency}
            locale={locale}
          />
        </section>

        {/* Highlights */}
        <section className="space-y-3">
          <SectionHead
            eyebrow={isHe ? "שלב 2" : "Step 2"}
            title={t.highlightsTitle}
            hint={t.highlightsHint}
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <HighlightCard
              icon={Crown}
              tone="up"
              label={t.topBrandLabel}
              value={
                portfolio.highlights.topBrand
                  ? portfolio.highlights.topBrand.storeName
                  : "—"
              }
              hint={
                portfolio.highlights.topBrand
                  ? formatCurrency(
                      portfolio.highlights.topBrand.totalSales,
                      portfolio.currency,
                      isHe
                    )
                  : isHe
                    ? "אין מכירות בתקופה זו"
                    : "No sales this period"
              }
            />
            <HighlightCard
              icon={
                portfolio.highlights.biggestMover?.direction === "down"
                  ? ArrowDownRight
                  : ArrowUpRight
              }
              tone={
                portfolio.highlights.biggestMover?.direction === "down"
                  ? "down"
                  : "up"
              }
              label={t.biggestMoverLabel}
              value={
                portfolio.highlights.biggestMover
                  ? portfolio.highlights.biggestMover.storeName
                  : "—"
              }
              hint={
                portfolio.highlights.biggestMover
                  ? `${
                      portfolio.highlights.biggestMover.changePercent >= 0 ? "+" : ""
                    }${portfolio.highlights.biggestMover.changePercent.toFixed(1)}%`
                  : isHe
                    ? "אין מספיק היסטוריה"
                    : "Not enough history"
              }
            />
            <HighlightCard
              icon={ShieldAlert}
              tone={portfolio.highlights.staleData.length > 0 ? "down" : "neutral"}
              label={t.staleLabel}
              value={String(portfolio.highlights.staleData.length)}
              hint={
                portfolio.highlights.staleData.length > 0
                  ? portfolio.highlights.staleData
                      .slice(0, 2)
                      .map((b) => `${b.storeName} (${b.ageHours}h)`)
                      .join(", ")
                  : isHe
                    ? "כל הנתונים טריים"
                    : "All data fresh"
              }
            />
            <HighlightCard
              icon={Minus}
              tone={portfolio.highlights.quietBrands.length > 0 ? "neutral" : "up"}
              label={t.quietLabel}
              value={String(portfolio.highlights.quietBrands.length)}
              hint={
                portfolio.highlights.quietBrands.length > 0
                  ? portfolio.highlights.quietBrands
                      .slice(0, 2)
                      .map((b) => b.storeName)
                      .join(", ")
                  : isHe
                    ? "כל המותגים פעילים"
                    : "All brands active"
              }
            />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function HighlightCard({
  icon: Icon,
  tone,
  label,
  value,
  hint
}: {
  icon: typeof Sparkles;
  tone: "up" | "down" | "neutral";
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <span
            className={cn(
              "inline-flex h-6 w-6 items-center justify-center rounded-md",
              tone === "up" && "bg-emerald-500/10 text-emerald-700",
              tone === "down" && "bg-rose-500/10 text-rose-700",
              tone === "neutral" && "bg-muted text-muted-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </span>
          {label}
        </div>
        <p className="mt-3 truncate text-lg font-semibold text-foreground">{value}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function formatCurrency(value: number, currency: string, isHe: boolean): string {
  try {
    return new Intl.NumberFormat(isHe ? "he-IL" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: value >= 1000 ? 0 : 2
    }).format(value);
  } catch {
    return `${value.toLocaleString(isHe ? "he-IL" : "en-US")} ${currency}`;
  }
}
