import crypto from "node:crypto";
import { getDb } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";

const safeString = (value: unknown) => (typeof value === "string" ? value : null);

const extractQueryValue = (urlLike: string | null | undefined, key: string) => {
  if (!urlLike) return null;
  try {
    const normalized = urlLike.startsWith("http") ? urlLike : `https://placeholder.local${urlLike.startsWith("/") ? urlLike : `/${urlLike}`}`;
    return new URL(normalized).searchParams.get(key);
  } catch {
    return null;
  }
};

const extractNoteAttribute = (payload: any, key: string) => {
  const match = Array.isArray(payload?.note_attributes) ? payload.note_attributes.find((item: any) => item?.name === key || item?.key === key) : null;
  return match?.value ?? null;
};

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
    externalId: safeString(payload?.id) ?? String(payload?.id ?? ""),
    payload,
    status: "received"
  });

  try {
    const clickId = extractNoteAttribute(payload, "agent_click_id") ?? extractQueryValue(payload?.landing_site, "agent_click_id") ?? extractQueryValue(payload?.landing_site, "click_id") ?? extractQueryValue(payload?.landing_site, "ref") ?? extractQueryValue(payload?.landing_site, "bg_ref");
    const refCode = extractNoteAttribute(payload, "ref") ?? extractNoteAttribute(payload, "bg_ref") ?? extractQueryValue(payload?.landing_site, "ref") ?? extractQueryValue(payload?.landing_site, "bg_ref") ?? extractQueryValue(payload?.referring_site, "ref") ?? extractQueryValue(payload?.referring_site, "bg_ref");
    const couponCode = payload?.discount_codes?.[0]?.code ?? extractQueryValue(payload?.landing_site, "coupon") ?? extractNoteAttribute(payload, "coupon");

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
      const trackingMethod = clickId && couponCode ? "link_and_coupon" : clickId ? "link_only" : couponCode ? "coupon" : "unknown";

      await db.affiliateAttribution.upsert({
        where: { affiliateMemberId_orderId: { affiliateMemberId: affiliate.id, orderId: internalOrder?.id ?? null } },
        update: { attributionSessionId: session?.id ?? null, sourceType: clickId ? "link" : "coupon", trackingMethod, sourceUrl: safeString(payload?.landing_site) ?? safeString(payload?.referring_site), contentTitle: null, salesAmount, commissionAmount, ordersCount: 1, occurredAt: new Date(payload?.created_at ?? Date.now()) },
        create: { storeId: store.id, affiliateMemberId: affiliate.id, orderId: internalOrder?.id ?? null, attributionSessionId: session?.id ?? null, sourceType: clickId ? "link" : "coupon", trackingMethod, sourceUrl: safeString(payload?.landing_site) ?? safeString(payload?.referring_site), contentTitle: null, salesAmount, commissionAmount, ordersCount: 1, occurredAt: new Date(payload?.created_at ?? Date.now()) }
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
