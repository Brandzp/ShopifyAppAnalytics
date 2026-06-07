import { getAnalyticsRepository } from "@/lib/repositories";
import { getAppLocale } from "@/lib/i18n";
import type { Summary } from "@/lib/domain/types";
import { getFounderSummaryInputs, getOverviewPayload, getProfitAnalyticsPayload, getRetentionPayload } from "@/lib/services/analytics-service";
import { getDb } from "@/lib/server/db";
import { getReportingDateRangeSelection } from "@/lib/server/reporting-date-range";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";

// Direct-from-Orders fallback for the headline %s.
//
// The existing comparison pipeline goes through DailyMetric aggregation /
// Shopify parity, both of which can return empty in dev environments or when
// the periodic aggregation hasn't run. When that happens the headline degrades
// to "Revenue is 0.0% versus the prior period…" — misleading, since the raw
// Order table actually has data. This function shortcuts straight to the
// Order rows, computes revenue + estimated profit for the current and prior
// reporting windows, and returns the % deltas (null when there is genuinely
// no prior data to compare against).
async function computeHeadlineDeltasFromOrders(
  locale: "en" | "he"
): Promise<{ revenueChange: number | null; profitChange: number | null } | null> {
  try {
    const storeId = await resolveActiveStoreId();
    if (!storeId) return null;
    const db = getDb();
    const range = await getReportingDateRangeSelection(locale);
    if (!range.comparison.enabled) return null;

    const [store, current, previous] = await Promise.all([
      db.store.findUnique({
        where: { id: storeId },
        select: { defaultCostRatio: true }
      }),
      db.order.aggregate({
        where: { storeId, createdAt: { gte: range.start, lte: range.end } },
        _sum: { totalPrice: true }
      }),
      db.order.aggregate({
        where: {
          storeId,
          createdAt: { gte: range.comparison.start, lte: range.comparison.end }
        },
        _sum: { totalPrice: true }
      })
    ]);

    const curRev = Number(current._sum.totalPrice ?? 0);
    const prevRev = Number(previous._sum.totalPrice ?? 0);
    // No prior period to compare against — null tells the headline builder
    // to fall through to the existing copy rather than show 0.0%.
    if (prevRev <= 0) return null;

    // Estimated profit uses the store's configured cost ratio (default 0.35).
    // Same flat multiplier for both periods so the comparison is apples-to-apples
    // even if the real margin profile is more sophisticated downstream.
    const costRatio = Number(store?.defaultCostRatio ?? 0.35);
    const margin = 1 - costRatio;
    const curProfit = curRev * margin;
    const prevProfit = prevRev * margin;

    return {
      revenueChange: ((curRev - prevRev) / prevRev) * 100,
      profitChange: prevProfit > 0 ? ((curProfit - prevProfit) / prevProfit) * 100 : null
    };
  } catch {
    return null;
  }
}

