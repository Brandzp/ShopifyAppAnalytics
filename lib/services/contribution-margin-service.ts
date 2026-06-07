// Contribution margin engine.
//
// Replaces "profit by revenue × margin guess" with a real per-order formula:
//
//   revenue            (Order.subtotalPrice)
// − discounts          (Order.totalDiscounts)
// − refunds            (Order.totalRefunds)
// − COGS               (Σ OrderLineItem.estimatedCostAmount)
// − affiliate cost     (Σ AffiliateAttribution.commissionAmount)
// = contribution margin
//
// Accuracy is tiered. We surface the tier on every number so the founder
// trusts what they see:
//
//   estimated   — uses Product.estimatedCost / fallback. NO per-order ad
//                 cost allocation. Affiliate commission included if BixGrow
//                 attribution rows exist. (Shipping margin = 0 in v1.)
//   attributed  — adds per-order Meta ad spend allocation via UTM-matched
//                 campaigns (next milestone — Tier 1 follow-up).
//   reconciled  — adds offline-sales reconciliation, tax adjustments, and
//                 manual overrides (further out).
//
// What's missing (the founder needs to see this explicitly):
//   - Products without a configured estimatedCost are listed as "missing
//     cost" so they don't silently inflate margin.
//   - Shipping & payment processor fees aren't subtracted yet.
//   - Refunds are taken at the order level; per-line-item refund cost
//     mapping is approximate.
//
// Returns both totals and a per-channel breakdown (joins to the
// channel-performance engine so the founder can see "Meta orders margin
// vs Email orders margin").

import { getDb } from "@/lib/server/db";

export type AccuracyTier = "estimated" | "attributed" | "reconciled";

export interface ContributionMarginTotals {
  revenue: number;
  discounts: number;
  refunds: number;
  cogs: number;
  affiliateCommission: number;
  // Tier 2/3 placeholders — present so the UI doesn't have to special-case
  // their absence. Always 0 in v1.
  attributedAdSpend: number;
  shippingNet: number;
  contributionMargin: number;
  contributionMarginRate: number; // margin / revenue
  ordersIncluded: number;
}

export interface ContributionMarginQuality {
  accuracy: AccuracyTier;
  // Counts that explain WHY the accuracy is estimated, not reconciled. The
  // UI surfaces these as "Missing: X products without cost / Y unmatched
  // refunds" so the founder can fix the gaps.
  productsMissingCost: number;
  ordersWithoutLineItemCost: number;
  // Confidence band shown next to the number. high = ≥90% of order
  // revenue has line-item-level cost; medium = 60-90%; low = <60%.
  costCoverage: number; // 0..1 — share of revenue with concrete COGS data
  confidence: "high" | "medium" | "low";
  // Human-readable "what's missing" notes for the founder.
  notes: { he: string; en: string };
}

export interface ContributionMarginReport {
  windowStart: string;
  windowEnd: string;
  totals: ContributionMarginTotals;
  quality: ContributionMarginQuality;
}

export interface BuildContributionMarginInput {
  storeId: string;
  start: Date;
  end: Date;
}

