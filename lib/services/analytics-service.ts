import { getProfitAnalyticsFromDb, getRetentionAnalyticsFromDb } from "@/lib/data/prisma-analytics-repository";
import { getAnalyticsRepository } from "@/lib/repositories";
import { getReportingDateRangeSelection } from "@/lib/server/reporting-date-range";
import { getAppLocale, getDictionary } from "@/lib/i18n";
import type {
  Alert,
  ComparisonMetric,
  DailyMetric,
  FounderSummaryInputs,
  OverviewPayload,
  ProfitAnalyticsPayload,
  RetentionPayload
} from "@/lib/domain/types";

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: number[]) {
  return values.length ? sum(values) / values.length : 0;
}

function buildComparisonMetrics(
  currentMetrics: DailyMetric[],
  previousMetrics: DailyMetric[],
  labels: {
    revenue: string;
    estimatedProfit: string;
    returningCustomerRate: string;
    discountRate: string;
  }
): ComparisonMetric[] {
  const revenueCurrent = sum(currentMetrics.map((metric) => metric.revenue));
  const revenuePrevious = sum(previousMetrics.map((metric) => metric.revenue));
  const profitCurrent = sum(currentMetrics.map((metric) => metric.estimatedProfit));
  const profitPrevious = sum(previousMetrics.map((metric) => metric.estimatedProfit));
  const retentionCurrent = average(currentMetrics.map((metric) => metric.returningCustomerRate));
  const retentionPrevious = average(previousMetrics.map((metric) => metric.returningCustomerRate));
  const discountCurrent = average(currentMetrics.map((metric) => metric.discountRate));
  const discountPrevious = average(previousMetrics.map((metric) => metric.discountRate));
  const calcChange = (current: number, previous: number) => (previous === 0 ? 0 : ((current - previous) / previous) * 100);

  return [
    { label: labels.revenue, current: revenueCurrent, previous: revenuePrevious, change: calcChange(revenueCurrent, revenuePrevious) },
    { label: labels.estimatedProfit, current: profitCurrent, previous: profitPrevious, change: calcChange(profitCurrent, profitPrevious) },
    { label: labels.returningCustomerRate, current: retentionCurrent, previous: retentionPrevious, change: retentionCurrent - retentionPrevious },
    { label: labels.discountRate, current: discountCurrent, previous: discountPrevious, change: discountCurrent - discountPrevious }
  ];
}