function buildGeneratedSummary(
  locale: "en" | "he",
  overview: Awaited<ReturnType<typeof getOverviewPayload>>,
  profit: Awaited<ReturnType<typeof getProfitAnalyticsPayload>>,
  retention: Awaited<ReturnType<typeof getRetentionPayload>>,
  inputs: Awaited<ReturnType<typeof getFounderSummaryInputs>>
): Summary {
  if (locale === "he") {
    return {
      id: "generated-summary",
      headline: `×”×”×›× ×¡×•×ª ×”×©×ª× ×• ×‘-${overview.comparisonMetrics[0]?.change.toFixed(1) ?? "0.0"}% ×ž×•×œ ×”×ª×§×•×¤×” ×”×§×•×“×ž×ª, ×•×”×¨×•×•×— ×”×ž×©×•×¢×¨ ×¢×•×ž×“ ×¢×œ ${overview.comparisonMetrics[1]?.change.toFixed(1) ?? "0.0"}%.`,
      generatedAt: new Date().toISOString(),
      sections: [
        {
          title: "× ×¦×—×•× ×•×ª",
          items: inputs.bestProducts.length
            ? inputs.bestProducts.map((item) => `${item} ×ª×•×¨× ×›×¨×’×¢ ×‘×¦×•×¨×” ×—×™×•×‘×™×ª ×œ×‘×™×¦×•×¢×™ ×”×—× ×•×ª ×‘×¨×ž×ª ×ž×™×™×¡×“.`)
            : ["×—×‘×¨×• × ×ª×•× ×™ ×—× ×•×ª ×›×“×™ ×œ×ž×œ× × ×¦×—×•× ×•×ª ×‘×¨×ž×ª ×ž×•×¦×¨."]
        },
        {
          title: "×¡×™×›×•× ×™×",
          items: [
            `×©×™×¢×•×¨ ×”×”× ×—×•×ª ×¢×•×ž×“ ×¢×œ ${overview.kpis[4]?.value.toFixed(1) ?? "0.0"}%.`,
            `×©×™×¢×•×¨ ×”×”×—×–×¨×™× ×¢×•×ž×“ ×¢×œ ${overview.kpis[5]?.value.toFixed(1) ?? "0.0"}%.`
          ]
        },
        {
          title: "×©×™× ×•×™×™× ×ž×¨×›×–×™×™× ×ž×•×œ ×”×ª×§×•×¤×” ×”×§×•×“×ž×ª",
          items: overview.comparisonMetrics.map((metric) => `${metric.label}: ×©×™× ×•×™ ×©×œ ${metric.change.toFixed(1)}`)
        },
        {
          title: "×ª×•×‘× ×•×ª ×ž×•×¦×¨",
          items: profit.topProducts.slice(0, 3).map((item) => `${item.productTitle} ×™×¦×¨ ${Math.round(item.revenue).toLocaleString()} ×‘×”×›× ×¡×•×ª.`)
        },
        {
          title: "×ª×•×‘× ×•×ª ×”× ×—×•×ª ×•×ž×‘×¦×¢×™×",
          items: inputs.discountSpikes.length ? inputs.discountSpikes.map((item) => `${item} ×”×–×ž× ×•×ª`) : ["×œ× ×–×•×”×ª×” ×—×¨×™×’×ª ×”× ×—×•×ª."]
        },
        {
          title: "×ª×•×‘× ×•×ª ×¨×™×˜× ×©×Ÿ",
          items: [
            `×©×™×¢×•×¨ ×”×¨×›×™×©×” ×”×—×•×–×¨×ª ×¢×•×ž×“ ×¢×œ ${retention.snapshot.repeatPurchaseRate.toFixed(1)}%.`,
            `×©×™×¢×•×¨ ×”×”×–×ž× ×” ×”×©× ×™×™×” ×¢×•×ž×“ ×¢×œ ${retention.snapshot.secondOrderRate.toFixed(1)}%.`
          ]
        },
        {
          title: "×”×¦×¢×“×™× ×”×‘××™×",
          items: [
            "×”×¨×™×¦×• ×¡× ×›×¨×•×Ÿ ××™× ×§×¨×ž× ×˜×œ×™ ×œ×¤× ×™ ×©×™×ª×•×£ ×¢×“×›×•×Ÿ ×œ×ž×™×™×¡×“.",
            "×¢×‘×¨×• ×¢×œ ×¢×ž×•×“×™ ×”×¨×•×•×—×™×•×ª ×•×”×¨×™×˜× ×©×Ÿ ×›×“×™ ×œ×–×”×•×ª ×œ×—×¥ ×¢×œ ×ž×¨×•×•×— ×•×”×–×“×ž× ×•×™×•×ª ×œ×”×–×ž× ×” ×©× ×™×™×”."
          ]
        }
      ]
    };
  }

  return {
    id: "generated-summary",
    headline: `Revenue is ${overview.comparisonMetrics[0]?.change.toFixed(1) ?? "0.0"}% versus the prior period, with estimated profit at ${overview.comparisonMetrics[1]?.change.toFixed(1) ?? "0.0"}%.`,
    generatedAt: new Date().toISOString(),
    sections: [
      {
        title: "Wins",
        items: inputs.bestProducts.length
          ? inputs.bestProducts.map((item) => `${item} is contributing positively to founder-level performance.`)
          : ["Sync store data to populate product-level wins."]
      },
      {
        title: "Risks",
        items: [
          `Discount rate is ${overview.kpis[4]?.value.toFixed(1) ?? "0.0"}%.`,
          `Refund rate is ${overview.kpis[5]?.value.toFixed(1) ?? "0.0"}%.`
        ]
      },
      {
        title: "Key changes from previous period",
        items: overview.comparisonMetrics.map((metric) => `${metric.label}: ${metric.change.toFixed(1)} change`)
      },
      {
        title: "Product insights",
        items: profit.topProducts.slice(0, 3).map((item) => `${item.productTitle} generated ${Math.round(item.revenue).toLocaleString()} in revenue.`)
      },
      {
        title: "Discount and promotion insights",
        items: inputs.discountSpikes.length ? inputs.discountSpikes : ["No discount spikes detected."]
      },
      {
        title: "Retention insights",
        items: [
          `Repeat purchase rate is ${retention.snapshot.repeatPurchaseRate.toFixed(1)}%.`,
          `Second-order rate is ${retention.snapshot.secondOrderRate.toFixed(1)}%.`
        ]
      },
      {
        title: "Recommended next actions",
        items: [
          "Run incremental sync before publishing a founder update.",
          "Review the profit and retention pages for margin pressure and second-order opportunities."
        ]
      }
    ]
  };
}

