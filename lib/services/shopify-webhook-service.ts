import crypto from "node:crypto";
import { getDb } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import {
  buildAffiliateTrackingMethod,
  extractTrackingNoteAttribute,
  extractTrackingQueryValue,
  resolveAffiliateSourcePlatform,
  safeTrackingString
} from "@/lib/services/affiliate-attribution-source";

export function verifyShopifyWebhookSignature(rawBody: string, signature: string | null) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) throw new AppError("SHOPIFY_WEBHOOK_SECRET is not configured.", 500);
  if (!signature) return false;
  const digest = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

export async function recordWebhookEvent(input: {
  storeId: string;
  platform: string;
  topic: string;
  externalId?: string | null;
  status?: string;
  payload: unknown;
  errorMessage?: string | null;
  processedAt?: string | null;
}) {
  const db = getDb();
  if (!db?.webhookEvent) return null;
  return db.webhookEvent.create({ data: { storeId: input.storeId, platform: input.platform, topic: input.topic, externalId: input.externalId ?? null, status: input.status ?? "received", payload: input.payload ?? {}, errorMessage: input.errorMessage ?? null, processedAt: input.processedAt ? new Date(input.processedAt) : null } });
}

async function updateWebhookEventStatus(webhookEventId: string | null, status: string, errorMessage?: string | null) {
  const db = getDb();
  if (!db?.webhookEvent || !webhookEventId) return;
  await db.webhookEvent.update({ where: { id: webhookEventId }, data: { status, errorMessage: errorMessage ?? null, processedAt: new Date() } });
}

export async function processShopifyOrderWebhook(shopDomain: string, payload: any, topic: string) {
  const db = getDb();
  if (!db) throw new AppError("Database client is not available.", 500);
  const store = await db.store.findUnique({ where: { domain: shopDomain } });
  if (!store) throw new AppError("Store was not found for the webhook shop domain.", 404);

  const webhookEvent = await recordWebhookEvent({
    storeId: store.id,
    platform: "shopify",
    topic,
    externalId: safeTrackingString(payload?.id) ?? String(payload?.id ?? ""),
    payload,
    status: "received"
  });

  try {
    const landingSite = safeTrackingString(payload?.landing_site);
    const referringSite = safeTrackingString(payload?.referring_site);
    const clickId = extractTrackingNoteAttribute(payload, "agent_click_id")
      ?? extractTrackingQueryValue(landingSite, "agent_click_id")
      ?? extractTrackingQueryValue(landingSite, "click_id");
    const bgRefCode = extractTrackingNoteAttribute(payload, "bg_ref")
      ?? extractTrackingQueryValue(landingSite, "bg_ref")
      ?? extractTrackingQueryValue(referringSite, "bg_ref");
    const refCode = extractTrackingNoteAttribute(payload, "ref")
      ?? bgRefCode
      ?? extractTrackingQueryValue(landingSite, "ref")
      ?? extractTrackingQueryValue(referringSite, "ref");
    const couponCode = payload?.discount_codes?.[0]?.code
      ?? extractTrackingQueryValue(landingSite, "coupon")
      ?? extractTrackingNoteAttribute(payload, "coupon");

    const session = clickId && db.attributionSession ? await db.attributionSession.findUnique({ where: { clickId } }).catch(() => null) : null;
    let affiliate = session?.affiliateMemberId && db.affiliateMember ? await db.affiliateMember.findUnique({ where: { id: session.affiliateMemberId } }).catch(() => null) : null;

    if (!affiliate && db.affiliateMember) {
      const filters = [couponCode ? { couponCode } : null, refCode ? { affiliateCode: String(refCode).toUpperCase() } : null].filter(Boolean);
      affiliate = filters.length ? await db.affiliateMember.findFirst({ where: { storeId: store.id, OR: filters } }).catch(() => null) : null;
    }

    if (affiliate && db.affiliateAttribution) {
      const internalOrder = db.order ? await db.order.findUnique({ where: { storeId_shopifyOrderId: { storeId: store.id, shopifyOrderId: String(payload?.id) } } }).catch(() => null) : null;
      const salesAmount = Number(payload?.current_total_price ?? payload?.total_price ?? 0);
      const commissionAmount = salesAmount * 0.1;
      const sourcePlatform = resolveAffiliateSourcePlatform({
        sourcePlatform: session?.sourcePlatform ?? null,
        sourceUrl: session?.sourceUrl ?? null,
        landingSite,
        referringSite,
        bgRefCode
      });
      const hasLinkSignal = Boolean(clickId || refCode);
      const trackingMethod = buildAffiliateTrackingMethod({
        hasClickSignal: hasLinkSignal,
        hasCouponSignal: Boolean(couponCode),
        sourcePlatform
      });
      const sourceType = hasLinkSignal ? "link" : "coupon";
      const sourceUrl = landingSite ?? referringSite;

      await db.affiliateAttribution.upsert({
        where: { affiliateMemberId_orderId: { affiliateMemberId: affiliate.id, orderId: internalOrder?.id ?? null } },
        update: { attributionSessionId: session?.id ?? null, sourceType, trackingMethod, sourceUrl, contentTitle: null, salesAmount, commissionAmount, ordersCount: 1, occurredAt: new Date(payload?.created_at ?? Date.now()) },
        create: { storeId: store.id, affiliateMemberId: affiliate.id, orderId: internalOrder?.id ?? null, attributionSessionId: session?.id ?? null, sourceType, trackingMethod, sourceUrl, contentTitle: null, salesAmount, commissionAmount, ordersCount: 1, occurredAt: new Date(payload?.created_at ?? Date.now()) }
      });

      if (session && db.attributionSession) {
        await db.attributionSession.update({ where: { id: session.id }, data: { convertedAt: new Date(payload?.created_at ?? Date.now()) } });
      }

      const rows = await db.affiliateAttribution.findMany({ where: { storeId: store.id, affiliateMemberId: affiliate.id } });
      const salesTotal = rows.reduce((sum: number, row: any) => sum + Number(row.salesAmount ?? 0), 0);
      const commissionTotal = rows.reduce((sum: number, row: any) => sum + Number(row.commissionAmount ?? 0), 0);
      const ordersTotal = rows.reduce((sum: number, row: any) => sum + Number(row.ordersCount ?? 0), 0);
      await db.affiliateMember.update({ where: { id: affiliate.id }, data: { salesTotal, commissionTotal, approvedBalance: commissionTotal, ordersTotal } });
    }

    await updateWebhookEventStatus(webhookEvent?.id ?? null, "processed");
    return { ok: true, storeId: store.id };
  } catch (error) {
    await updateWebhookEventStatus(webhookEvent?.id ?? null, "error", error instanceof Error ? error.message : "Webhook processing failed.");
    throw error;
  }
}