function buildOverviewAlerts(locale: "en" | "he", refundRate: number, discountRate: number, returningCustomerRate: number): Alert[] {
  if (locale === "he") {
    return [
      {
        id: "overview-alert-refunds",
        severity: "high",
        title: "×©×™×¢×•×¨ ×”×”×—×–×¨×™× ×’×‘×•×” ×ž×”×¨×’×™×œ",
        explanation: `×©×™×¢×•×¨ ×”×”×—×–×¨×™× ×¢×•×ž×“ ×¢×œ ${refundRate.toFixed(1)}% ×‘×—×œ×•×Ÿ ×”× ×•×›×—×™.`,
        suggestedAction: "×‘×“×§×• ××ª ×”×ž×•×¦×¨×™× ×¢× ×”×›×™ ×”×¨×‘×” ×”×—×–×¨×™× ×•××ª ××™×›×•×ª ×”×ž×©×œ×•×— ×•×”×©×™×¨×•×ª.",
        periodLabel: "30 ×”×™×ž×™× ×”××—×¨×•× ×™×",
        timestamp: new Date().toISOString()
      },
      {
        id: "overview-alert-discounts",
        severity: "medium",
        title: "×ª×ž×”×™×œ ×”×”× ×—×•×ª ×“×•×¨×© ×‘×“×™×§×”",
        explanation: `×©×™×¢×•×¨ ×”×”× ×—×•×ª ×”×ž×ž×•×¦×¢ ×¢×•×ž×“ ×¢×œ ${discountRate.toFixed(1)}% ×‘×ª×§×•×¤×” ×”× ×•×›×—×™×ª.`,
        suggestedAction: "×‘×“×§×• ××™×œ×• ×§×•×“×™× ×ž×™×™×¦×¨×™× ×”×›× ×¡×” ×‘×œ×™ ×œ×¤×’×•×¢ ×™×•×ª×¨ ×ž×“×™ ×‘×¨×•×•×—.",
        periodLabel: "30 ×”×™×ž×™× ×”××—×¨×•× ×™×",
        timestamp: new Date().toISOString()
      },
      {
        id: "overview-alert-repeat",
        severity: "low",
        title: "×©×™×¢×•×¨ ×”×œ×§×•×—×•×ª ×”×—×•×–×¨×™× ×¨××•×™ ×œ×ž×¢×§×‘",
        explanation: `×©×™×¢×•×¨ ×”×œ×§×•×—×•×ª ×”×—×•×–×¨×™× ×›×¨×’×¢ ×”×•× ${returningCustomerRate.toFixed(1)}%.`,
        suggestedAction: "×¢×‘×¨×• ×¢×œ ×ž×¡×œ×•×œ×™ ×”×–×ž× ×” ×©× ×™×™×” ×•×¢×œ ×ž×•×¦×¨×™ ×”×¨×™×˜× ×©×Ÿ ×”×ž×¨×›×–×™×™×.",
        periodLabel: "30 ×”×™×ž×™× ×”××—×¨×•× ×™×",
        timestamp: new Date().toISOString()
      }
    ];
  }

  return [
    {
      id: "overview-alert-refunds",
      severity: "high",
      title: "Refund rate is elevated",
      explanation: `Refund rate is ${refundRate.toFixed(1)}% in the current window.`,
      suggestedAction: "Review refund-heavy products and post-purchase experience.",
      periodLabel: "Last 30 days",
      timestamp: new Date().toISOString()
    },
    {
      id: "overview-alert-discounts",
      severity: "medium",
      title: "Discount mix needs review",
      explanation: `Average discount rate is ${discountRate.toFixed(1)}% in the current period.`,
      suggestedAction: "Check which offers are driving revenue without eroding profit.",
      periodLabel: "Last 30 days",
      timestamp: new Date().toISOString()
    },
    {
      id: "overview-alert-repeat",
      severity: "low",
      title: "Returning customer rate should be monitored",
      explanation: `Returning customer rate is ${returningCustomerRate.toFixed(1)}% right now.`,
      suggestedAction: "Review second-order programs and top retention products.",
      periodLabel: "Last 30 days",
      timestamp: new Date().toISOString()
    }
  ];
}

