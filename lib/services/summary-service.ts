import { getAnalyticsRepository } from "@/lib/repositories";
import { getAppLocale } from "@/lib/i18n";
import type { Summary } from "@/lib/domain/types";
import { getFounderSummaryInputs, getOverviewPayload, getProfitAnalyticsPayload, getRetentionPayload } from "@/lib/services/analytics-service";

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

export async function getLatestSummary(): Promise<Summary> {
  const locale = await getAppLocale();
  const repository = await getAnalyticsRepository();
  const summaries = await repository.getSummaries();
  if (summaries.length && locale === "en") return summaries[0];

  const [overview, profit, retention, inputs] = await Promise.all([
    getOverviewPayload(),
    getProfitAnalyticsPayload(),
    getRetentionPayload(),
    getFounderSummaryInputs()
  ]);

  return buildGeneratedSummary(locale, overview, profit, retention, inputs);
}

export async function regenerateSummary(): Promise<Summary> {
  // TODO: Replace this structured summary builder with an LLM prompt pipeline that consumes real founder summary inputs.
  return getLatestSummary();
}

