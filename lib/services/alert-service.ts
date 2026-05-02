import { getAnalyticsRepository } from "@/lib/repositories";
import { getAppLocale } from "@/lib/i18n";
import type { Alert } from "@/lib/domain/types";
import { getOverviewPayload, getProfitAnalyticsPayload, getRetentionPayload } from "@/lib/services/analytics-service";

export async function generateAlerts(): Promise<Alert[]> {
  const locale = await getAppLocale();
  const [overview, profit, retention] = await Promise.all([
    getOverviewPayload(),
    getProfitAnalyticsPayload(),
    getRetentionPayload()
  ]);

  const alerts: Alert[] = [];
  const revenueMetric = overview.comparisonMetrics[0];
  const discountMetric = overview.comparisonMetrics[3];
  const returningMetric = overview.comparisonMetrics[2];
  const refundKpi = overview.kpis[5];
  const topGrowthProduct = profit.topProducts[0];

  if (revenueMetric && revenueMetric.change < 0) {
    alerts.push({
      id: "rule-revenue-down",
      severity: "high",
      title: locale === "he" ? "×”×”×›× ×¡×•×ª ×™×¨×“×• ×ž×•×œ ×”×ª×§×•×¤×” ×”×§×•×“×ž×ª" : "Revenue is down versus the prior period",
      explanation: locale === "he" ? `×”×”×›× ×¡×•×ª ×–×–×• ×‘-${revenueMetric.change.toFixed(1)}% ×ž×•×œ ×”×—×œ×•×Ÿ ×”×§×•×“×.` : `Revenue moved ${revenueMetric.change.toFixed(1)}% against the previous window.`,
      suggestedAction: locale === "he" ? "×‘×“×§×• ××ª ×”×‘×™×§×•×© ×œ×ž×•×¦×¨×™× ×”×ž×•×‘×™×œ×™×, ×ª×ž×”×™×œ ×”×”× ×—×•×ª ×•×§×¦×‘ ×”×”×–×ž× ×•×ª ×œ×¤× ×™ ×”×¢×“×›×•×Ÿ ×”×‘× ×œ×ž×™×™×¡×“." : "Review top product demand, discount mix, and order cadence before the next founder update.",
      periodLabel: locale === "he" ? "30 ×”×™×ž×™× ×”××—×¨×•× ×™×" : "Last 30 days",
      timestamp: new Date().toISOString()
    });
  }

  if (discountMetric && discountMetric.change > 0.5) {
    alerts.push({
      id: "rule-discount-spike",
      severity: "medium",
      title: locale === "he" ? "×©×™×¢×•×¨ ×”×”× ×—×•×ª ×¢×•×œ×” ×ž×”×¨ ×™×•×ª×¨ ×ž×”×ª×§×•×¤×” ×”×§×•×“×ž×ª" : "Discount rate is rising faster than the prior period",
      explanation: locale === "he" ? `×©×™×¢×•×¨ ×”×”× ×—×•×ª ×”×©×ª× ×” ×‘-${discountMetric.change.toFixed(1)} × ×§×•×“×•×ª.` : `Discount rate changed by ${discountMetric.change.toFixed(1)} points.`,
      suggestedAction: locale === "he" ? "×‘×“×§×• ×× ×”×¢×œ×™×™×” ×‘×”×›× ×¡×•×ª ×‘××ž×ª ×ž×•×¦×“×§×ª ×‘×¨×ž×ª ×”×¨×•×•×—×™×•×ª, ×•×¦×ž×¦×ž×• ×ž×‘×¦×¢×™× ×—×œ×©×™× ×× ×¦×¨×™×š." : "Check whether the revenue lift is justified by profit contribution and tighten low-margin offers if needed.",
      periodLabel: locale === "he" ? "30 ×”×™×ž×™× ×”××—×¨×•× ×™×" : "Last 30 days",
      timestamp: new Date().toISOString()
    });
  }

  if ((refundKpi?.value ?? 0) > 3) {
    alerts.push({
      id: "rule-refund-spike",
      severity: "medium",
      title: locale === "he" ? "×©×™×¢×•×¨ ×”×”×—×–×¨×™× ×’×‘×•×”" : "Refund rate is elevated",
      explanation: locale === "he" ? `×©×™×¢×•×¨ ×”×”×—×–×¨×™× ×¢×•×ž×“ ×›×¨×’×¢ ×¢×œ ${refundKpi?.value.toFixed(1)}%.` : `Refund rate is currently ${refundKpi?.value.toFixed(1)}%.`,
      suggestedAction: locale === "he" ? "×¢×‘×¨×• ×¢×œ ×”×ž×•×¦×¨×™× ×¢× ×”×›×™ ×”×¨×‘×” ×”×—×–×¨×™× ×•×‘×¢×™×•×ª ×œ×•×’×™×¡×˜×™×•×ª ×œ×¤× ×™ ×©×”×©×—×™×§×” ×‘×ž×¨×•×•×— ×ª×¢×ž×™×§." : "Inspect refund-heavy products and fulfillment issues before margin erosion compounds.",
      periodLabel: locale === "he" ? "30 ×”×™×ž×™× ×”××—×¨×•× ×™×" : "Last 30 days",
      timestamp: new Date().toISOString()
    });
  }

  if (returningMetric && returningMetric.change < 0) {
    alerts.push({
      id: "rule-repeat-rate-drop",
      severity: "medium",
      title: locale === "he" ? "×©×™×¢×•×¨ ×”×œ×§×•×—×•×ª ×”×—×•×–×¨×™× × ×—×œ×© ×ž×•×œ ×”×ª×§×•×¤×” ×”×§×•×“×ž×ª" : "Returning customer rate slipped versus the prior period",
      explanation: locale === "he" ? `×‘×™×¦×•×¢×™ ×”×¨×›×™×©×” ×”×—×•×–×¨×ª ×–×–×• ×‘-${returningMetric.change.toFixed(1)} × ×§×•×“×•×ª.` : `Repeat performance moved ${returningMetric.change.toFixed(1)} points.`,
      suggestedAction: locale === "he" ? "×‘×“×§×• ××ª ×”×ª×–×ž×•×Ÿ ×©×œ ×”×–×ž× ×” ×©× ×™×™×” ×•××ª ×ž×¡×¨×™ ×”×¨×™×˜× ×©×Ÿ ×œ×¨×•×›×©×™× ×—×“×©×™×." : "Review second-order timing and retention messages for recent first-time buyers.",
      periodLabel: locale === "he" ? "30 ×”×™×ž×™× ×”××—×¨×•× ×™×" : "Last 30 days",
      timestamp: new Date().toISOString()
    });
  }

  if (topGrowthProduct) {
    alerts.push({
      id: "rule-strong-product-growth",
      severity: "low",
      title: locale === "he" ? `${topGrowthProduct.productTitle} ×”×•× ×ž×•×¦×¨ ×—×–×§ ×‘×ž×™×•×—×“` : `${topGrowthProduct.productTitle} is a strong performer`,
      explanation: locale === "he" ? `×”×ž×•×¦×¨ ×ž×•×‘×™×œ ××ª ×”×ª×§×•×¤×” ×¢× ${Math.round(topGrowthProduct.revenue).toLocaleString()} ×‘×”×›× ×¡×•×ª.` : `This product is leading the period with ${Math.round(topGrowthProduct.revenue).toLocaleString()} in revenue.`,
      suggestedAction: locale === "he" ? "×©×ž×¨×• ×¢×œ ×ž×œ××™ ×–×ž×™×Ÿ ×•×”×’× ×• ×¢×œ ×ž×¨×•×•×— ×”×ª×¨×•×ž×” ×©×œ ×”×ž×•×¦×¨ ×”×–×”." : "Monitor inventory and protect contribution margin on this product.",
      periodLabel: locale === "he" ? "30 ×”×™×ž×™× ×”××—×¨×•× ×™×" : "Last 30 days",
      timestamp: new Date().toISOString()
    });
  }

  if (!alerts.length) {
    alerts.push({
      id: "rule-no-alerts",
      severity: "low",
      title: locale === "he" ? "×œ× ×–×•×”×• ×—×¨×™×’×•×ª ×ž×©×ž×¢×•×ª×™×•×ª" : "No major anomalies detected",
      explanation: locale === "he" ? `×©×™×¢×•×¨ ×”×¨×›×™×©×” ×”×—×•×–×¨×ª ×”×•× ${retention.snapshot.repeatPurchaseRate.toFixed(1)}% ×•×”×ª×§×•×¤×” × ×¨××™×ª ×™×¦×™×‘×” ×™×—×¡×™×ª.` : `Repeat rate is ${retention.snapshot.repeatPurchaseRate.toFixed(1)}% and the current period is relatively stable.`,
      suggestedAction: locale === "he" ? "×©×ž×¨×• ×¢×œ ×¡× ×›×¨×•×Ÿ ×¢×“×›× ×™ ×•×¢×‘×¨×• ×¢×œ ×§×œ×˜ ×”×¡×™×›×•× ×œ×¤× ×™ ×©×œ×™×—×ª ×”×“×™×•×•×—×™×." : "Keep syncs current and review the founder summary inputs before sending reports.",
      periodLabel: locale === "he" ? "30 ×”×™×ž×™× ×”××—×¨×•× ×™×" : "Last 30 days",
      timestamp: new Date().toISOString()
    });
  }

  return alerts;
}

export async function getAlerts(): Promise<Alert[]> {
  const locale = await getAppLocale();
  const repository = await getAnalyticsRepository();
  const stored = await repository.getAlerts();
  if (stored.length && locale === "en") return stored;
  return generateAlerts();
}