export async function getOverviewPayload(): Promise<OverviewPayload> {
  const locale = await getAppLocale();
  const dictionary = getDictionary(locale);
  const repository = await getAnalyticsRepository();
  const [store, dailyMetrics, previousPeriodMetrics, collectionPerformance, discounts, productPerformance] =
    await Promise.all([
      repository.getStore(),
      repository.getDailyMetrics(),
      repository.getPreviousPeriodMetrics(),
      repository.getCollectionPerformance(),
      repository.getDiscountUsage(),
      getProfitAnalyticsPayload().then((payload) => payload.productPerformance)
    ]);

  const comparisonMetrics = buildComparisonMetrics(dailyMetrics, previousPeriodMetrics, {
    revenue: dictionary.overview.revenue,
    estimatedProfit: dictionary.overview.estimatedProfit,
    returningCustomerRate: locale === "he" ? "×©×™×¢×•×¨ ×œ×§×•×—×•×ª ×—×•×–×¨×™×" : "Returning Customer Rate",
    discountRate: locale === "he" ? "×©×™×¢×•×¨ ×”× ×—×•×ª" : "Discount Rate"
  });
  const revenue = sum(dailyMetrics.map((metric) => metric.revenue));
  const estimatedProfit = sum(dailyMetrics.map((metric) => metric.estimatedProfit));
  const returningCustomerRate = average(dailyMetrics.map((metric) => metric.returningCustomerRate));
  const averageOrderValue = average(dailyMetrics.map((metric) => metric.averageOrderValue));
  const discountRate = average(dailyMetrics.map((metric) => metric.discountRate));
  const refundRate = average(dailyMetrics.map((metric) => metric.refundRate));
  const topProduct = productPerformance[0];
  const mostProfitableCollection = [...collectionPerformance].sort((a, b) => b.estimatedProfit - a.estimatedProfit)[0];
  const topDiscount = discounts[0];
  const biggestDropMetric = comparisonMetrics.filter((metric) => metric.change < 0).sort((a, b) => a.change - b.change)[0];
  const alerts = buildOverviewAlerts(locale, refundRate, discountRate, returningCustomerRate);

  return {
    store,
    kpis: [
      { label: dictionary.overview.revenue, value: revenue, change: comparisonMetrics[0]?.change ?? 0, format: "currency" },
      { label: dictionary.overview.estimatedProfit, value: estimatedProfit, change: comparisonMetrics[1]?.change ?? 0, format: "currency" },
      { label: locale === "he" ? "×©×™×¢×•×¨ ×œ×§×•×—×•×ª ×—×•×–×¨×™×" : "Returning Customer Rate", value: returningCustomerRate, change: comparisonMetrics[2]?.change ?? 0, format: "percent" },
      { label: locale === "he" ? "×¢×¨×š ×”×–×ž× ×” ×ž×ž×•×¦×¢" : "Average Order Value", value: averageOrderValue, change: averageOrderValue - average(previousPeriodMetrics.map((metric) => metric.averageOrderValue)), format: "currency" },
      { label: locale === "he" ? "×©×™×¢×•×¨ ×”× ×—×•×ª" : "Discount Rate", value: discountRate, change: comparisonMetrics[3]?.change ?? 0, format: "percent" },
      { label: locale === "he" ? "×©×™×¢×•×¨ ×”×—×–×¨×™×" : "Refund Rate", value: refundRate, change: refundRate - average(previousPeriodMetrics.map((metric) => metric.refundRate)), format: "percent" }
    ],
    dailyMetrics,
    insights: [
      {
        title: locale === "he" ? "×”×ž×•×¦×¨ ×”×ž×•×‘×™×œ" : "Top performing product",
        detail: topProduct
          ? locale === "he"
            ? `${topProduct.productTitle} ×”×•× ×›×¨×’×¢ ×ž× ×•×¢ ×”×”×›× ×¡×•×ª ×”×—×–×§ ×‘×™×•×ª×¨.`
            : `${topProduct.productTitle} is currently the strongest revenue driver.`
          : locale === "he"
            ? "×¢×“×™×™×Ÿ ××™×Ÿ × ×ª×•× ×™ ×ž×•×¦×¨×™× ×–×ž×™× ×™×."
            : "No product data is available yet.",
        emphasis: topProduct ? (locale === "he" ? `${Math.round(topProduct.revenue).toLocaleString()} ×”×›× ×¡×•×ª ×‘×ª×§×•×¤×” ×”× ×•×›×—×™×ª` : `${Math.round(topProduct.revenue).toLocaleString()} revenue in the current period`) : undefined
      },
      {
        title: locale === "he" ? "×”×”× ×—×” ×”×ž×•×‘×™×œ×” ×œ×¤×™ ×©×™×ž×•×©" : "Top discount by usage",
        detail: topDiscount
          ? locale === "he"
            ? `${topDiscount.code} ×”×•× ×ž× ×•×£ ×”×”× ×—×” ×”×‘×•×œ×˜ ×‘×™×•×ª×¨ ×‘×ª×§×•×¤×” ×”× ×•×›×—×™×ª.`
            : `${topDiscount.code} is the most visible discount lever in the current period.`
          : locale === "he"
            ? "×¢×“×™×™×Ÿ ×œ× × ×¨×©× ×©×™×ž×•×© ×‘×”× ×—×•×ª."
            : "No discount usage has been recorded yet.",
        emphasis: topDiscount ? (locale === "he" ? `${topDiscount.orderCount} ×”×–×ž× ×•×ª ×”×•×©×¤×¢×•` : `${topDiscount.orderCount} influenced orders`) : undefined
      },
      {
        title: locale === "he" ? "×”×§×˜×’×•×¨×™×” ×”×¨×•×•×—×™×ª ×‘×™×•×ª×¨" : "Most profitable collection",
        detail: mostProfitableCollection
          ? locale === "he"
            ? `${mostProfitableCollection.collection} ×ž×—×–×™×§×” ×›×¨×’×¢ ××ª ×ž×¨×•×•×— ×”×ª×¨×•×ž×” ×”×ž×©×•×¢×¨ ×”×—×–×§ ×‘×™×•×ª×¨.`
            : `${mostProfitableCollection.collection} is carrying the best estimated contribution margin.`
          : locale === "he"
            ? "×‘×™×¦×•×¢×™ ×”×§×˜×’×•×¨×™×•×ª ×™×•×¤×™×¢×• ×œ××—×¨ ×”×¡× ×›×¨×•×Ÿ."
            : "Collection performance will appear after sync.",
        emphasis: mostProfitableCollection ? (locale === "he" ? `${Math.round(mostProfitableCollection.estimatedProfit).toLocaleString()} ×¨×•×•×— ×ž×©×•×¢×¨` : `${Math.round(mostProfitableCollection.estimatedProfit).toLocaleString()} estimated profit`) : undefined
      },
      {
        title: locale === "he" ? "×”×™×¨×™×“×” ×”×’×“×•×œ×” ×‘×™×•×ª×¨ ×ž×•×œ ×”×ª×§×•×¤×” ×”×§×•×“×ž×ª" : "Biggest drop vs prior period",
        detail: biggestDropMetric
          ? locale === "he"
            ? `${biggestDropMetric.label} × ×—×œ×© ×ž×•×œ ×—×œ×•×Ÿ ×”×”×©×•×•××” ×”×§×•×“×.`
            : `${biggestDropMetric.label} softened versus the previous comparison window.`
          : locale === "he"
            ? "×œ× ×–×•×”×ª×” ×™×¨×™×“×” ×ž×”×•×ª×™×ª ×ž×•×œ ×”×ª×§×•×¤×” ×”×§×•×“×ž×ª."
            : "No major downside move versus the previous period.",
        emphasis: biggestDropMetric ? (locale === "he" ? `×©×™× ×•×™ ×©×œ ${biggestDropMetric.change.toFixed(1)}` : `${biggestDropMetric.change.toFixed(1)} change`) : undefined
      },
      {
        title: locale === "he" ? "×ª×•×‘× ×ª ×¨×›×™×©×” ×—×•×–×¨×ª" : "Repeat purchase highlight",
        detail: locale === "he"
          ? "×× ×œ×™×˜×™×§×ª ×”×¨×™×˜× ×©×Ÿ × ×©×¢× ×ª ×›×¢×ª ×¢×œ ×”×–×ž× ×•×ª ×•×œ×§×•×—×•×ª ×ž× ×•×¨×ž×œ×™× ×•×œ× ×¨×§ ×¢×œ ×”×¢×¨×›×•×ª ×ž×“×•×ž×•×ª."
          : "Retention analytics is now sourced from normalized orders and customer history rather than placeholder estimates.",
        emphasis: locale === "he" ? `${returningCustomerRate.toFixed(1)}% ×©×™×¢×•×¨ ×—×•×–×¨×™×` : `${returningCustomerRate.toFixed(1)}% returning rate`
      }
    ],
    actionPanel: [
      {
        title: locale === "he" ? "×ž×” ×”×©×ª× ×” ×”×©×‘×•×¢" : "What changed this week",
        items: [
          locale === "he"
            ? `×”×”×›× ×¡×•×ª ×”×Ÿ ${comparisonMetrics[0]?.change.toFixed(1) ?? "0.0"}% ×œ×¢×•×ž×ª ×”×ª×§×•×¤×” ×”×§×•×“×ž×ª.`
            : `Revenue is ${comparisonMetrics[0]?.change.toFixed(1) ?? "0.0"}% versus the previous period.`,
          locale === "he"
            ? `×”×¨×•×•×— ×”×ž×©×•×¢×¨ ×”×•× ${comparisonMetrics[1]?.change.toFixed(1) ?? "0.0"}% ×œ×¢×•×ž×ª ×”×ª×§×•×¤×” ×”×§×•×“×ž×ª.`
            : `Estimated profit is ${comparisonMetrics[1]?.change.toFixed(1) ?? "0.0"}% versus the previous period.`
        ]
      },
      {
        title: locale === "he" ? "×ž×” ×“×•×¨×© ×ª×©×•×ž×ª ×œ×‘" : "What needs attention",
        items: [
          locale === "he"
            ? `×©×™×¢×•×¨ ×”×”× ×—×•×ª ×¢×•×ž×“ ×¢×œ ×ž×ž×•×¦×¢ ×©×œ ${discountRate.toFixed(1)}% ×‘×—×œ×•×Ÿ ×”× ×•×›×—×™.`
            : `Discount rate is averaging ${discountRate.toFixed(1)}% across the current window.`,
          locale === "he"
            ? `×©×™×¢×•×¨ ×”×”×—×–×¨×™× ×¢×•×ž×“ ×¢×œ ×ž×ž×•×¦×¢ ×©×œ ${refundRate.toFixed(1)}% ×‘×—×œ×•×Ÿ ×”× ×•×›×—×™.`
            : `Refund rate is averaging ${refundRate.toFixed(1)}% across the current window.`
        ]
      },
      {
        title: locale === "he" ? "×¤×¢×•×œ×•×ª ×ž×•×ž×œ×¦×•×ª" : "Recommended actions",
        items: [
          locale === "he"
            ? "×‘×“×§×• ××ª ×˜×‘×œ×ª ×”×¨×•×•×—×™×•×ª ×‘×¨×ž×ª ×ž×•×¦×¨ ×›×“×™ ×œ×–×”×•×ª ×”×–×ž× ×•×ª ×¢×ž×•×¡×•×ª ×”× ×—×•×ª ×•×ž×•×¦×¨×™× ×¢× ×ž×¨×•×•×— × ×ž×•×š."
            : "Review the product-level profit table to isolate discount-heavy orders and low-margin products.",
          locale === "he"
            ? "×”×©×ª×ž×©×• ×‘×‘×§×¨×•×ª ×”×¡× ×›×¨×•×Ÿ ×‘×”×’×“×¨×•×ª ×›×“×™ ×œ×©×ž×•×¨ ××ª ×”×“×™×•×•×— ×ž×¢×•×“×›×Ÿ ×•×ž×•×›×Ÿ ×œ×”×ª×¨××•×ª ×•×œ×¡×™×›×•×ž×™ ×ž×™×™×¡×“."
            : "Use the sync controls in Settings to keep reporting current and ready for alerts and founder summaries."
        ]
      }
    ],
    productPerformance,
    collectionPerformance,
    discounts,
    alerts,
    comparisonMetrics
  };
}