export async function buildContributionMargin(
  input: BuildContributionMarginInput
): Promise<ContributionMarginReport> {
  const db = getDb();

  // Pull each order's monetary fields + line items with COGS + affiliate
  // attribution commission in one go. Real Shopify stores have on the
  // order of 50-500 orders per week so this is fine in-memory.
  const orders = (await db.order.findMany({
    where: {
      storeId: input.storeId,
      createdAt: { gte: input.start, lte: input.end },
      cancelledAt: null,
      test: false
    },
    select: {
      id: true,
      subtotalPrice: true,
      totalDiscounts: true,
      totalRefunds: true,
      lineItems: {
        select: {
          productId: true,
          quantity: true,
          lineSubtotal: true,
          estimatedCostAmount: true
        }
      },
      affiliateAttributions: {
        select: { commissionAmount: true }
      }
    }
  })) as any[];

  let revenue = 0;
  let discounts = 0;
  let refunds = 0;
  let cogs = 0;
  let affiliateCommission = 0;

  let revenueWithCost = 0; // numerator for costCoverage
  let revenueTotalForCoverage = 0; // denominator
  let ordersWithoutLineItemCost = 0;

  // Track products that have at least one line item with zero estimatedCost.
  // We treat 0 as "missing" rather than "free" — Shopify defaults to 0 when
  // the merchant didn't set a cost. False positives are acceptable; missing
  // a real OOS is what we want to avoid.
  const productsMissingCost = new Set<string>();

  for (const o of orders) {
    revenue += Number(o.subtotalPrice ?? 0);
    discounts += Number(o.totalDiscounts ?? 0);
    refunds += Number(o.totalRefunds ?? 0);

    let orderCogs = 0;
    let orderHasAnyCost = false;
    let orderLineSubtotal = 0;
    for (const li of o.lineItems ?? []) {
      const cost = Number(li.estimatedCostAmount ?? 0);
      const lineRev = Number(li.lineSubtotal ?? 0);
      orderLineSubtotal += lineRev;
      if (cost > 0) {
        orderCogs += cost;
        orderHasAnyCost = true;
        revenueWithCost += lineRev;
      } else if (li.productId) {
        productsMissingCost.add(li.productId);
      }
    }
    revenueTotalForCoverage += orderLineSubtotal;
    if (!orderHasAnyCost) ordersWithoutLineItemCost += 1;
    cogs += orderCogs;

    for (const a of o.affiliateAttributions ?? []) {
      affiliateCommission += Number(a.commissionAmount ?? 0);
    }
  }

  const contributionMargin =
    revenue - discounts - refunds - cogs - affiliateCommission;
  const contributionMarginRate = revenue > 0 ? contributionMargin / revenue : 0;

  const costCoverage =
    revenueTotalForCoverage > 0 ? revenueWithCost / revenueTotalForCoverage : 0;
  const confidence: "high" | "medium" | "low" =
    costCoverage >= 0.9 ? "high" : costCoverage >= 0.6 ? "medium" : "low";

  const notes = buildQualityNotes({
    productsMissingCost: productsMissingCost.size,
    ordersWithoutLineItemCost,
    confidence,
    costCoveragePct: Math.round(costCoverage * 100)
  });

  return {
    windowStart: input.start.toISOString().slice(0, 10),
    windowEnd: input.end.toISOString().slice(0, 10),
    totals: {
      revenue,
      discounts,
      refunds,
      cogs,
      affiliateCommission,
      attributedAdSpend: 0, // populated in v2
      shippingNet: 0, // populated in v3
      contributionMargin,
      contributionMarginRate,
      ordersIncluded: orders.length
    },
    quality: {
      accuracy: "estimated",
      productsMissingCost: productsMissingCost.size,
      ordersWithoutLineItemCost,
      costCoverage,
      confidence,
      notes
    }
  };
}

function buildQualityNotes(input: {
  productsMissingCost: number;
  ordersWithoutLineItemCost: number;
  confidence: "high" | "medium" | "low";
  costCoveragePct: number;
}): { he: string; en: string } {
  const pieces: { he: string[]; en: string[] } = { he: [], en: [] };
  pieces.he.push(`רמת דיוק: מוערך · כיסוי COGS ${input.costCoveragePct}%.`);
  pieces.en.push(
    `Accuracy: estimated · ${input.costCoveragePct}% of revenue has concrete COGS.`
  );
  if (input.productsMissingCost > 0) {
    pieces.he.push(`חסר עלות ל-${input.productsMissingCost} מוצרים.`);
    pieces.en.push(`Missing exact COGS for ${input.productsMissingCost} products.`);
  }
  if (input.ordersWithoutLineItemCost > 0) {
    pieces.he.push(`${input.ordersWithoutLineItemCost} הזמנות ללא עלות פריט.`);
    pieces.en.push(
      `${input.ordersWithoutLineItemCost} orders without line-item cost.`
    );
  }
  pieces.he.push("לא כולל הקצאת הוצאת פרסום פר הזמנה (יגיע ב-Tier 2).");
  pieces.en.push(
    "Excludes per-order ad spend allocation (coming in Tier 2: attributed)."
  );
  return { he: pieces.he.join(" "), en: pieces.en.join(" ") };
}
