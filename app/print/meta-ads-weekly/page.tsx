import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import {
  buildMetaAdsWeeklyReport,
  type MetaAdsReportBrand,
  type MetaAdsReportDailyRow,
  type MetaAdsReportFunnel
} from "@/lib/services/meta-ads-report-service";
import {
  generateBrandInsights,
  type BrandInsights,
  type PriorWeekSnapshot
} from "@/lib/services/meta-ads-report-insights-service";
import {
  generateInstagramInsights,
  type InstagramInsights
} from "@/lib/services/instagram-report-insights-service";
import { buildMarketingPlannerInfluencerIntelligence } from "@/lib/services/marketing-planner-influencer-service";
import {
  buildReconciliationReport,
  type ReconciliationReport
} from "@/lib/services/reconciliation-engine-service";
import {
  buildChannelPerformanceReport,
  type ChannelPerformanceReport
} from "@/lib/services/channel-performance-engine-service";
import {
  buildCampaignShopifyAttribution,
  type CampaignShopifyAttributionReport
} from "@/lib/services/campaign-shopify-attribution-service";
import {
  buildAffiliateDeepDive,
  type AffiliateDeepDiveReport
} from "@/lib/services/affiliate-deep-dive-service";
import {
  buildRestockHeroAlerts,
  type RestockHeroAlertReport
} from "@/lib/services/restock-hero-alert-service";
import {
  measureOutcomesForResolvedAlerts,
  getRecentlyResolvedWithOutcomes,
  type ResolvedAlertWithOutcome
} from "@/lib/services/alert-outcome-service";
import {
  buildRecommendation,
  DEFAULT_TARGETS,
  type Recommendation
} from "@/lib/services/recommendation-engine-service";
import { getDb } from "@/lib/server/db";
import { getAppLocale } from "@/lib/i18n";

// Print-only weekly Meta Ads report. Server-rendered, no client JS,
// captured to PDF by Playwright (or visible directly in a browser).
//
// URL: /print/meta-ads-weekly?from=YYYY-MM-DD&to=YYYY-MM-DD&storeId=...&locale=he
//
// Visual language: clean black-and-white, A4-friendly. Sections:
//   • Header (title + date range)
//   • Cross-brand totals
//   • Per brand:
//       - AI insights (hookline + observations + actions)
//       - KPI tiles (spend / CPC / CPM / CTR / clicks / impressions / purchases / ROAS)
//       - Funnel (Impressions → Clicks → Landing → ATC → Checkout → Purchase)
//       - Daily breakdown
//       - All campaigns table
//       - All ads table
//   • Instagram / affiliates
//   • Footer

export const dynamic = "force-dynamic";

interface SearchParams {
  from?: string;
  to?: string;
  storeId?: string;
  locale?: string;
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function defaultLastSevenDays(): { start: Date; end: Date } {
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  start.setUTCHours(0, 0, 0, 0);
  return { start, end };
}

function formatCurrencyILS(value: number): string {
  return `₪${Math.round(value).toLocaleString("en-US")}`;
}

function formatNumberShort(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function formatRatio(value: number, digits = 2): string {
  return value.toFixed(digits);
}

function formatPct(value: number, digits = 2): string {
  return `${value.toFixed(digits)}%`;
}

function formatDateRange(start: Date, end: Date, locale: "he" | "en"): string {
  const fmt = new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

function formatDayShort(dateKey: string, locale: "he" | "en"): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-US", {
    day: "numeric",
    month: "short"
  }).format(d);
}

export default async function MetaAdsWeeklyPrintPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  // Locale: URL param wins, cookie fallback, default Hebrew.
  const cookieLocale = await getAppLocale();
  const urlLocale = params.locale === "he" || params.locale === "en" ? params.locale : null;
  const locale: "he" | "en" = urlLocale ?? cookieLocale;
  const isHe = locale === "he";
  const direction: "rtl" | "ltr" = isHe ? "rtl" : "ltr";

  const explicitStart = parseDate(params.from);
  const explicitEnd = parseDate(params.to);
  const { start, end } =
    explicitStart && explicitEnd
      ? { start: explicitStart, end: explicitEnd }
      : defaultLastSevenDays();

  const storeId = params.storeId?.trim() || (await resolveActiveStoreId());
  let report = null as Awaited<ReturnType<typeof buildMetaAdsWeeklyReport>> | null;
  let diagnostic: string | null = null;
  let reconciliation: ReconciliationReport | null = null;
  let channels: ChannelPerformanceReport | null = null;
  let campaignAttribution: CampaignShopifyAttributionReport | null = null;
  let affiliateDeepDive: AffiliateDeepDiveReport | null = null;
  let restockAlerts: RestockHeroAlertReport | null = null;
  if (!storeId) {
    diagnostic = "no_store";
  } else {
    // Run all six data builds in parallel so the cumulative cost is the
    // slowest single query, not the sum of them all.
    [report, reconciliation, channels, campaignAttribution, affiliateDeepDive, restockAlerts] = await Promise.all([
      buildMetaAdsWeeklyReport({ storeId, start, end }),
      buildReconciliationReport({ storeId, start, end }).catch(() => null),
      buildChannelPerformanceReport({ storeId, start, end }).catch(() => null),
      buildCampaignShopifyAttribution({ storeId, start, end }).catch(() => null),
      buildAffiliateDeepDive({ storeId, start, end }).catch(() => null),
      buildRestockHeroAlerts({ storeId, start, end }).catch(() => null)
    ]);
    if (!report) diagnostic = "no_meta_connection";
    // Closed-loop: refresh outcome measurements + read for the report. Lives
    // here so the PDF shows the same loop the founder sees on the Command
    // Center. Measurement is cheap + idempotent; safe on every PDF render.
    await measureOutcomesForResolvedAlerts({ storeId }).catch(() => null);
  }
  const closedLoop = storeId
    ? await getRecentlyResolvedWithOutcomes({ storeId, lookbackDays: 14, limit: 8 }).catch(() => [])
    : [];

  // Build a prior-week snapshot per brand so the insights service can frame
  // observations as trends, not snapshots. The prior window is the same
  // length as the current window, ending the day before it starts.
  const priorByBrand = new Map<string, PriorWeekSnapshot>();
  if (report && report.brands.length > 0 && storeId) {
    const windowMs = end.getTime() - start.getTime();
    const priorEnd = new Date(start.getTime() - 1);
    const priorStart = new Date(priorEnd.getTime() - windowMs);
    const priorReport = await buildMetaAdsWeeklyReport({
      storeId,
      start: priorStart,
      end: priorEnd
    }).catch(() => null);
    if (priorReport) {
      for (const priorBrand of priorReport.brands) {
        priorByBrand.set(priorBrand.name, {
          spend: priorBrand.kpis.spend,
          clicks: priorBrand.kpis.clicks,
          impressions: priorBrand.kpis.impressions,
          purchases: priorBrand.kpis.purchases,
          purchaseRoas: priorBrand.kpis.purchaseRoas,
          ctr: priorBrand.kpis.ctr,
          cpc: priorBrand.kpis.cpc
        });
      }
    }
  }

  const insightsByBrand = new Map<string, BrandInsights>();
  if (report && report.brands.length > 0) {
    const results = await Promise.all(
      report.brands.map((brand) =>
        generateBrandInsights(brand, report!.dateRange, isHe ? "he" : "en", {
          prior: priorByBrand.get(brand.name) ?? null
        }).then((insights) => [brand.name, insights] as const)
      )
    );
    for (const [name, insights] of results) insightsByBrand.set(name, insights);
  }

  let influencer: Awaited<ReturnType<typeof buildMarketingPlannerInfluencerIntelligence>> | null = null;
  // 30-day window for Instagram posts so creators who don't post every week
  // still surface. The Meta Ads numbers stay on the report's own window.
  const postsWindowEnd = new Date(end);
  const postsWindowStart = new Date(end);
  postsWindowStart.setUTCDate(postsWindowStart.getUTCDate() - 30);
  let widePosts: Array<{
    username: string;
    captionPreview: string;
    likes: number;
    comments: number;
    postedAt: string;
  }> = [];
  if (storeId) {
    try {
      const db = getDb();
      const store = await db.store.findUnique({
        where: { id: storeId },
        select: { name: true, domain: true }
      });
      if (store) {
        influencer = await buildMarketingPlannerInfluencerIntelligence(
          { storeId, storeName: store.name, storeDomain: store.domain, connected: true },
          end,
          { start, end, periodLabel: `${params.from ?? ""} → ${params.to ?? ""}` }
        );
      }
      // Pull recent posts over the wider 30-day window directly so even
      // infrequent posters get represented. Sort by engagement.
      const rawPosts = await db.creatorPost.findMany({
        where: {
          storeId,
          postedAt: { gte: postsWindowStart, lte: postsWindowEnd }
        },
        include: { creatorProfile: { select: { username: true } } },
        orderBy: { postedAt: "desc" },
        take: 50
      });
      widePosts = (rawPosts as any[])
        .map((p) => ({
          username: p.creatorProfile?.username ?? "?",
          captionPreview: String(p.caption ?? "").slice(0, 120),
          likes: Number(p.likeCount ?? 0),
          comments: Number(p.commentsCount ?? 0),
          postedAt: p.postedAt.toISOString().slice(0, 10)
        }))
        .sort((a, b) => b.likes + b.comments - (a.likes + a.comments))
        .slice(0, 10);
    } catch {
      influencer = null;
    }
  }

  // Instagram AI insights — fed off the same data the section renders.
  let igInsights: InstagramInsights | null = null;
  if (influencer) {
    const profiles = influencer.instagramCrawl?.affiliateProfiles ?? [];
    const topCreatorsLookup = new Map<string, { sales: number; orders: number }>();
    for (const c of influencer.topCreators ?? []) {
      const handle = (c.couponCode ?? c.affiliateCode ?? c.name ?? "").toLowerCase();
      topCreatorsLookup.set(handle, { sales: c.sales, orders: c.orders });
    }
    igInsights = await generateInstagramInsights(
      {
        dateRange: { start: postsWindowStart.toISOString().slice(0, 10), end: postsWindowEnd.toISOString().slice(0, 10) },
        affiliates: profiles.map((p) => ({
          username: p.username,
          displayName: p.affiliateName ?? null,
          status: p.status,
          postsStored: p.postsStored ?? 0,
          lastPostAt: p.lastPostAt ?? null,
          attributedSales: topCreatorsLookup.get(p.username.toLowerCase())?.sales ?? 0,
          attributedOrders: topCreatorsLookup.get(p.username.toLowerCase())?.orders ?? 0
        })),
        recentPosts: widePosts
      },
      isHe ? "he" : "en"
    ).catch(() => null);
  }

  const t = isHe
    ? {
        eyebrow: "דוח ביצועים שבועי",
        title: "סיכום שבועי – Meta Ads",
        subtitle: "ביצועי קמפיינים, משפיענים ומסקנות לפעולה",
        accountLabel: "חשבון מודעות",
        // Totals
        totalsTitle: "סיכום כללי",
        totalSpend: "סה״כ הוצאה",
        totalImpressions: "חשיפות",
        totalClicks: "קליקים",
        totalPurchases: "רכישות",
        // Page 4 / 5 — Meta-attributed only (Meta's own purchase tracking).
        // Page 1 uses a different "blended" ROAS label so the two never
        // collide visually.
        weightedRoas: "ROAS לפי Meta",
        brandsLabel: "מותגים",
        campaignsTotal: "קמפיינים",
        adsTotal: "מודעות",
        // KPI tiles
        spend: "הוצאה",
        cpc: "CPC",
        cpm: "CPM",
        ctr: "CTR",
        clicks: "קליקים",
        impressions: "חשיפות",
        purchases: "רכישות",
        roas: "ROAS",
        // Insights
        insightsHook: "מסקנה השבוע",
        observationsLabel: "מה קרה",
        actionsLabel: "פעולות לשבוע הבא",
        // Funnel
        funnelTitle: "משפך המרה",
        funnelImpr: "חשיפות",
        funnelClicks: "קליקים",
        funnelLPV: "צפיות בדף נחיתה",
        funnelATC: "הוספה לסל",
        funnelIC: "התחלת checkout",
        funnelPurch: "רכישה",
        // Daily
        dailyTitle: "פירוט יומי",
        dailyDate: "תאריך",
        // Tables
        campaignsTitle: "כל הקמפיינים",
        campaignName: "שם קמפיין",
        adsTitle: "כל המודעות",
        adsetLabel: "ערכת מודעות",
        adLabel: "מודעה",
        noAds: "אין מודעות פעילות בטווח התאריכים שנבחר.",
        // Instagram
        instagramTitle: "Instagram ושיתופי פעולה",
        instagramSubtitle: "ביצועי משפיענים ופוסטים בשבוע הנבחר",
        topCreatorsLabel: "המשפיענים המובילים",
        topPostsLabel: "פוסטים מובילים (לפי לייקים + תגובות)",
        noInfluencer: "אין נתוני משפיענים זמינים לטווח התאריכים שנבחר.",
        likesLabel: "לייקים",
        commentsLabel: "תגובות",
        salesLabel: "מכירות",
        ordersLabel: "הזמנות",
        clicksLabelIg: "קליקים",
        allAffiliatesLabel: "כל המשפיענים המוגדרים",
        profileStatusLabel: "מצב",
        profilePostsLabel: "פוסטים שמורים",
        profileLastPostLabel: "פוסט אחרון",
        statusStored: "פעיל (יש פוסטים)",
        statusScanned: "נסרק (אין פוסטים)",
        statusHandleSaved: "ממתין לסריקה",
        statusMissing: "לא נמצא",
        windowLabel: "חלון נתונים: 30 הימים האחרונים",
        // Diagnostics
        noBrands: "לא נמצאו קמפיינים לתקופה זו.",
        noRules: "לא הוגדרו כללי שיוך מותגים – כל הקמפיינים מקובצים יחד.",
        diagNoStore: "לא נמצאה חנות פעילה.",
        diagNoMeta: "לא קיים חיבור Meta Ads לחנות הפעילה.",
        diagTitle: "הדוח לא נוצר",
        footer: "נוצר אוטומטית",
        campaignsWord: "קמפיינים",
        adsWord: "מודעות"
      }
    : {
        eyebrow: "WEEKLY PERFORMANCE REPORT",
        title: "Weekly Summary – Meta Ads",
        subtitle: "Campaign performance, creators, and actions for next week",
        accountLabel: "Ad account",
        totalsTitle: "Overview",
        totalSpend: "Total spend",
        totalImpressions: "Impressions",
        totalClicks: "Clicks",
        totalPurchases: "Purchases",
        weightedRoas: "Meta-attributed ROAS",
        brandsLabel: "Brands",
        campaignsTotal: "Campaigns",
        adsTotal: "Ads",
        spend: "Spend",
        cpc: "CPC",
        cpm: "CPM",
        ctr: "CTR",
        clicks: "Clicks",
        impressions: "Impressions",
        purchases: "Purchases",
        roas: "ROAS",
        insightsHook: "This week",
        observationsLabel: "What happened",
        actionsLabel: "Actions for next week",
        funnelTitle: "Conversion funnel",
        funnelImpr: "Impressions",
        funnelClicks: "Clicks",
        funnelLPV: "Landing page views",
        funnelATC: "Add to cart",
        funnelIC: "Initiate checkout",
        funnelPurch: "Purchase",
        dailyTitle: "Daily breakdown",
        dailyDate: "Date",
        campaignsTitle: "All campaigns",
        campaignName: "Campaign name",
        adsTitle: "All ads",
        adsetLabel: "Ad set",
        adLabel: "Ad",
        noAds: "No ads in the selected window.",
        instagramTitle: "Instagram & affiliates",
        instagramSubtitle: "Creator and post performance for the selected week",
        topCreatorsLabel: "Top creators",
        topPostsLabel: "Top posts (by likes + comments)",
        noInfluencer: "No influencer data available for the selected window.",
        likesLabel: "Likes",
        commentsLabel: "Comments",
        salesLabel: "Sales",
        ordersLabel: "Orders",
        clicksLabelIg: "Clicks",
        allAffiliatesLabel: "All configured creators",
        profileStatusLabel: "Status",
        profilePostsLabel: "Posts stored",
        profileLastPostLabel: "Last post",
        statusStored: "Active (posts present)",
        statusScanned: "Scanned (no posts)",
        statusHandleSaved: "Awaiting first crawl",
        statusMissing: "Not found",
        windowLabel: "Data window: last 30 days",
        noBrands: "No campaigns found in this period.",
        noRules: "No brand rules configured – all campaigns grouped together.",
        diagNoStore: "No active store found.",
        diagNoMeta: "No Meta Ads connection for the active store.",
        diagTitle: "Report could not be generated",
        footer: "Auto-generated",
        campaignsWord: "campaigns",
        adsWord: "ads"
      };

  // Cross-brand totals computed from the per-brand KPIs.
  const totals = report
    ? {
        spend: report.brands.reduce((s, b) => s + b.kpis.spend, 0),
        clicks: report.brands.reduce((s, b) => s + b.kpis.clicks, 0),
        impressions: report.brands.reduce((s, b) => s + b.kpis.impressions, 0),
        purchases: report.brands.reduce((s, b) => s + b.kpis.purchases, 0),
        brands: report.brands.length,
        campaigns: report.totals.campaignCount,
        ads: report.brands.reduce((s, b) => s + b.ads.length, 0),
        roas: (() => {
          let num = 0;
          let den = 0;
          for (const b of report.brands) {
            if (b.kpis.purchaseRoas != null && b.kpis.spend > 0) {
              num += b.kpis.purchaseRoas * b.kpis.spend;
              den += b.kpis.spend;
            }
          }
          return den > 0 ? num / den : null;
        })()
      }
    : null;

  // Hard-prefixed CSS so styles don't leak into the rest of the app. Clean
  // print look: white background, black text, gray dividers, no gradients.
  const css = `
    .pwr-root {
      direction: ${direction};
      min-height: 100vh;
      padding: 28px 28px 40px;
      background: #ffffff;
      color: #0f172a;
      font-family: "Segoe UI", "Helvetica Neue", Helvetica, Arial, "Noto Sans Hebrew", "Heebo", sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    .pwr-report { max-width: 740px; margin: 0 auto; }
    .pwr-hero { padding: 0 0 18px; border-bottom: 2px solid #0f172a; margin-bottom: 18px; }
    .pwr-eyebrow {
      margin: 0 0 6px;
      font-size: 10px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: #64748b;
    }
    .pwr-title { margin: 0 0 4px; font-size: 28px; font-weight: 800; letter-spacing: -0.01em; color: #0f172a; }
    .pwr-subtitle { margin: 0 0 10px; font-size: 13px; color: #475569; }
    .pwr-date {
      display: inline-block;
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 600;
      color: #0f172a;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
    }
    .pwr-section { margin-top: 22px; }
    .pwr-section + .pwr-section { margin-top: 22px; }
    .pwr-section-title {
      margin: 0 0 10px;
      padding-bottom: 6px;
      border-bottom: 1px solid #0f172a;
      font-size: 14px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #0f172a;
      font-weight: 700;
    }
    .pwr-brand-block {
      margin-top: 24px;
      padding-top: 14px;
      border-top: 2px solid #0f172a;
    }
    .pwr-brand-block:first-of-type { margin-top: 18px; }
    .pwr-brand-name { margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; }
    .pwr-brand-meta { font-size: 11px; color: #64748b; }
    .pwr-kpi-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-top: 12px;
    }
    .pwr-kpi {
      padding: 8px 10px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      background: #ffffff;
    }
    .pwr-kpi-label {
      margin: 0 0 2px;
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #64748b;
    }
    .pwr-kpi-value { margin: 0; font-size: 16px; font-weight: 800; color: #0f172a; }
    .pwr-insights {
      margin-top: 14px;
      padding: 12px 14px;
      border: 1px solid #0f172a;
      border-radius: 4px;
      background: #f8fafc;
    }
    .pwr-insights-hook { margin: 0 0 8px; font-size: 13px; font-weight: 700; color: #0f172a; line-height: 1.5; }
    .pwr-insights-label {
      margin: 8px 0 4px;
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #64748b;
    }
    .pwr-insights-list { margin: 0; padding: 0; list-style: none; }
    .pwr-insights-list li {
      padding: 2px 0 2px 12px;
      position: relative;
      font-size: 12px;
      line-height: 1.55;
      color: #0f172a;
    }
    .pwr-insights-list li::before {
      content: "•";
      position: absolute;
      ${isHe ? "right" : "left"}: 0;
      color: #0f172a;
    }
    [dir="rtl"] .pwr-insights-list li {
      padding-${isHe ? "left" : "right"}: 0;
      padding-${isHe ? "right" : "left"}: 12px;
    }
    .pwr-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin-top: 8px;
    }
    .pwr-table thead th {
      text-align: ${isHe ? "right" : "left"};
      font-size: 9px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #475569;
      padding: 6px 8px;
      border-bottom: 2px solid #0f172a;
      background: #f1f5f9;
      font-weight: 700;
    }
    .pwr-table tbody td {
      padding: 6px 8px;
      color: #0f172a;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: top;
    }
    .pwr-table tbody tr:last-child td { border-bottom: 1px solid #0f172a; }
    .pwr-table tbody tr:nth-child(even) td { background: #fafafa; }
    .pwr-funnel { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; margin-top: 8px; }
    .pwr-funnel-cell { padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; text-align: center; }
    .pwr-funnel-label { margin: 0 0 4px; font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: #64748b; }
    .pwr-funnel-value { margin: 0; font-size: 14px; font-weight: 800; color: #0f172a; }
    .pwr-funnel-rate { margin: 4px 0 0; font-size: 10px; color: #475569; }
    .pwr-block-title {
      margin: 14px 0 4px;
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #0f172a;
      font-weight: 700;
    }
    .pwr-ig-card { margin-top: 8px; border: 1px solid #cbd5e1; border-radius: 4px; padding: 10px 12px; }
    .pwr-ig-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 6px 0;
      border-bottom: 1px solid #e2e8f0;
      font-size: 11px;
      color: #0f172a;
    }
    .pwr-ig-row:last-child { border-bottom: none; }
    .pwr-ig-name { flex: 1; min-width: 0; word-break: break-word; font-weight: 600; }
    .pwr-ig-stats {
      display: flex;
      gap: 10px;
      flex-shrink: 0;
      font-size: 11px;
      color: #475569;
      white-space: nowrap;
    }
    .pwr-ig-stat-num { color: #0f172a; font-weight: 700; }
    .pwr-warning {
      margin-top: 14px;
      padding: 10px 12px;
      border-radius: 4px;
      background: #fef9c3;
      border: 1px solid #ca8a04;
      color: #713f12;
      font-size: 11px;
      line-height: 1.5;
    }
    .pwr-footer { margin-top: 26px; padding-top: 10px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 10px; color: #64748b; }
    /* Executive page styling — Pages 1, 2, 3 of the new 11-page report */
    .pwr-exec-page {
      page-break-after: always;
      padding-bottom: 24px;
    }
    .pwr-exec-page:last-child {
      page-break-after: auto;
    }
    .pwr-exec-page-tag {
      display: inline-block;
      font-size: 10px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #64748b;
      margin-bottom: 4px;
    }
    .pwr-exec-page-title {
      font-size: 22px;
      font-weight: 800;
      margin: 0 0 4px;
      color: #0f172a;
    }
    .pwr-exec-page-sub {
      font-size: 12px;
      color: #475569;
      margin: 0 0 18px;
    }
    .pwr-bottom-line {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }
    .pwr-bottom-line .pwr-kpi {
      padding: 10px 12px;
    }
    .pwr-bottom-line .pwr-kpi-value {
      font-size: 18px;
    }
    .pwr-src {
      display: inline-block;
      vertical-align: super;
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.05em;
      padding: 1px 4px;
      margin-${isHe ? "right" : "left"}: 4px;
      border-radius: 3px;
      color: #475569;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
    }
    .pwr-src-meta { color: #1d4ed8; background: #eff6ff; border-color: #bfdbfe; }
    .pwr-src-shopify { color: #047857; background: #ecfdf5; border-color: #a7f3d0; }
    .pwr-src-calc { color: #6b21a8; background: #faf5ff; border-color: #d8b4fe; }
    .pwr-src-blended { color: #b45309; background: #fffbeb; border-color: #fde68a; }
    .pwr-highlight-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 12px;
    }
    .pwr-highlight {
      padding: 10px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      background: #ffffff;
    }
    .pwr-highlight-label {
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #64748b;
      margin: 0 0 4px;
    }
    .pwr-highlight-value {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
      margin: 0;
      line-height: 1.3;
    }
    .pwr-highlight-detail {
      font-size: 11px;
      color: #475569;
      margin: 3px 0 0;
      line-height: 1.4;
    }
    .pwr-exec-summary {
      padding: 14px 16px;
      border: 2px solid #0f172a;
      border-radius: 4px;
      background: #f8fafc;
      margin: 16px 0 0;
    }
    .pwr-exec-summary p {
      margin: 0;
      font-size: 13px;
      line-height: 1.6;
      color: #0f172a;
    }
    .pwr-recon-warning {
      padding: 10px 12px;
      border-radius: 4px;
      margin-bottom: 8px;
      font-size: 11px;
      line-height: 1.5;
    }
    .pwr-recon-warning-error { background: #fef2f2; border: 1px solid #fecaca; color: #7f1d1d; }
    .pwr-recon-warning-warning { background: #fefce8; border: 1px solid #fde68a; color: #713f12; }
    .pwr-recon-warning-info { background: #f0f9ff; border: 1px solid #bae6fd; color: #075985; }
    .pwr-flag-banner {
      margin: 0 0 14px 0;
      padding: 12px 14px;
      background: #fef2f2;
      border-left: 4px solid #dc2626;
      border-right: 1px solid #fecaca;
      border-top: 1px solid #fecaca;
      border-bottom: 1px solid #fecaca;
      border-radius: 4px;
      page-break-inside: avoid;
    }
    .pwr-flag-banner-title {
      font-size: 13px;
      font-weight: 800;
      color: #7f1d1d;
      letter-spacing: 0.02em;
      margin: 0 0 6px 0;
    }
    .pwr-flag-banner-list {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .pwr-flag-banner-item {
      padding: 6px 0;
      border-top: 1px dashed #fecaca;
      font-size: 11.5px;
      color: #450a0a;
      line-height: 1.55;
    }
    .pwr-flag-banner-item:first-child { border-top: none; padding-top: 2px; }
    .pwr-flag-banner-item strong { color: #7f1d1d; }
    .pwr-flag-card {
      border: 1px solid #fecaca;
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 8px;
      background: #ffffff;
      page-break-inside: avoid;
    }
    .pwr-flag-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 8px;
    }
    .pwr-flag-card-title {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
      margin: 0;
    }
    .pwr-flag-card-rank {
      font-size: 10px;
      font-weight: 600;
      color: #7f1d1d;
      background: #fef2f2;
      border: 1px solid #fecaca;
      padding: 2px 6px;
      border-radius: 999px;
      white-space: nowrap;
    }
    .pwr-flag-card-stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      margin-bottom: 8px;
    }
    .pwr-flag-card-stat {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      padding: 6px 8px;
    }
    .pwr-flag-card-stat-label { font-size: 9px; color: #64748b; letter-spacing: 0.04em; text-transform: uppercase; }
    .pwr-flag-card-stat-value { font-size: 12px; font-weight: 700; color: #0f172a; margin-top: 1px; }
    .pwr-flag-card-action {
      font-size: 11.5px;
      color: #7f1d1d;
      background: #fef2f2;
      border: 1px dashed #fecaca;
      border-radius: 4px;
      padding: 8px 10px;
      line-height: 1.55;
    }
    .pwr-conf {
      display: inline-block;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.06em;
      padding: 1px 6px;
      border-radius: 3px;
    }
    .pwr-conf-high { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
    .pwr-conf-medium { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
    .pwr-conf-low { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
    @media print {
      @page { size: A4; margin: 14mm 12mm; }
      body { background: #ffffff !important; }
      .pwr-root { padding: 0; min-height: 0; }
      .pwr-brand-block { page-break-inside: avoid; }
      .pwr-section { page-break-inside: avoid; }
      .pwr-exec-page { page-break-after: always; }
    }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="pwr-root">
        <div className="pwr-report">
          <header className="pwr-hero">
            <p className="pwr-eyebrow">{t.eyebrow}</p>
            <h1 className="pwr-title">{t.title}</h1>
            <p className="pwr-subtitle">{t.subtitle}</p>
            <span className="pwr-date">{formatDateRange(start, end, locale)}</span>
          </header>

          {diagnostic ? (
            <div className="pwr-section">
              <h2 className="pwr-section-title">{t.diagTitle}</h2>
              <p style={{ margin: 0, fontSize: 13 }}>
                {diagnostic === "no_store" ? t.diagNoStore : t.diagNoMeta}
              </p>
              <p style={{ marginTop: 10, fontSize: 10, color: "#64748b" }}>
                storeId: <code>{storeId ?? "(none)"}</code> · range:{" "}
                <code>{params.from ?? "(default)"} → {params.to ?? "(default)"}</code>
              </p>
            </div>
          ) : null}

          {/* Red-flag banner — pinned above Page 1 so restocked heroes are
              the first thing the founder sees on opening the PDF. */}
          {restockAlerts && restockAlerts.flags.length > 0 ? (
            <RestockHeroBanner alerts={restockAlerts} isHe={isHe} />
          ) : null}

          {/* PAGE 1 — Executive Summary (the 60-second view) */}
          {reconciliation && report ? (
            <ExecutiveSummaryPage
              recon={reconciliation}
              report={report}
              influencer={influencer}
              widePosts={widePosts}
              metaInsights={insightsByBrand}
              isHe={isHe}
            />
          ) : null}

          {/* Closed Loop — what happened after the founder acted on prior
              recommendations. Lives between Exec Summary and Hot Restocks
              so the founder reads "what worked / what didn't" BEFORE
              triaging this week's new asks. */}
          {closedLoop.length > 0 ? (
            <ClosedLoopPage items={closedLoop} isHe={isHe} />
          ) : null}

          {/* Hot Restocks — dedicated action page right after the closed loop. */}
          {restockAlerts && restockAlerts.flags.length > 0 ? (
            <RestockHeroActionPage alerts={restockAlerts} isHe={isHe} />
          ) : null}

          {/* PAGE 2 — Executive Growth Insights (Hebrew 4-section block) */}
          {reconciliation && report ? (
            <ExecutiveGrowthInsightsPage
              recon={reconciliation}
              report={report}
              influencer={influencer}
              widePosts={widePosts}
              metaInsights={insightsByBrand}
              igInsights={igInsights}
              isHe={isHe}
            />
          ) : null}

          {/* PAGE 3 — Data Reconciliation (sources side-by-side + warnings) */}
          {reconciliation ? (
            <DataReconciliationPage recon={reconciliation} isHe={isHe} />
          ) : null}

          {/* PAGE 5 — Channel Performance (Shopify orders bucketed by source) */}
          {channels ? <ChannelPerformancePage channels={channels} isHe={isHe} /> : null}

          {/* PAGE 6 — Campaign Performance (Meta vs Shopify + recommendations) */}
          {campaignAttribution && report ? (
            <CampaignPerformancePage attribution={campaignAttribution} report={report} isHe={isHe} />
          ) : null}

          {report && totals ? (
            <section className="pwr-section">
              <h2 className="pwr-section-title">{t.totalsTitle}</h2>
              <div className="pwr-kpi-row">
                <Tile label={t.totalSpend} value={formatCurrencyILS(totals.spend)} />
                <Tile label={t.totalClicks} value={formatNumberShort(totals.clicks)} />
                <Tile label={t.totalImpressions} value={formatNumberShort(totals.impressions)} />
                <Tile label={t.totalPurchases} value={formatNumberShort(totals.purchases)} />
              </div>
              <div className="pwr-kpi-row" style={{ marginTop: 6 }}>
                <Tile label={t.weightedRoas} value={totals.roas != null ? `${formatRatio(totals.roas)}x` : "—"} source="M" />
                <Tile label={t.brandsLabel} value={String(totals.brands)} />
                <Tile label={t.campaignsTotal} value={String(totals.campaigns)} />
                <Tile label={t.adsTotal} value={String(totals.ads)} />
              </div>
              {!report.rulesActive ? <div className="pwr-warning">{t.noRules}</div> : null}
            </section>
          ) : null}

          {report && report.brands.length === 0 ? (
            <div className="pwr-section">
              <h2 className="pwr-section-title">{t.diagTitle}</h2>
              <p style={{ margin: 0, fontSize: 13 }}>{t.noBrands}</p>
            </div>
          ) : null}

          {report
            ? report.brands.map((brand) => (
                <BrandBlock
                  key={brand.name}
                  brand={brand}
                  insights={insightsByBrand.get(brand.name) ?? null}
                  t={t}
                  locale={locale}
                />
              ))
            : null}

          {influencer ? (
            <InstagramSection
              influencer={influencer}
              widePosts={widePosts}
              igInsights={igInsights}
              t={t}
            />
          ) : null}

          {/* Affiliate Performance — detailed breakdown per affiliate */}
          {affiliateDeepDive && affiliateDeepDive.affiliates.length > 0 ? (
            <AffiliatePerformancePage deepDive={affiliateDeepDive} isHe={isHe} />
          ) : null}

          <p className="pwr-footer">
            {t.footer}
            {report?.account ? ` · ${t.accountLabel}: ${report.account.name ?? report.account.id}` : ""}
          </p>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Executive helpers (Phase 1)
// ─────────────────────────────────────────────────────────────────────

type ConfLevel = "high" | "medium" | "low";

function confidenceFromSpend(spend: number, purchases: number): ConfLevel {
  // High = enough money + signal. Medium = some signal. Low = noise.
  if (spend >= 1000 && purchases >= 5) return "high";
  if (spend >= 200 && purchases >= 1) return "medium";
  return "low";
}

function SourceTag({ source }: { source: "M" | "S" | "Calc" | "Blended" }) {
  const cls =
    source === "M"
      ? "pwr-src pwr-src-meta"
      : source === "S"
        ? "pwr-src pwr-src-shopify"
        : source === "Blended"
          ? "pwr-src pwr-src-blended"
          : "pwr-src pwr-src-calc";
  return <span className={cls}>{source}</span>;
}

function ConfBadge({ level, isHe }: { level: ConfLevel; isHe: boolean }) {
  const labelHe = level === "high" ? "ביטחון גבוה" : level === "medium" ? "ביטחון בינוני" : "ביטחון נמוך";
  const labelEn = level === "high" ? "HIGH CONF" : level === "medium" ? "MED CONF" : "LOW CONF";
  return <span className={`pwr-conf pwr-conf-${level}`}>{isHe ? labelHe : labelEn}</span>;
}

// Pick the campaign that best earns the "best of week" label across the
// brands we have. Rank: purchases first, then ROAS, then spend.
function pickBestCampaign(
  brands: MetaAdsReportBrand[]
): { name: string; spend: number; purchases: number; roas: number | null } | null {
  let best: { name: string; spend: number; purchases: number; roas: number | null } | null = null;
  for (const b of brands) {
    for (const c of b.campaigns) {
      const candidate = { name: c.campaignName, spend: c.spend, purchases: c.purchases, roas: c.purchaseRoas };
      if (!best) {
        best = candidate;
        continue;
      }
      if (
        candidate.purchases > best.purchases ||
        (candidate.purchases === best.purchases && (candidate.roas ?? 0) > (best.roas ?? 0)) ||
        (candidate.purchases === best.purchases && (candidate.roas ?? 0) === (best.roas ?? 0) && candidate.spend > best.spend)
      ) {
        best = candidate;
      }
    }
  }
  return best;
}

type AdHighlight = { name: string; spend: number; purchases: number; roas: number | null };

// Pick the two flavours of "best ad" — by volume (purchases) and by
// efficiency (ROAS with a real-spend floor). The Paz/influencer creative
// often has the best ROAS but lower purchase count; the evergreen creative
// often has the highest absolute purchases. A founder wants to see both.
function pickBestAds(brands: MetaAdsReportBrand[]): {
  byPurchases: AdHighlight | null;
  byRoas: AdHighlight | null;
} {
  const MIN_SPEND_FOR_VOLUME = 50; // ignore noise candidates for "most purchases"
  const MIN_SPEND_FOR_ROAS = 200; // a higher floor for ROAS pick — keep one-purchase flukes out
  let byPurchases: AdHighlight | null = null;
  let byRoas: AdHighlight | null = null;
  for (const b of brands) {
    for (const a of b.ads) {
      const candidate: AdHighlight = {
        name: a.adName ?? "?",
        spend: a.spend,
        purchases: a.purchases,
        roas: a.purchaseRoas
      };

      // by purchases — primary rank is purchase count, ties broken by ROAS, then spend.
      if (candidate.spend >= MIN_SPEND_FOR_VOLUME) {
        if (
          !byPurchases ||
          candidate.purchases > byPurchases.purchases ||
          (candidate.purchases === byPurchases.purchases && (candidate.roas ?? 0) > (byPurchases.roas ?? 0)) ||
          (candidate.purchases === byPurchases.purchases && (candidate.roas ?? 0) === (byPurchases.roas ?? 0) && candidate.spend > byPurchases.spend)
        ) {
          byPurchases = candidate;
        }
      }

      // by ROAS — only ads with real delivery (≥₪200) AND at least 3 purchases
      // qualify, so a single fluke doesn't crown the wrong creative.
      if (candidate.spend >= MIN_SPEND_FOR_ROAS && candidate.purchases >= 3 && candidate.roas != null) {
        if (!byRoas || (candidate.roas ?? 0) > (byRoas.roas ?? 0)) {
          byRoas = candidate;
        }
      }
    }
  }

  // Edge case: if the same ad wins both, only show it once (as the ROAS winner
  // since that's the more interesting signal).
  if (byPurchases && byRoas && byPurchases.name === byRoas.name) {
    byPurchases = null;
  }
  return { byPurchases, byRoas };
}

// Pick the best influencer. Priority order:
//   1) Sales-attributed creator (coupon/UTM/affiliate code matched).
//   2) Engagement winner from the 30-day post window — there might not BE a
//      sales-attributed creator yet (no coupon codes wired) but we still want
//      to highlight whoever is driving real awareness for the brand.
// We label the source differently so the founder knows which one they're
// looking at.
function pickBestInfluencer(
  influencer: Awaited<ReturnType<typeof buildMarketingPlannerInfluencerIntelligence>> | null,
  widePosts: Array<{ username: string; likes: number; comments: number; postedAt: string }>
): { name: string; primaryLine: string; secondaryLine: string | null; mode: "sales" | "engagement" } | null {
  if (influencer?.topCreators?.length) {
    const top = influencer.topCreators[0];
    return {
      name: top.name,
      primaryLine: `₪${Math.round(top.sales).toLocaleString("en-US")} · ${top.orders} orders`,
      secondaryLine: null,
      mode: "sales"
    };
  }
  if (widePosts.length === 0) return null;
  // Aggregate engagement per username across the 30-day window.
  const byUser = new Map<string, { likes: number; comments: number; posts: number }>();
  for (const p of widePosts) {
    const cur = byUser.get(p.username) ?? { likes: 0, comments: 0, posts: 0 };
    cur.likes += p.likes;
    cur.comments += p.comments;
    cur.posts += 1;
    byUser.set(p.username, cur);
  }
  let best: { name: string; likes: number; comments: number; posts: number } | null = null;
  for (const [name, stats] of byUser.entries()) {
    const score = stats.likes + stats.comments;
    const bestScore = best ? best.likes + best.comments : -1;
    if (score > bestScore) best = { name, ...stats };
  }
  if (!best) return null;
  return {
    name: `@${best.name}`,
    primaryLine: `${best.likes.toLocaleString("en-US")} likes · ${best.comments} comments`,
    secondaryLine: `${best.posts} posts (engagement-based, no sales attribution)`,
    mode: "engagement"
  };
}

function pickMainRisk(
  recon: ReconciliationReport,
  isHe: boolean
): string {
  // Priority: errors > warnings > healthy.
  const err = recon.validation.warnings.find((w) => w.severity === "error");
  if (err) return isHe ? err.messageHe : err.messageEn;
  const warn = recon.validation.warnings.find((w) => w.severity === "warning");
  if (warn) return isHe ? warn.messageHe : warn.messageEn;
  if (recon.blended.roas != null && recon.blended.roas < 2) {
    return isHe
      ? `ROAS המשוקלל נמוך מ־2x (${recon.blended.roas.toFixed(2)}x). יש לבחון את הקמפיינים החזקים והחלשים בפירוט.`
      : `Blended ROAS is below 2x (${recon.blended.roas.toFixed(2)}x). Drill into top + worst campaigns.`;
  }
  return isHe ? "אין סיכונים מהותיים שעלו מתהליך האימות." : "No material risks raised during validation.";
}

function pickMainAction(
  metaInsights: Map<string, BrandInsights>,
  brands: MetaAdsReportBrand[]
): string | null {
  // Use the first action of the highest-spend brand's insight set.
  const top = [...brands].sort((a, b) => b.kpis.spend - a.kpis.spend)[0];
  if (!top) return null;
  const ins = metaInsights.get(top.name);
  return ins?.actions[0] ?? null;
}

interface ExecPageProps {
  recon: ReconciliationReport;
  report: NonNullable<Awaited<ReturnType<typeof buildMetaAdsWeeklyReport>>>;
  influencer: Awaited<ReturnType<typeof buildMarketingPlannerInfluencerIntelligence>> | null;
  widePosts: Array<{ username: string; captionPreview: string; likes: number; comments: number; postedAt: string }>;
  metaInsights: Map<string, BrandInsights>;
  isHe: boolean;
}

function ExecutiveSummaryPage(props: ExecPageProps) {
  const { recon, report, influencer, widePosts, metaInsights, isHe } = props;
  const lang = (he: string, en: string) => (isHe ? he : en);
  const blendedRoas = recon.blended.roas;
  const cpa = recon.blended.cpa;
  const aov = recon.shopify.aov;
  const bestCampaign = pickBestCampaign(report.brands);
  const bestAds = pickBestAds(report.brands); // returns { byPurchases, byRoas }
  const bestInfluencer = pickBestInfluencer(influencer, widePosts);
  const mainRisk = pickMainRisk(recon, isHe);
  const mainAction = pickMainAction(metaInsights, report.brands);
  const conf = confidenceFromSpend(recon.meta.spend, recon.shopify.orders);

  // Hebrew narrative summary — concrete, references the real numbers.
  const summarySentence = lang(
    `השבוע הושקעו ₪${Math.round(recon.meta.spend).toLocaleString("he-IL")} ב־Meta והניבו ₪${Math.round(recon.shopify.netRevenue).toLocaleString("he-IL")} הכנסות Shopify ו־${recon.shopify.orders} הזמנות. ROAS משוקלל ${blendedRoas != null ? blendedRoas.toFixed(2) + "x" : "n/a"}. ${bestCampaign ? `הקמפיין החזק היה "${bestCampaign.name}".` : ""}${mainAction ? " פעולה מומלצת: " + mainAction : ""}`,
    `This week we spent ₪${Math.round(recon.meta.spend).toLocaleString()} on Meta and generated ₪${Math.round(recon.shopify.netRevenue).toLocaleString()} in Shopify revenue across ${recon.shopify.orders} orders. Blended ROAS ${blendedRoas != null ? blendedRoas.toFixed(2) + "x" : "n/a"}. ${bestCampaign ? `Top campaign: "${bestCampaign.name}".` : ""}${mainAction ? " Recommended: " + mainAction : ""}`
  );

  return (
    <section className="pwr-exec-page">
      <p className="pwr-exec-page-tag">{lang("עמוד 1", "PAGE 1")}</p>
      <h2 className="pwr-exec-page-title">{lang("השורה התחתונה", "Executive summary")}</h2>
      <p className="pwr-exec-page-sub">{lang("התמונה הכוללת של השבוע — Shopify כמקור אמת להכנסות, Meta כמקור אמת להוצאות.", "The big picture — Shopify as source of truth for revenue, Meta for spend.")}</p>

      <div className="pwr-bottom-line">
        <div className="pwr-kpi">
          <p className="pwr-kpi-label">{lang("הוצאה Meta", "Meta spend")}<SourceTag source="M" /></p>
          <p className="pwr-kpi-value">₪{Math.round(recon.meta.spend).toLocaleString("en-US")}</p>
        </div>
        <div className="pwr-kpi">
          <p className="pwr-kpi-label">{lang("הכנסות Shopify", "Shopify revenue")}<SourceTag source="S" /></p>
          <p className="pwr-kpi-value">₪{Math.round(recon.shopify.netRevenue).toLocaleString("en-US")}</p>
        </div>
        <div className="pwr-kpi">
          <p className="pwr-kpi-label">{lang("ROAS משוקלל", "Blended ROAS")}<SourceTag source="Blended" /></p>
          <p className="pwr-kpi-value">{blendedRoas != null ? `${blendedRoas.toFixed(2)}x` : "—"}</p>
        </div>
        <div className="pwr-kpi">
          <p className="pwr-kpi-label">{lang("הזמנות", "Orders")}<SourceTag source="S" /></p>
          <p className="pwr-kpi-value">{recon.shopify.orders}</p>
        </div>
      </div>
      <div className="pwr-bottom-line" style={{ marginTop: 6 }}>
        <div className="pwr-kpi">
          <p className="pwr-kpi-label">{lang("CPA משוקלל", "Blended CPA")}<SourceTag source="Calc" /></p>
          <p className="pwr-kpi-value">{cpa != null ? `₪${cpa.toFixed(2)}` : "—"}</p>
        </div>
        <div className="pwr-kpi">
          <p className="pwr-kpi-label">{lang("AOV", "AOV")}<SourceTag source="Calc" /></p>
          <p className="pwr-kpi-value">{aov > 0 ? `₪${aov.toFixed(0)}` : "—"}</p>
        </div>
        <div className="pwr-kpi">
          <p className="pwr-kpi-label">{lang("לקוחות חדשים", "New customers")}<SourceTag source="S" /></p>
          <p className="pwr-kpi-value">{recon.shopify.newCustomers}</p>
        </div>
        <div className="pwr-kpi">
          <p className="pwr-kpi-label">{lang("לקוחות חוזרים", "Returning")}<SourceTag source="S" /></p>
          <p className="pwr-kpi-value">{recon.shopify.returningCustomers}</p>
        </div>
      </div>
      {(() => {
        const identified = recon.shopify.newCustomers + recon.shopify.returningCustomers;
        const orders = recon.shopify.orders;
        const guests = recon.shopify.guestOrders;
        // Reconcile customers ↔ orders: identified + guest + repeat = orders.
        // We surface this explicitly so the founder doesn't have to wonder
        // why 89+61=150 doesn't equal the 155-order top number.
        const repeatOrders = Math.max(0, orders - identified - guests);
        if (orders === 0 || (guests === 0 && repeatOrders === 0)) return null;
        const parts: string[] = [];
        parts.push(
          lang(`${identified} לקוחות מזוהים`, `${identified} identified customers`)
        );
        if (guests > 0) parts.push(lang(`${guests} הזמנות אורח`, `${guests} guest orders`));
        if (repeatOrders > 0)
          parts.push(
            lang(
              `${repeatOrders} הזמנות חוזרות (אותו לקוח, יותר מפעם אחת)`,
              `${repeatOrders} repeat orders (same customer, multiple purchases)`
            )
          );
        parts.push(lang(`סה״כ ${orders} הזמנות`, `= ${orders} total orders`));
        return (
          <p style={{ margin: "4px 4px 0", fontSize: 10, color: "#64748b", textAlign: isHe ? "right" : "left" }}>
            {parts.join(" · ")}
          </p>
        );
      })()}

      <div className="pwr-highlight-grid">
        <div className="pwr-highlight">
          <p className="pwr-highlight-label">{lang("קמפיין מוביל", "Top campaign")}<SourceTag source="M" /></p>
          <p className="pwr-highlight-value">{bestCampaign?.name ?? "—"}</p>
          {bestCampaign ? (
            <p className="pwr-highlight-detail">
              ₪{Math.round(bestCampaign.spend).toLocaleString("en-US")} · {bestCampaign.purchases} {lang("רכישות", "purchases")} · ROAS {bestCampaign.roas != null ? bestCampaign.roas.toFixed(2) + "x" : "—"}
            </p>
          ) : null}
        </div>
        <div className="pwr-highlight">
          <p className="pwr-highlight-label">{lang("מודעות מובילות", "Top creatives")}<SourceTag source="M" /></p>
          {bestAds.byPurchases ? (
            <>
              <p className="pwr-highlight-value" style={{ fontSize: 12 }}>
                {lang("ברכישות", "By purchases")}: {bestAds.byPurchases.name}
              </p>
              <p className="pwr-highlight-detail">
                {bestAds.byPurchases.purchases} {lang("רכישות", "purchases")} · ROAS {bestAds.byPurchases.roas != null ? bestAds.byPurchases.roas.toFixed(2) + "x" : "—"} · ₪{Math.round(bestAds.byPurchases.spend).toLocaleString("en-US")}
              </p>
            </>
          ) : null}
          {bestAds.byRoas ? (
            <>
              <p className="pwr-highlight-value" style={{ fontSize: 12, marginTop: bestAds.byPurchases ? 6 : 0 }}>
                {lang("ב־ROAS", "By ROAS")}: {bestAds.byRoas.name}
              </p>
              <p className="pwr-highlight-detail">
                ROAS {bestAds.byRoas.roas!.toFixed(2)}x · {bestAds.byRoas.purchases} {lang("רכישות", "purchases")} · ₪{Math.round(bestAds.byRoas.spend).toLocaleString("en-US")}
              </p>
            </>
          ) : null}
          {!bestAds.byPurchases && !bestAds.byRoas ? (
            <p className="pwr-highlight-value">—</p>
          ) : null}
        </div>
        <div className="pwr-highlight">
          <p className="pwr-highlight-label">
            {bestInfluencer?.mode === "engagement"
              ? lang("משפיענית מובילה (מעורבות)", "Top influencer (engagement)")
              : lang("משפיענית מובילה (מכירות)", "Top influencer (sales)")}
            <SourceTag source={bestInfluencer?.mode === "engagement" ? "Calc" : "S"} />
          </p>
          <p className="pwr-highlight-value">{bestInfluencer?.name ?? lang("אין נתונים", "no data")}</p>
          {bestInfluencer ? (
            <>
              <p className="pwr-highlight-detail">{bestInfluencer.primaryLine}</p>
              {bestInfluencer.secondaryLine ? (
                <p className="pwr-highlight-detail" style={{ marginTop: 1, fontSize: 10, fontStyle: "italic" }}>
                  {bestInfluencer.mode === "engagement"
                    ? lang("מבוסס מעורבות, ללא שיוך מכירות", bestInfluencer.secondaryLine)
                    : bestInfluencer.secondaryLine}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="pwr-highlight">
          <p className="pwr-highlight-label">{lang("סיכון מרכזי", "Main risk")}</p>
          <p className="pwr-highlight-detail" style={{ marginTop: 0 }}>{mainRisk}</p>
        </div>
      </div>

      <div className="pwr-exec-summary">
        <p>
          <ConfBadge level={conf} isHe={isHe} />{" "}
          {summarySentence}
        </p>
      </div>
    </section>
  );
}

function ExecutiveGrowthInsightsPage(props: ExecPageProps & { igInsights: InstagramInsights | null }) {
  const { report, metaInsights, igInsights, isHe } = props;
  const lang = (he: string, en: string) => (isHe ? he : en);
  const topBrand = [...report.brands].sort((a, b) => b.kpis.spend - a.kpis.spend)[0];
  const metaIns = topBrand ? metaInsights.get(topBrand.name) ?? null : null;

  // Worst campaign = real spend but weakest ROAS — that's the next-action target.
  let worstCampaign: { name: string; spend: number; roas: number | null } | null = null;
  for (const b of report.brands) {
    for (const c of b.campaigns) {
      if (c.spend < 200) continue;
      if (!worstCampaign || (c.purchaseRoas ?? 99) < (worstCampaign.roas ?? 99)) {
        worstCampaign = { name: c.campaignName, spend: c.spend, roas: c.purchaseRoas };
      }
    }
  }

  return (
    <section className="pwr-exec-page">
      <p className="pwr-exec-page-tag">{lang("עמוד 2", "PAGE 2")}</p>
      <h2 className="pwr-exec-page-title">{lang("דוח מנהלים — שורה תחתונה והמלצות תקציב", "Executive growth insights")}</h2>
      <p className="pwr-exec-page-sub">{lang("ארבעת הסעיפים שמנהל ימלא בהם תוך 60 שניות.", "The four sections a founder reads in 60 seconds.")}</p>

      <div className="pwr-block-title">{lang("מה עבד הכי טוב השבוע", "What worked best")}</div>
      <div className="pwr-insights">
        {metaIns ? (
          <>
            <p className="pwr-insights-hook">{metaIns.hookLine}</p>
            {metaIns.observations.length > 0 ? (
              <>
                <p className="pwr-insights-label">{lang("מה קרה", "What happened")}</p>
                <ul className="pwr-insights-list">
                  {metaIns.observations.slice(0, 3).map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>{lang("אין תובנות זמינות.", "No insights available.")}</p>
        )}
      </div>

      <div className="pwr-block-title">{lang("מה דורש שיפור", "What needs work")}</div>
      <div className="pwr-insights">
        {worstCampaign ? (
          <p className="pwr-insights-hook">
            {lang(
              `הקמפיין "${worstCampaign.name}" צרך ₪${Math.round(worstCampaign.spend).toLocaleString("he-IL")} עם ROAS ${worstCampaign.roas != null ? worstCampaign.roas.toFixed(2) + "x" : "—"} — דורש בחינה.`,
              `Campaign "${worstCampaign.name}" spent ₪${Math.round(worstCampaign.spend).toLocaleString()} at ROAS ${worstCampaign.roas != null ? worstCampaign.roas.toFixed(2) + "x" : "—"} — needs review.`
            )}
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
            {lang("לא זוהה קמפיין עם ביצועים חלשים מובהקים.", "No campaign stood out as clearly weak.")}
          </p>
        )}
        {igInsights && igInsights.observations.length > 0 ? (
          <>
            <p className="pwr-insights-label">{lang("מצד המשפיענים", "On the influencer side")}</p>
            <ul className="pwr-insights-list">
              {igInsights.observations.slice(0, 2).map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          </>
        ) : null}
      </div>

      <div className="pwr-block-title">{lang("מה עושים בשבוע הבא", "What to do next week")}</div>
      <div className="pwr-insights">
        {metaIns && metaIns.actions.length > 0 ? (
          <ul className="pwr-insights-list">
            {metaIns.actions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        ) : null}
        {igInsights && igInsights.actions.length > 0 ? (
          <>
            <p className="pwr-insights-label">{lang("Instagram", "Instagram")}</p>
            <ul className="pwr-insights-list">
              {igInsights.actions.slice(0, 2).map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </section>
  );
}

function DataReconciliationPage({ recon, isHe }: { recon: ReconciliationReport; isHe: boolean }) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  const fmt = (v: number) => `₪${Math.round(v).toLocaleString("en-US")}`;

  return (
    <section className="pwr-exec-page">
      <p className="pwr-exec-page-tag">{lang("עמוד 3", "PAGE 3")}</p>
      <h2 className="pwr-exec-page-title">{lang("השוואת מקורות נתונים", "Data reconciliation")}</h2>
      <p className="pwr-exec-page-sub">
        {lang(
          "השוואה בין Meta ל־Shopify לתקופה — אם המספרים סוטים זה מזה, הפער מוצג כאזהרה ולא מוסתר.",
          "Side-by-side Meta vs Shopify for the period. Gaps are surfaced as warnings, never hidden."
        )}
      </p>

      <div style={{ marginBottom: 12 }}>
        {recon.validation.warnings.length === 0 ? (
          <div className="pwr-recon-warning pwr-recon-warning-info">
            {lang("כל בדיקות התקינות עברו בהצלחה.", "All validation checks passed.")}
          </div>
        ) : (
          recon.validation.warnings.map((w, i) => (
            <div key={i} className={`pwr-recon-warning pwr-recon-warning-${w.severity}`}>
              {isHe ? w.messageHe : w.messageEn}
            </div>
          ))
        )}
      </div>

      <table className="pwr-table">
        <thead>
          <tr>
            <th>{lang("מקור", "Source")}</th>
            <th>{lang("הוצאה", "Spend")}</th>
            <th>{lang("הכנסות", "Revenue")}</th>
            <th>{lang("רכישות / הזמנות", "Purchases / Orders")}</th>
            <th>ROAS</th>
            <th>{lang("הערות", "Notes")}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <SourceTag source="M" /> Meta Ads
            </td>
            <td>{fmt(recon.meta.spend)}</td>
            <td>{lang("לא זמין", "n/a")}</td>
            <td>{recon.meta.attributedPurchases}</td>
            <td>{lang("Meta-attributed", "Meta-attributed")}</td>
            <td>{recon.meta.daysWithData}/{recon.meta.expectedDays} {lang("ימים מסונכרנים", "days synced")}</td>
          </tr>
          <tr>
            <td>
              <SourceTag source="S" /> Shopify
            </td>
            <td>—</td>
            <td>{fmt(recon.shopify.netRevenue)}</td>
            <td>{recon.shopify.orders}</td>
            <td>—</td>
            <td>
              {(() => {
                const identified = recon.shopify.newCustomers + recon.shopify.returningCustomers;
                const repeats = Math.max(0, recon.shopify.orders - identified - recon.shopify.guestOrders);
                const segments: string[] = [];
                segments.push(
                  lang(
                    `${recon.shopify.newCustomers} חדשים · ${recon.shopify.returningCustomers} חוזרים`,
                    `${recon.shopify.newCustomers} new · ${recon.shopify.returningCustomers} returning`
                  )
                );
                if (recon.shopify.guestOrders > 0)
                  segments.push(lang(`${recon.shopify.guestOrders} אורחים`, `${recon.shopify.guestOrders} guest`));
                if (repeats > 0)
                  segments.push(lang(`${repeats} הזמנות חוזרות`, `${repeats} repeat orders`));
                return segments.join(" · ");
              })()}
            </td>
          </tr>
          <tr>
            <td>
              <SourceTag source="Blended" /> {lang("משוקלל", "Blended")}
            </td>
            <td>{fmt(recon.meta.spend)}</td>
            <td>{fmt(recon.shopify.netRevenue)}</td>
            <td>
              {recon.validation.purchaseDelta.diff > 0
                ? lang(
                    `פער ${recon.validation.purchaseDelta.diff} לטובת Meta`,
                    `+${recon.validation.purchaseDelta.diff} Meta`
                  )
                : recon.validation.purchaseDelta.diff < 0
                  ? lang(
                      `פער ${Math.abs(recon.validation.purchaseDelta.diff)} לטובת Shopify`,
                      `+${Math.abs(recon.validation.purchaseDelta.diff)} Shopify`
                    )
                  : lang("תואם", "match")}
            </td>
            <td>{recon.blended.roas != null ? `${recon.blended.roas.toFixed(2)}x` : "—"}</td>
            <td>{recon.blended.label}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function ChannelPerformancePage({ channels, isHe }: { channels: ChannelPerformanceReport; isHe: boolean }) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  const fmt = (v: number) => `₪${Math.round(v).toLocaleString("en-US")}`;
  const qualityLabel = (q: "high" | "medium" | "low") =>
    q === "high"
      ? lang("גבוהה", "high")
      : q === "medium"
        ? lang("בינונית", "medium")
        : lang("נמוכה", "low");
  const channelDisplay = (c: string) => {
    if (!isHe) return c;
    switch (c) {
      case "Meta Ads":
        return "Meta Ads";
      case "Instagram (organic)":
        return "Instagram אורגני";
      case "Email":
        return "אימייל";
      case "Influencers":
        return "משפיענים";
      case "Google (organic)":
        return "Google אורגני";
      case "Direct":
        return "ישיר";
      case "Other / Unknown":
        return "אחר / לא ידוע";
      default:
        return c;
    }
  };

  const coverage = Math.round(channels.attributionCoverage * 100);
  const top = channels.rows[0];

  // Quick written conclusion — names winners explicitly.
  const winnerByRevenue = [...channels.rows].sort((a, b) => b.revenue - a.revenue)[0];
  const winnerByOrders = [...channels.rows].sort((a, b) => b.orders - a.orders)[0];

  return (
    <section className="pwr-exec-page">
      <p className="pwr-exec-page-tag">{lang("עמוד 5", "PAGE 5")}</p>
      <h2 className="pwr-exec-page-title">{lang("ביצועי ערוצים", "Channel performance")}</h2>
      <p className="pwr-exec-page-sub">
        {lang(
          "מי הביא תנועה, לקוחות והזמנות השבוע. הנתונים מבוססים על Shopify בלבד (UTM + referrer + קופונים).",
          "Who drove traffic, customers, and orders this week. Shopify-only data (UTM + referrer + coupons)."
        )}
      </p>

      {coverage < 50 ? (
        <div className="pwr-recon-warning pwr-recon-warning-warning">
          {lang(
            `כיסוי שיוך נמוך — רק ${coverage}% מההזמנות נושאות UTM/Referrer ניתן לזהוי. שאר ${channels.unknownOrders} ההזמנות נכנסו לקטגוריית "אחר".`,
            `Attribution coverage is only ${coverage}% — the other ${channels.unknownOrders} orders fell into "Other".`
          )}
        </div>
      ) : null}

      <table className="pwr-table">
        <thead>
          <tr>
            <th>{lang("ערוץ", "Channel")}</th>
            <th>{lang("הזמנות", "Orders")}</th>
            <th>{lang("הכנסות", "Revenue")}</th>
            <th>AOV</th>
            <th>{lang("חדשים", "New")}</th>
            <th>{lang("חוזרים", "Returning")}</th>
            <th>{lang("איכות נתונים", "Data quality")}</th>
          </tr>
        </thead>
        <tbody>
          {channels.rows.map((r) => (
            <tr key={r.channel}>
              <td>{channelDisplay(r.displayName)}</td>
              <td>{r.orders}</td>
              <td>{fmt(r.revenue)}</td>
              <td>{r.avgOrderValue > 0 ? `₪${r.avgOrderValue.toFixed(0)}` : "—"}</td>
              <td>{r.newCustomers}</td>
              <td>{r.returningCustomers}</td>
              <td>
                <span className={`pwr-conf pwr-conf-${r.dataQuality}`}>{qualityLabel(r.dataQuality)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {winnerByRevenue && winnerByOrders ? (
        <div className="pwr-exec-summary" style={{ marginTop: 12 }}>
          <p>
            {lang(
              `${channelDisplay(winnerByRevenue.displayName)} הוביל בהכנסות (${fmt(winnerByRevenue.revenue)}). ${channelDisplay(winnerByOrders.displayName)} הוביל בנפח הזמנות (${winnerByOrders.orders} הזמנות). כיסוי שיוך כולל: ${coverage}%.`,
              `${channelDisplay(winnerByRevenue.displayName)} led on revenue (${fmt(winnerByRevenue.revenue)}). ${channelDisplay(winnerByOrders.displayName)} led on order volume (${winnerByOrders.orders} orders). Attribution coverage: ${coverage}%.`
            )}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function CampaignPerformancePage({
  attribution,
  report,
  isHe
}: {
  attribution: CampaignShopifyAttributionReport;
  report: NonNullable<Awaited<ReturnType<typeof buildMetaAdsWeeklyReport>>>;
  isHe: boolean;
}) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  const fmt = (v: number) => `₪${Math.round(v).toLocaleString("en-US")}`;

  // For each campaign in the attribution report, look up Meta-side metrics
  // from the main report's brand.campaigns so we can show spend / CTR / CPC
  // alongside the Shopify attribution numbers.
  const metaByCampaign = new Map<string, { spend: number; clicks: number; ctr: number; cpc: number; purchaseRoas: number | null }>();
  for (const brand of report.brands) {
    for (const c of brand.campaigns) {
      metaByCampaign.set(c.campaignId, {
        spend: c.spend,
        clicks: c.clicks,
        ctr: c.ctr,
        cpc: c.cpc,
        purchaseRoas: c.purchaseRoas
      });
    }
  }

  // Generate one recommendation per campaign.
  const recs = new Map<string, Recommendation>();
  for (const c of attribution.campaigns) {
    const meta = metaByCampaign.get(c.campaignId);
    if (!meta) continue;
    // Trust Shopify when we have decent match coverage AND Shopify orders exist
    // for this campaign. Otherwise fall back to Meta.
    const shopifyTrustworthy = c.shopifyOrders > 0 && c.matchConfidence !== "low";
    const shopifyRoas = meta.spend > 0 && c.shopifyOrders > 0 ? c.shopifyRevenue / meta.spend : null;
    const primaryRoas = shopifyTrustworthy ? shopifyRoas : meta.purchaseRoas;
    const primarySource: "shopify" | "meta" = shopifyTrustworthy ? "shopify" : "meta";
    const primarySalesCount = shopifyTrustworthy ? c.shopifyOrders : c.metaAttributedPurchases;
    recs.set(
      c.campaignId,
      buildRecommendation({
        campaignName: c.campaignName,
        spend: meta.spend,
        clicks: meta.clicks,
        ctr: meta.ctr,
        primaryRoas,
        primaryRoasSource: primarySource,
        primarySalesCount,
        metaAttributedPurchases: c.metaAttributedPurchases,
        shopifyOrders: c.shopifyOrders,
        weekOverWeekSpendChangePct: null,
        weekOverWeekPurchasesChangePct: null,
        currentDailyBudget: null, // Meta doesn't expose this on insight rows; show as "—"
        targets: DEFAULT_TARGETS
      })
    );
  }

  const lowCoverage = attribution.shopifyMatchCoverage < 0.3;

  return (
    <section className="pwr-exec-page">
      <p className="pwr-exec-page-tag">{lang("עמוד 6", "PAGE 6")}</p>
      <h2 className="pwr-exec-page-title">{lang("ביצועי קמפיינים — Meta מול Shopify", "Campaign performance — Meta vs Shopify")}</h2>
      <p className="pwr-exec-page-sub">
        {lang(
          "Meta הוא מקור האמת להוצאה; Shopify הוא מקור האמת להכנסות. ההמלצה נשענת על Shopify כשאפשר.",
          "Meta is source of truth for spend; Shopify for revenue. Recommendations lean on Shopify when match coverage allows."
        )}
      </p>

      {lowCoverage ? (
        <div className="pwr-recon-warning pwr-recon-warning-warning">
          {lang(
            `כיסוי שיוך נמוך (${Math.round(attribution.shopifyMatchCoverage * 100)}% מההזמנות התאימו לקמפיין Meta) — ההמלצות עשויות להישען על נתוני Meta בלבד. שפרו תיוג UTM למודעות לדיוק טוב יותר.`,
            `Low match coverage (${Math.round(attribution.shopifyMatchCoverage * 100)}% of orders tied to a Meta campaign) — recommendations may rely on Meta numbers. Improve UTM tagging for better accuracy.`
          )}
        </div>
      ) : null}

      <table className="pwr-table">
        <thead>
          <tr>
            <th>{lang("קמפיין", "Campaign")}</th>
            <th>{lang("הוצאה", "Spend")}<SourceTag source="M" /></th>
            <th>{lang("רכישות (Meta)", "Purchases (Meta)")}<SourceTag source="M" /></th>
            <th>{lang("הזמנות (Shopify)", "Orders (Shopify)")}<SourceTag source="S" /></th>
            <th>{lang("הכנסות (Shopify)", "Revenue (Shopify)")}<SourceTag source="S" /></th>
            <th>ROAS<SourceTag source="Blended" /></th>
            <th>{lang("המלצה", "Recommendation")}</th>
          </tr>
        </thead>
        <tbody>
          {attribution.campaigns.map((c) => {
            const meta = metaByCampaign.get(c.campaignId);
            const rec = recs.get(c.campaignId);
            const shopifyRoas = meta && meta.spend > 0 && c.shopifyOrders > 0 ? c.shopifyRevenue / meta.spend : null;
            return (
              <tr key={c.campaignId}>
                <td style={{ maxWidth: 180, wordBreak: "break-word" }}>{c.campaignName}</td>
                <td>{meta ? fmt(meta.spend) : "—"}</td>
                <td>{c.metaAttributedPurchases}</td>
                <td>{c.shopifyOrders}</td>
                <td>{fmt(c.shopifyRevenue)}</td>
                <td>{shopifyRoas != null ? `${shopifyRoas.toFixed(2)}x` : "—"}</td>
                <td style={{ maxWidth: 200 }}>
                  {rec ? (
                    <>
                      <div style={{ fontWeight: 700, marginBottom: 2 }}>
                        {isHe ? rec.actionLabelHe : rec.actionLabelEn}
                        {" "}
                        <span className={`pwr-conf pwr-conf-${rec.confidence}`}>
                          {rec.confidence === "high" ? lang("גבוה", "high") : rec.confidence === "medium" ? lang("בינוני", "med") : lang("נמוך", "low")}
                        </span>
                      </div>
                      <div style={{ fontSize: 10, lineHeight: 1.4, color: "#475569" }}>
                        {isHe ? rec.reasonHe : rec.reasonEn}
                      </div>
                    </>
                  ) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function ClosedLoopPage({
  items,
  isHe
}: {
  items: ResolvedAlertWithOutcome[];
  isHe: boolean;
}) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  const wins = items.filter((i) => i.outcome.verdict === "win").length;
  const misses = items.filter((i) => i.outcome.verdict === "miss").length;
  const neutral = items.filter((i) => i.outcome.verdict === "neutral").length;

  // Group by type so the page reads "restock actions" / "campaign actions" /
  // "stockout actions" — easier to skim on a CEO report.
  const TYPE_LABEL_HE: Record<string, string> = {
    restock_hero: "מוצרים שחזרו למלאי",
    stockout_imminent: "אזהרות אזילה",
    roas_collapse: "קמפיינים בעייתיים"
  };
  const TYPE_LABEL_EN: Record<string, string> = {
    restock_hero: "Restock heroes",
    stockout_imminent: "Stockout warnings",
    roas_collapse: "Problem campaigns"
  };
  const grouped = new Map<string, ResolvedAlertWithOutcome[]>();
  for (const item of items) {
    const list = grouped.get(item.type) ?? [];
    list.push(item);
    grouped.set(item.type, list);
  }

  return (
    <section className="pwr-exec-page">
      <p className="pwr-exec-page-tag" style={{ color: "#475569" }}>
        {lang("הלולאה נסגרת", "CLOSED LOOP")}
      </p>
      <h2 className="pwr-exec-page-title">
        {lang("מה קרה אחרי הפעולה שלך", "What happened after you acted")}
      </h2>
      <p className="pwr-exec-page-sub">
        {lang(
          `מעקב על ההמלצות מהשבועות האחרונים. ${wins} עבדו · ${misses} לא · ${neutral} ניטרליות — הכישלונות הם הלמידה היקרה ביותר.`,
          `Tracking recommendations from the last 2 weeks. ${wins} worked · ${misses} didn't · ${neutral} neutral — failures are the most valuable learning.`
        )}
      </p>

      {Array.from(grouped.entries()).map(([type, list]) => (
        <div key={type} style={{ marginBottom: 16 }}>
          <h3
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "#64748b",
              margin: "0 0 6px 0"
            }}
          >
            {isHe ? TYPE_LABEL_HE[type] ?? type : TYPE_LABEL_EN[type] ?? type}
          </h3>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {list.map((item, idx) => {
              const v = item.outcome.verdict;
              const marker = v === "win" ? "✅" : v === "miss" ? "❌" : "➖";
              const color = v === "win" ? "#047857" : v === "miss" ? "#b91c1c" : "#64748b";
              const tone =
                v === "win"
                  ? "#ecfdf5"
                  : v === "miss"
                    ? "#fef2f2"
                    : "#f8fafc";
              const border =
                v === "win"
                  ? "#a7f3d0"
                  : v === "miss"
                    ? "#fecaca"
                    : "#e2e8f0";
              return (
                <li
                  key={item.id}
                  style={{
                    background: tone,
                    border: `1px solid ${border}`,
                    borderRadius: 4,
                    padding: "8px 10px",
                    marginTop: idx === 0 ? 0 : 4,
                    fontSize: 11.5,
                    lineHeight: 1.55,
                    display: "flex",
                    gap: 8
                  }}
                >
                  <span style={{ color, fontWeight: 700, flexShrink: 0 }}>{marker}</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, color: "#0f172a" }}>
                      {isHe ? item.outcome.summary.he : item.outcome.summary.en}
                    </p>
                    <p
                      style={{
                        margin: "2px 0 0",
                        fontSize: 9,
                        color: "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em"
                      }}
                    >
                      {lang("נסגר", "Closed")}:{" "}
                      {new Date(item.resolvedAt).toLocaleDateString(isHe ? "he-IL" : "en-US", {
                        month: "short",
                        day: "numeric"
                      })}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

function RestockHeroBanner({
  alerts,
  isHe
}: {
  alerts: RestockHeroAlertReport;
  isHe: boolean;
}) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  const fmt = (n: number) => `₪${Math.round(n).toLocaleString("en-US")}`;
  const flags = alerts.flags.slice(0, 3); // banner stays compact — full detail on the dedicated page
  return (
    <div className="pwr-flag-banner">
      <p className="pwr-flag-banner-title">
        {lang(
          `🚩 ${alerts.flags.length} מוצר${alerts.flags.length === 1 ? "" : "ים"} שחזר${alerts.flags.length === 1 ? "" : "ו"} למלאי — דורש פעולה השבוע`,
          `🚩 ${alerts.flags.length} hero${alerts.flags.length === 1 ? "" : "es"} restocked — needs action this week`
        )}
      </p>
      <ul className="pwr-flag-banner-list">
        {flags.map((f) => (
          <li key={f.productId} className="pwr-flag-banner-item">
            <strong>{f.title}</strong>
            {f.sku ? ` (${f.sku})` : ""} ·{" "}
            {lang(
              `הכנסה ב-90 ימים שלפני: ${fmt(f.priorRevenue)}`,
              `90-day prior revenue: ${fmt(f.priorRevenue)}`
            )}{" "}
            ·{" "}
            {lang(
              `יצא ${f.gapDays} ימים מהמלאי`,
              `${f.gapDays}-day OOS gap`
            )}
            {f.currentInventory != null ? (
              <>
                {" · "}
                {lang(
                  `${f.currentInventory} יח׳ במלאי`,
                  `${f.currentInventory} units in stock`
                )}
              </>
            ) : null}
          </li>
        ))}
        {alerts.flags.length > flags.length ? (
          <li className="pwr-flag-banner-item" style={{ color: "#7f1d1d", fontStyle: "italic" }}>
            {lang(
              `+ עוד ${alerts.flags.length - flags.length} (פרוט בעמוד הבא)`,
              `+ ${alerts.flags.length - flags.length} more (see next page)`
            )}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function RestockHeroActionPage({
  alerts,
  isHe
}: {
  alerts: RestockHeroAlertReport;
  isHe: boolean;
}) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  const fmt = (n: number) => `₪${Math.round(n).toLocaleString("en-US")}`;
  return (
    <section className="pwr-exec-page">
      <p className="pwr-exec-page-tag" style={{ color: "#dc2626" }}>
        {lang("התראה", "ALERT")}
      </p>
      <h2 className="pwr-exec-page-title">
        {lang("מוצרים שחזרו למלאי — תדחפי השבוע", "Hot restocks — push these now")}
      </h2>
      <p className="pwr-exec-page-sub">
        {lang(
          "מוצרים שהיו בין המובילים בהכנסות ב-90 הימים האחרונים, יצאו מהמלאי, וחזרו עכשיו. הגיע הזמן להגביר תקציב Meta ולנצל את הביקוש שהצטבר.",
          "Products that were top-revenue performers in the last 90 days, went out of stock, and just came back. Time to scale Meta budget and capture the backlogged demand."
        )}
      </p>

      {alerts.flags.map((f) => (
        <div key={f.productId} className="pwr-flag-card">
          <div className="pwr-flag-card-header">
            <h3 className="pwr-flag-card-title">{f.title}</h3>
            <span className="pwr-flag-card-rank">
              {lang(`דירוג #${f.priorRank}`, `Rank #${f.priorRank}`)}
            </span>
          </div>

          <div className="pwr-flag-card-stats">
            <div className="pwr-flag-card-stat">
              <p className="pwr-flag-card-stat-label">
                {lang("הכנסה בעבר", "Prior revenue")}
              </p>
              <p className="pwr-flag-card-stat-value">{fmt(f.priorRevenue)}</p>
            </div>
            <div className="pwr-flag-card-stat">
              <p className="pwr-flag-card-stat-label">
                {lang("ימי OOS", "OOS days")}
              </p>
              <p className="pwr-flag-card-stat-value">{f.gapDays}</p>
            </div>
            <div className="pwr-flag-card-stat">
              <p className="pwr-flag-card-stat-label">
                {lang("מלאי עכשיו", "In stock now")}
              </p>
              <p className="pwr-flag-card-stat-value">
                {f.currentInventory != null ? f.currentInventory : "—"}
              </p>
            </div>
            <div className="pwr-flag-card-stat">
              <p className="pwr-flag-card-stat-label">
                {lang("מכירות השבוע", "Sales this week")}
              </p>
              <p className="pwr-flag-card-stat-value">
                {f.ordersThisWindow > 0
                  ? `${f.ordersThisWindow} · ${fmt(f.revenueThisWindow)}`
                  : "0"}
              </p>
            </div>
          </div>

          <div className="pwr-flag-card-action">
            <strong>{lang("פעולה מומלצת:", "Suggested action:")}</strong>{" "}
            {isHe ? f.suggestedAction.he : f.suggestedAction.en}
          </div>

          {f.sku ? (
            <p style={{ marginTop: 6, fontSize: 10, color: "#64748b" }}>
              {lang("מק״ט", "SKU")}: {f.sku} ·{" "}
              {lang(
                `יצא מהמלאי ${f.gapStart} → ${f.gapEnd}`,
                `OOS window ${f.gapStart} → ${f.gapEnd}`
              )}
            </p>
          ) : null}
        </div>
      ))}
    </section>
  );
}

function AffiliatePerformancePage({
  deepDive,
  isHe
}: {
  deepDive: AffiliateDeepDiveReport;
  isHe: boolean;
}) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  const fmt = (v: number) => `₪${Math.round(v).toLocaleString("en-US")}`;
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  // Top 10 in the table — anything beyond gets rolled into a footnote.
  const TOP_LIMIT = 10;
  const tableRows = deepDive.affiliates.slice(0, TOP_LIMIT);
  const tailCount = Math.max(0, deepDive.affiliates.length - TOP_LIMIT);
  const tailSales = deepDive.affiliates
    .slice(TOP_LIMIT)
    .reduce((sum, r) => sum + r.sales, 0);

  const sharePct =
    deepDive.totals.affiliateShareOfStoreRevenue != null
      ? Math.round(deepDive.totals.affiliateShareOfStoreRevenue * 100)
      : null;

  const topAff = deepDive.affiliates[0] ?? null;

  return (
    <section className="pwr-exec-page">
      <p className="pwr-exec-page-tag">{lang("עמוד 7", "PAGE 7")}</p>
      <h2 className="pwr-exec-page-title">
        {lang("ביצועי משווקים שותפים", "Affiliate performance")}
      </h2>
      <p className="pwr-exec-page-sub">
        {lang(
          "פירוט מלא לכל משווקת — מכירות, עמלות, סוג מעקב, וחלוקת לקוחות חדשים מול חוזרים.",
          "Detailed per-affiliate view — sales, commission, tracking method, and new vs returning customer mix."
        )}
      </p>

      <div className="pwr-kpi-row" style={{ marginBottom: 10 }}>
        <Tile label={lang("סה״כ מכירות", "Total sales")} value={fmt(deepDive.totals.sales)} source="S" />
        <Tile label={lang("הזמנות", "Orders")} value={String(deepDive.totals.orders)} source="S" />
        <Tile
          label={lang("עמלות ששולמו", "Commission paid")}
          value={fmt(deepDive.totals.commission)}
          source="S"
        />
        <Tile
          label={lang("נתח מסך החנות", "Share of store revenue")}
          value={sharePct != null ? `${sharePct}%` : "—"}
          source="Calc"
        />
      </div>

      <div className="pwr-kpi-row" style={{ marginBottom: 14 }}>
        <Tile
          label={lang("משווקות פעילות", "Active affiliates")}
          value={String(deepDive.totals.activeAffiliates)}
        />
        <Tile
          label={lang("משווקות שקטות", "Silent affiliates")}
          value={String(deepDive.totals.silentAffiliates)}
        />
        <Tile
          label={lang("הכנסה נטו לחנות", "Net revenue to store")}
          value={fmt(deepDive.totals.sales - deepDive.totals.commission)}
          source="Calc"
        />
        <Tile
          label={lang("AOV ממוצע", "Average AOV")}
          value={
            deepDive.totals.orders > 0
              ? `₪${Math.round(deepDive.totals.sales / deepDive.totals.orders)}`
              : "—"
          }
          source="Calc"
        />
      </div>

      <table className="pwr-table">
        <thead>
          <tr>
            <th>{lang("משווקת", "Affiliate")}</th>
            <th>{lang("הזמנות", "Orders")}</th>
            <th>{lang("מכירות", "Sales")}</th>
            <th>{lang("עמלה", "Commission")}</th>
            <th>AOV</th>
            <th>{lang("חדשים/חוזרים", "New / Returning")}</th>
            <th>{lang("קופון/לינק", "Coupon / Link")}</th>
            <th>{lang("מוצרים מובילים", "Top products")}</th>
          </tr>
        </thead>
        <tbody>
          {tableRows.map((r) => {
            const totalCust = r.newCustomers + r.returningCustomers;
            const newShare = totalCust > 0 ? r.newCustomers / totalCust : 0;
            const couponShare = r.orders > 0 ? r.couponOrders / r.orders : 0;
            return (
              <tr key={r.affiliateMemberId}>
                <td>
                  <div style={{ fontWeight: 600 }}>{r.affiliateName}</div>
                  <div style={{ fontSize: 10, color: "#64748b" }}>
                    {r.email}
                    {r.couponCode ? ` · ${r.couponCode}` : ""}
                  </div>
                </td>
                <td>{r.orders}</td>
                <td>{fmt(r.sales)}</td>
                <td>{fmt(r.commission)}</td>
                <td>{r.aov > 0 ? `₪${Math.round(r.aov)}` : "—"}</td>
                <td>
                  {totalCust > 0 ? (
                    <>
                      {r.newCustomers}/{r.returningCustomers}
                      <div style={{ fontSize: 10, color: "#64748b" }}>
                        {pct(newShare)} {lang("חדשים", "new")}
                      </div>
                    </>
                  ) : (
                    <span style={{ color: "#94a3b8" }}>—</span>
                  )}
                  {r.guestOrders > 0 ? (
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>
                      +{r.guestOrders} {lang("אורחים", "guest")}
                    </div>
                  ) : null}
                </td>
                <td>
                  {r.couponOrders}/{r.linkOrders}
                  {r.orders > 0 ? (
                    <div style={{ fontSize: 10, color: "#64748b" }}>
                      {pct(couponShare)} {lang("דרך קופון", "via coupon")}
                    </div>
                  ) : null}
                </td>
                <td>
                  {r.topProducts.length === 0 ? (
                    <span style={{ color: "#94a3b8" }}>—</span>
                  ) : (
                    <ol style={{ margin: 0, paddingInlineStart: 16, fontSize: 10 }}>
                      {r.topProducts.map((p) => (
                        <li key={p.title}>
                          {p.title} · {p.units}
                          {lang(" יח׳", " u")}
                        </li>
                      ))}
                    </ol>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {tailCount > 0 ? (
        <p style={{ marginTop: 8, fontSize: 11, color: "#64748b" }}>
          {lang(
            `+ עוד ${tailCount} משווקות נוספות בסך ${fmt(tailSales)}`,
            `+ ${tailCount} more affiliates totalling ${fmt(tailSales)}`
          )}
        </p>
      ) : null}

      {topAff ? (
        <div className="pwr-exec-summary" style={{ marginTop: 12 }}>
          <p>
            {lang(
              `${topAff.affiliateName} הובילה עם ${fmt(topAff.sales)} ב-${topAff.orders} הזמנות (עמלה ${fmt(topAff.commission)}). כלל המשווקות הביאו ${pct(deepDive.totals.affiliateShareOfStoreRevenue ?? 0)} מסך הכנסות החנות בחלון.`,
              `${topAff.affiliateName} led with ${fmt(topAff.sales)} across ${topAff.orders} orders (commission ${fmt(topAff.commission)}). All affiliates combined drove ${pct(deepDive.totals.affiliateShareOfStoreRevenue ?? 0)} of store revenue in the window.`
            )}
          </p>
          {deepDive.totals.silentAffiliates > 0 ? (
            <p style={{ marginTop: 6 }}>
              {lang(
                `${deepDive.totals.silentAffiliates} משווקות רשומות ללא מכירה בחלון — שווה לבדוק פנייה חוזרת.`,
                `${deepDive.totals.silentAffiliates} configured affiliates produced zero sales — worth a re-engagement nudge.`
              )}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Tile({ label, value, source }: { label: string; value: string; source?: "M" | "S" | "Calc" | "Blended" }) {
  return (
    <div className="pwr-kpi">
      <p className="pwr-kpi-label">
        {label}
        {source ? <SourceTag source={source} /> : null}
      </p>
      <p className="pwr-kpi-value">{value}</p>
    </div>
  );
}

function FunnelCell({ label, value, rate }: { label: string; value: string; rate?: string }) {
  return (
    <div className="pwr-funnel-cell">
      <p className="pwr-funnel-label">{label}</p>
      <p className="pwr-funnel-value">{value}</p>
      {rate ? <p className="pwr-funnel-rate">{rate}</p> : null}
    </div>
  );
}

function BrandBlock({
  brand,
  insights,
  t,
  locale
}: {
  brand: MetaAdsReportBrand;
  insights: BrandInsights | null;
  t: Record<string, string>;
  locale: "he" | "en";
}) {
  return (
    <section className="pwr-brand-block">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <h2 className="pwr-brand-name">{brand.name}</h2>
        <span className="pwr-brand-meta">
          {brand.campaigns.length} {t.campaignsWord} · {brand.ads.length} {t.adsWord}
        </span>
      </div>

      {insights ? (
        <div className="pwr-insights">
          <p className="pwr-insights-hook">{insights.hookLine}</p>
          {insights.observations.length > 0 ? (
            <>
              <p className="pwr-insights-label">{t.observationsLabel}</p>
              <ul className="pwr-insights-list">
                {insights.observations.map((o, i) => (
                  <li key={`obs-${i}`}>{o}</li>
                ))}
              </ul>
            </>
          ) : null}
          {insights.actions.length > 0 ? (
            <>
              <p className="pwr-insights-label">{t.actionsLabel}</p>
              <ul className="pwr-insights-list">
                {insights.actions.map((a, i) => (
                  <li key={`act-${i}`}>{a}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="pwr-kpi-row" style={{ marginTop: 14 }}>
        <Tile label={t.spend} value={formatCurrencyILS(brand.kpis.spend)} />
        <Tile label={t.cpc} value={brand.kpis.cpc > 0 ? `₪${brand.kpis.cpc.toFixed(2)}` : "—"} />
        <Tile label={t.cpm} value={brand.kpis.cpm > 0 ? `₪${brand.kpis.cpm.toFixed(2)}` : "—"} />
        <Tile label={t.ctr} value={brand.kpis.ctr > 0 ? formatPct(brand.kpis.ctr) : "—"} />
      </div>
      <div className="pwr-kpi-row" style={{ marginTop: 6 }}>
        <Tile label={t.clicks} value={formatNumberShort(brand.kpis.clicks)} />
        <Tile label={t.impressions} value={formatNumberShort(brand.kpis.impressions)} />
        <Tile label={t.purchases} value={formatNumberShort(brand.kpis.purchases)} source="M" />
        <Tile label={t.roas} value={brand.kpis.purchaseRoas != null ? `${formatRatio(brand.kpis.purchaseRoas)}x` : "—"} source="M" />
      </div>

      <FunnelBlock funnel={brand.funnel} t={t} />

      {brand.daily.length > 0 ? (
        <>
          <p className="pwr-block-title">{t.dailyTitle}</p>
          <table className="pwr-table">
            <thead>
              <tr>
                <th>{t.dailyDate}</th>
                <th>{t.spend}</th>
                <th>{t.clicks}</th>
                <th>{t.impressions}</th>
                <th>{t.purchases}</th>
                <th>{t.roas}</th>
              </tr>
            </thead>
            <tbody>
              {brand.daily.map((d: MetaAdsReportDailyRow) => (
                <tr key={d.date}>
                  <td>{formatDayShort(d.date, locale)}</td>
                  <td>{formatCurrencyILS(d.spend)}</td>
                  <td>{formatNumberShort(d.clicks)}</td>
                  <td>{formatNumberShort(d.impressions)}</td>
                  <td>{formatNumberShort(d.purchases)}</td>
                  <td>{d.purchaseRoas != null ? `${formatRatio(d.purchaseRoas)}x` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      <p className="pwr-block-title">{t.campaignsTitle}</p>
      <table className="pwr-table">
        <thead>
          <tr>
            <th>{t.campaignName}</th>
            <th>{t.spend}</th>
            <th>{t.clicks}</th>
            <th>{t.cpc}</th>
            <th>{t.ctr}</th>
            <th>{t.purchases}</th>
            <th>{t.roas}</th>
          </tr>
        </thead>
        <tbody>
          {brand.campaigns.map((c) => (
            <tr key={c.id}>
              <td>{c.campaignName}</td>
              <td>{formatCurrencyILS(c.spend)}</td>
              <td>{formatNumberShort(c.clicks)}</td>
              <td>{c.cpc > 0 ? `₪${c.cpc.toFixed(2)}` : "—"}</td>
              <td>{c.ctr > 0 ? formatPct(c.ctr) : "—"}</td>
              <td>{formatNumberShort(c.purchases)}</td>
              <td>{c.purchaseRoas != null ? `${formatRatio(c.purchaseRoas)}x` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="pwr-block-title">{t.adsTitle}</p>
      {brand.ads.length === 0 ? (
        <p style={{ fontSize: 11, color: "#64748b", margin: "4px 0" }}>{t.noAds}</p>
      ) : (
        <table className="pwr-table">
          <thead>
            <tr>
              <th>{t.adLabel}</th>
              <th>{t.adsetLabel}</th>
              <th>{t.spend}</th>
              <th>{t.clicks}</th>
              <th>{t.cpc}</th>
              <th>{t.purchases}</th>
              <th>{t.roas}</th>
            </tr>
          </thead>
          <tbody>
            {brand.ads.map((ad, i) => (
              <tr key={`${ad.adName}-${ad.adsetName}-${i}`}>
                <td>{ad.adName ?? "—"}</td>
                <td>{ad.adsetName ?? "—"}</td>
                <td>{formatCurrencyILS(ad.spend)}</td>
                <td>{formatNumberShort(ad.clicks)}</td>
                <td>{ad.cpc > 0 ? `₪${ad.cpc.toFixed(2)}` : "—"}</td>
                <td>{formatNumberShort(ad.purchases)}</td>
                <td>{ad.purchaseRoas != null ? `${formatRatio(ad.purchaseRoas)}x` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function FunnelBlock({ funnel, t }: { funnel: MetaAdsReportFunnel; t: Record<string, string> }) {
  // Show conversion rate from previous step in parentheses under each.
  const rate = (numerator: number, denominator: number) =>
    denominator > 0 ? `${((numerator / denominator) * 100).toFixed(1)}%` : "";
  return (
    <>
      <p className="pwr-block-title">{t.funnelTitle}</p>
      <div className="pwr-funnel">
        <FunnelCell label={t.funnelImpr} value={formatNumberShort(funnel.impressions)} />
        <FunnelCell label={t.funnelClicks} value={formatNumberShort(funnel.clicks)} rate={rate(funnel.clicks, funnel.impressions)} />
        <FunnelCell label={t.funnelLPV} value={formatNumberShort(funnel.landingPageViews)} rate={rate(funnel.landingPageViews, funnel.clicks)} />
        <FunnelCell label={t.funnelATC} value={formatNumberShort(funnel.addToCart)} rate={rate(funnel.addToCart, funnel.landingPageViews)} />
        <FunnelCell label={t.funnelIC} value={formatNumberShort(funnel.initiateCheckout)} rate={rate(funnel.initiateCheckout, funnel.addToCart)} />
        <FunnelCell label={t.funnelPurch} value={formatNumberShort(funnel.purchases)} rate={rate(funnel.purchases, funnel.initiateCheckout)} />
      </div>
    </>
  );
}

function InstagramSection({
  influencer,
  widePosts,
  igInsights,
  t
}: {
  influencer: NonNullable<Awaited<ReturnType<typeof buildMarketingPlannerInfluencerIntelligence>>>;
  widePosts: Array<{ username: string; captionPreview: string; likes: number; comments: number; postedAt: string }>;
  igInsights: InstagramInsights | null;
  t: Record<string, string>;
}) {
  const topCreators = (influencer.topCreators ?? []).slice(0, 8);
  // Every configured affiliate profile, including silent ones — sorted so
  // the ones with the most stored posts appear first.
  const allProfiles = (influencer.instagramCrawl?.affiliateProfiles ?? [])
    .slice()
    .sort((a, b) => (b.postsStored ?? 0) - (a.postsStored ?? 0));

  const statusLabel = (status: string) => {
    if (status === "stored") return t.statusStored;
    if (status === "scanned") return t.statusScanned;
    if (status === "handle_saved") return t.statusHandleSaved;
    return t.statusMissing;
  };

  return (
    <section className="pwr-section">
      <h2 className="pwr-section-title">{t.instagramTitle}</h2>
      <p style={{ margin: "0 0 6px", fontSize: 11, color: "#64748b" }}>{t.instagramSubtitle}</p>

      {igInsights ? (
        <div className="pwr-insights">
          <p className="pwr-insights-hook">{igInsights.hookLine}</p>
          {igInsights.observations.length > 0 ? (
            <>
              <p className="pwr-insights-label">{t.observationsLabel}</p>
              <ul className="pwr-insights-list">
                {igInsights.observations.map((o, i) => (
                  <li key={`ig-obs-${i}`}>{o}</li>
                ))}
              </ul>
            </>
          ) : null}
          {igInsights.actions.length > 0 ? (
            <>
              <p className="pwr-insights-label">{t.actionsLabel}</p>
              <ul className="pwr-insights-list">
                {igInsights.actions.map((a, i) => (
                  <li key={`ig-act-${i}`}>{a}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}

      {/* All configured creators — including silent ones, with crawl status. */}
      <div className="pwr-ig-card">
        <p className="pwr-block-title" style={{ marginTop: 0 }}>{t.allAffiliatesLabel}</p>
        {allProfiles.length === 0 ? (
          <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>{t.noInfluencer}</p>
        ) : (
          <table className="pwr-table">
            <thead>
              <tr>
                <th>@</th>
                <th>{t.profileStatusLabel}</th>
                <th>{t.profilePostsLabel}</th>
                <th>{t.profileLastPostLabel}</th>
              </tr>
            </thead>
            <tbody>
              {allProfiles.map((p) => (
                <tr key={`profile-${p.username}`}>
                  <td>@{p.username}</td>
                  <td>{statusLabel(p.status)}</td>
                  <td>{formatNumberShort(p.postsStored ?? 0)}</td>
                  <td>{p.lastPostAt ? p.lastPostAt.slice(0, 10) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Top creators with attributed sales (uses the report window). */}
      {topCreators.length > 0 ? (
        <div className="pwr-ig-card" style={{ marginTop: 8 }}>
          <p className="pwr-block-title" style={{ marginTop: 0 }}>{t.topCreatorsLabel}</p>
          {topCreators.map((c) => (
            <div className="pwr-ig-row" key={`top-creator-${c.id}`}>
              <span className="pwr-ig-name">{c.name}</span>
              <span className="pwr-ig-stats">
                <span>
                  {t.salesLabel}: <span className="pwr-ig-stat-num">{formatCurrencyILS(c.sales)}</span>
                </span>
                <span>
                  {t.ordersLabel}: <span className="pwr-ig-stat-num">{formatNumberShort(c.orders)}</span>
                </span>
                <span>
                  {t.clicksLabelIg}: <span className="pwr-ig-stat-num">{formatNumberShort(c.clicks)}</span>
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Top posts across the wider 30-day window so creators who post less
          often than weekly still get a representative entry. */}
      <div className="pwr-ig-card" style={{ marginTop: 8 }}>
        <p className="pwr-block-title" style={{ marginTop: 0 }}>{t.topPostsLabel}</p>
        <p style={{ margin: "0 0 6px", fontSize: 10, color: "#64748b" }}>{t.windowLabel}</p>
        {widePosts.length === 0 ? (
          <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>{t.noInfluencer}</p>
        ) : (
          widePosts.map((p, i) => (
            <div className="pwr-ig-row" key={`wide-post-${i}`}>
              <span className="pwr-ig-name">
                @{p.username} <span style={{ color: "#94a3b8", fontWeight: 400 }}>· {p.postedAt}</span>
                {" — "}
                {p.captionPreview || "(no caption)"}
              </span>
              <span className="pwr-ig-stats">
                <span>
                  {t.likesLabel}: <span className="pwr-ig-stat-num">{formatNumberShort(p.likes)}</span>
                </span>
                <span>
                  {t.commentsLabel}: <span className="pwr-ig-stat-num">{formatNumberShort(p.comments)}</span>
                </span>
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