export async function getProfitAnalyticsPayload(): Promise<ProfitAnalyticsPayload> {
  const locale = await getAppLocale();
  const dbPayload = await getProfitAnalyticsFromDb();
  if (dbPayload) return dbPayload;

  const repository = await getAnalyticsRepository();
  const [orders, products, collectionPerformance, discountUsage] = await Promise.all([
    repository.getOrders(),
    repository.getProducts(),
    repository.getCollectionPerformance(),
    repository.getDiscountUsage()
  ]);

  const productLookup = new Map(products.map((product) => [product.id, { title: product.title, collection: product.collection }]));
  const productPerformance = orders.flatMap((order) =>
    order.lineItems
      .filter((item) => item.productId && productLookup.has(item.productId))
      .map((item) => ({
        productId: item.productId as string,
        productTitle: productLookup.get(item.productId as string)?.title ?? (locale === "he" ? "×ž×•×¦×¨ ×œ× ×™×“×•×¢" : "Unknown product"),
        collection: productLookup.get(item.productId as string)?.collection ?? (locale === "he" ? "×œ×œ× ×§×˜×’×•×¨×™×”" : "Uncategorized"),
        unitsSold: item.quantity,
        revenue: item.unitPrice * item.quantity,
        estimatedProfit: item.unitPrice * item.quantity - item.discountAmount - item.estimatedCost,
        discountImpact: item.discountAmount,
        refundImpact: 0,
        inventoryQuantity: null,
        collections: []
      }))
  );

  return {
    productPerformance,
    collectionPerformance,
    discountUsage,
    topProducts: productPerformance.slice(0, 4),
    lowProducts: [...productPerformance].sort((a, b) => a.estimatedProfit - b.estimatedProfit).slice(0, 4)
  };
}

