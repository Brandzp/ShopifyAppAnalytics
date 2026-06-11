// Daily trend context — enriches the revenue/profit chart with the
// "why did revenue move on this day?" story. For each day in the range:
//
//   - Top 3 products by revenue
//   - Active Meta Ads campaigns (with spend + ROAS)
//   - Instagram posts published that day
//   - Discount codes redeemed (sales events)
//
// One query per dimension, then we fan results out into a single
// per-day map. The chart hover tooltip and event-marker icons read from
// this map — the chart component itself stays presentation-only.

import { getDb } from "@/lib/server/db";

export interface DailyTrendContextItem {
  date: string; // YYYY-MM-DD
  topProducts: Array<{ title: string; revenue: number; units: number }>;
  campaigns: Array<{ name: string; spend: number; revenue: number; roas: number | null }>;
  posts: Array<{ creator: string; engagement: number; permalink: string | null; caption: string | null }>;
  discounts: Array<{ code: string; uses: number; amount: number }>;
}

export type DailyTrendContextMap = Record<string, DailyTrendContextItem>;

function toIsoDay(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  // YYYY-MM-DD in the **server timezone** — matches how the chart already
  // groups DailyMetric rows, so keys line up without timezone drift.
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function num(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function emptyDay(date: string): DailyTrendContextItem {
  return { date, topProducts: [], campaigns: [], posts: [], discounts: [] };
}

export async function getDailyTrendContext(
  storeId: string,
  startDate: Date,
  endDate: Date
): Promise<DailyTrendContextMap> {
  const db = getDb();
  const result: DailyTrendContextMap = {};

  // ── 1. Top 3 products per day by line-item revenue ────────────────
  // We pull all line items in the window then aggregate in JS — Prisma
  // doesn't expose window functions, and the row count is bounded by
  // (orders × items/order) which is small enough at the chart's range
  // (typically 30-90 days).
  try {
    const orders = (await db.order.findMany({
      where: {
        storeId,
        processedAt: { gte: startDate, lte: endDate },
        cancelledAt: null,
        test: false
      },
      select: {
        processedAt: true,
        lineItems: {
          select: { title: true, quantity: true, price: true }
        }
      }
    })) as Array<{
      processedAt: Date | null;
      lineItems: Array<{ title: string | null; quantity: number; price: any }>;
    }>;

    // perDay: day → product title → { revenue, units }
    const perDay = new Map<string, Map<string, { revenue: number; units: number }>>();
    for (const order of orders) {
      if (!order.processedAt) continue;
      const day = toIsoDay(order.processedAt);
      let dayMap = perDay.get(day);
      if (!dayMap) {
        dayMap = new Map();
        perDay.set(day, dayMap);
      }
      for (const li of order.lineItems) {
        const title = (li.title ?? "Unknown product").trim();
        const revenue = num(li.price) * num(li.quantity);
        const units = num(li.quantity);
        const existing = dayMap.get(title);
        if (existing) {
          existing.revenue += revenue;
          existing.units += units;
        } else {
          dayMap.set(title, { revenue, units });
        }
      }
    }
    for (const [day, products] of perDay.entries()) {
      const sorted = Array.from(products.entries())
        .map(([title, agg]) => ({ title, revenue: agg.revenue, units: agg.units }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 3);
      result[day] = { ...emptyDay(day), topProducts: sorted };
    }
  } catch (err) {
    console.error("[daily-trend-context] top products failed:", err);
  }

  // ── 2. Meta Ads campaigns active each day ─────────────────────────
  try {
    const insights = (await db.metaAdsCampaignInsight.findMany({
      where: {
        storeId,
        level: "campaign",
        dateStart: { gte: startDate, lte: endDate }
      },
      select: {
        dateStart: true,
        campaignName: true,
        spend: true,
        purchases: true,
        // Revenue isn't stored directly — Meta returns purchase_value, but
        // we don't always capture it. Approximate ROAS as purchases × AOV
        // if needed, but here we just show spend + purchase count.
      },
      orderBy: { spend: "desc" }
    })) as Array<{
      dateStart: Date;
      campaignName: string;
      spend: any;
      purchases: number;
    }>;

    // Per day, take top 5 campaigns by spend
    const perDay = new Map<
      string,
      Array<{ name: string; spend: number; revenue: number; roas: number | null }>
    >();
    for (const ins of insights) {
      const day = toIsoDay(ins.dateStart);
      const spend = num(ins.spend);
      if (spend <= 0) continue;
      const list = perDay.get(day) ?? [];
      list.push({
        name: ins.campaignName,
        spend,
        revenue: 0, // not currently stored
        roas: null
      });
      perDay.set(day, list);
    }
    for (const [day, list] of perDay.entries()) {
      list.sort((a, b) => b.spend - a.spend);
      const top5 = list.slice(0, 5);
      result[day] = { ...(result[day] ?? emptyDay(day)), campaigns: top5 };
    }
  } catch (err) {
    console.error("[daily-trend-context] campaigns failed:", err);
  }

  // ── 3. Instagram posts published each day ─────────────────────────
  try {
    const posts = (await db.creatorPost.findMany({
      where: {
        storeId,
        postedAt: { gte: startDate, lte: endDate }
      },
      select: {
        postedAt: true,
        caption: true,
        permalink: true,
        likeCount: true,
        commentsCount: true,
        viewCount: true,
        creatorProfile: { select: { displayName: true, handle: true } }
      },
      orderBy: { postedAt: "asc" }
    })) as Array<{
      postedAt: Date;
      caption: string | null;
      permalink: string | null;
      likeCount: number;
      commentsCount: number;
      viewCount: number;
      creatorProfile: { displayName: string | null; handle: string | null } | null;
    }>;

    const perDay = new Map<string, Array<DailyTrendContextItem["posts"][number]>>();
    for (const p of posts) {
      const day = toIsoDay(p.postedAt);
      const list = perDay.get(day) ?? [];
      list.push({
        creator: p.creatorProfile?.displayName ?? p.creatorProfile?.handle ?? "Unknown creator",
        engagement: p.likeCount + p.commentsCount + p.viewCount,
        permalink: p.permalink,
        caption: p.caption ? p.caption.slice(0, 90) : null
      });
      perDay.set(day, list);
    }
    for (const [day, list] of perDay.entries()) {
      list.sort((a, b) => b.engagement - a.engagement);
      result[day] = { ...(result[day] ?? emptyDay(day)), posts: list.slice(0, 5) };
    }
  } catch (err) {
    console.error("[daily-trend-context] posts failed:", err);
  }

  // ── 4. Discount codes redeemed each day ───────────────────────────
  try {
    const usages = (await db.discountUsage.findMany({
      where: { storeId, order: { processedAt: { gte: startDate, lte: endDate } } },
      select: {
        code: true,
        amount: true,
        order: { select: { processedAt: true } }
      }
    })) as Array<{
      code: string;
      amount: any;
      order: { processedAt: Date | null };
    }>;

    // Aggregate by day → code → { uses, totalAmount }
    const perDay = new Map<string, Map<string, { uses: number; amount: number }>>();
    for (const u of usages) {
      if (!u.order.processedAt) continue;
      const day = toIsoDay(u.order.processedAt);
      let dayMap = perDay.get(day);
      if (!dayMap) {
        dayMap = new Map();
        perDay.set(day, dayMap);
      }
      const existing = dayMap.get(u.code);
      const amount = num(u.amount);
      if (existing) {
        existing.uses += 1;
        existing.amount += amount;
      } else {
        dayMap.set(u.code, { uses: 1, amount });
      }
    }
    for (const [day, codeMap] of perDay.entries()) {
      const codes = Array.from(codeMap.entries())
        .map(([code, agg]) => ({ code, uses: agg.uses, amount: agg.amount }))
        .sort((a, b) => b.uses - a.uses)
        .slice(0, 5);
      result[day] = { ...(result[day] ?? emptyDay(day)), discounts: codes };
    }
  } catch (err) {
    console.error("[daily-trend-context] discounts failed:", err);
  }

  return result;
}