function buildHeadlineFromDeltas(
  locale: "en" | "he",
  deltas: { revenueChange: number | null; profitChange: number | null }
): string {
  const rev = deltas.revenueChange;
  const prof = deltas.profitChange;
  if (locale === "he") {
    return `הכנסות השתנו ב־${rev != null ? rev.toFixed(1) : "0.0"}% מול התקופה הקודמת, והרווח המשוער ב־${prof != null ? prof.toFixed(1) : "0.0"}%.`;
  }
  return `Revenue is ${rev != null ? rev.toFixed(1) : "0.0"}% versus the prior period, with estimated profit at ${prof != null ? prof.toFixed(1) : "0.0"}%.`;
}

function headlineLooksBogus(headline: string): boolean {
  // A headline like "Revenue is 0.0% versus the prior period, with estimated
  // profit at 0.0%." (or its Hebrew equivalent) is the placeholder pattern
  // that fires when the comparison pipeline returns nothing. We rewrite it
  // from the Order table directly.
  return /\b0\.0%[^0-9]+0\.0%/.test(headline);
}

export async function getLatestSummary(): Promise<Summary> {
  const locale = await getAppLocale();
  const repository = await getAnalyticsRepository();
  const summaries = await repository.getSummaries();

  // Compute order-based deltas in parallel with whichever summary path we
  // take, so we can repair a bogus headline regardless of source.
  const orderDeltasPromise = computeHeadlineDeltasFromOrders(locale);

  if (summaries.length && locale === "en") {
    const stored = summaries[0];
    const orderDeltas = await orderDeltasPromise;
    if (orderDeltas && headlineLooksBogus(stored.headline)) {
      return { ...stored, headline: buildHeadlineFromDeltas(locale, orderDeltas) };
    }
    return stored;
  }

  const [overview, profit, retention, inputs, orderDeltas] = await Promise.all([
    getOverviewPayload(),
    getProfitAnalyticsPayload(),
    getRetentionPayload(),
    getFounderSummaryInputs(),
    orderDeltasPromise
  ]);

  const summary = buildGeneratedSummary(locale, overview, profit, retention, inputs);

  // Override the headline when the structured comparison came up empty but
  // the Order-based fallback has real numbers to report.
  const overviewRevenueChange = overview.comparisonMetrics[0]?.change;
  const overviewProfitChange = overview.comparisonMetrics[1]?.change;
  const overviewLooksEmpty =
    (overviewRevenueChange === undefined || overviewRevenueChange === 0) &&
    (overviewProfitChange === undefined || overviewProfitChange === 0);
  if ((overviewLooksEmpty || headlineLooksBogus(summary.headline)) && orderDeltas) {
    summary.headline = buildHeadlineFromDeltas(locale, orderDeltas);
  }

  return summary;
}

export async function regenerateSummary(): Promise<Summary> {
  // TODO: Replace this structured summary builder with an LLM prompt pipeline that consumes real founder summary inputs.
  return getLatestSummary();
}