export async function getRetentionPayload(): Promise<RetentionPayload> {
  const locale = await getAppLocale();
  const dbPayload = await getRetentionAnalyticsFromDb();
  if (dbPayload) return dbPayload;

  const repository = await getAnalyticsRepository();
  const dailyMetrics = await repository.getDailyMetrics();

  return {
    snapshot: {
      newCustomers: 0,
      returningCustomers: 0,
      repeatPurchaseRate: average(dailyMetrics.map((metric) => metric.returningCustomerRate)),
      secondOrderRate: 0,
      averageDaysToSecondOrder: 0
    },
    dailyMetrics,
    firstOrderProducts: [],
    secondOrderProducts: [],
    cohortPlaceholder:
      locale === "he"
        ? "×§×•×”×•×¨×˜×•×ª ×¨×™×˜× ×©×Ÿ ×™×ª××œ×× ×” ×›×©×™×¦×˜×‘×¨ ×™×•×ª×¨ ×”×™×¡×˜×•×¨×™×™×ª ×”×–×ž× ×•×ª ×ž× ×•×¨×ž×œ×ª."
        : "Cohort retention modeling will populate once enough normalized order history is available."
  };
}

export async function getFounderSummaryInputs(): Promise<FounderSummaryInputs> {
  const [overview, profit] = await Promise.all([getOverviewPayload(), getProfitAnalyticsPayload()]);

  return {
    biggestRevenueMovers: overview.productPerformance.slice(0, 3).map((item) => `${item.productTitle} ${Math.round(item.revenue).toLocaleString()}`),
    biggestProfitMovers: profit.topProducts.slice(0, 3).map((item) => `${item.productTitle} ${Math.round(item.estimatedProfit).toLocaleString()}`),
    discountSpikes: overview.discounts.slice(0, 3).map((item) => `${item.code} ${item.orderCount}`),
    repeatRateChanges: [`${overview.kpis[2]?.value.toFixed(1) ?? "0.0"}%`],
    refundSpikes: [`${overview.kpis[5]?.value.toFixed(1) ?? "0.0"}%`],
    bestProducts: profit.topProducts.slice(0, 3).map((item) => item.productTitle),
    worstProducts: profit.lowProducts.slice(0, 3).map((item) => item.productTitle)
  };
}

export async function getAppChromeData(storeId?: string) {
  const locale = await getAppLocale();
  const repository = await getAnalyticsRepository();
  const [store, range] = await Promise.all([repository.getStore(storeId), getReportingDateRangeSelection(locale)]);

  return {
    store,
    controls: {
      dateRangeLabel: range.label,
      comparisonLabel: range.comparison.label,
      startDate: range.startInput,
      endDate: range.endInput,
      preset: range.preset,
      comparison: {
        mode: range.comparison.mode,
        enabled: range.comparison.enabled,
        startDate: range.comparison.startInput,
        endDate: range.comparison.endInput,
        label: range.comparison.label
      }
    }
  };
}
