import crypto from "node:crypto";
import { getDb } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import { resolveOrCreateBaseStore } from "@/lib/services/creator-admin-service";

function hashInput(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function getStoreOrThrow(storeId?: string) {
  const db = getDb();
  if (!db) throw new AppError("Database client is not available.", 500);
  const store = storeId
    ? await db.store.findUnique({ where: { id: storeId } })
    : await resolveOrCreateBaseStore();
  if (!store) throw new AppError("Store was not found.", 404);
  return { db, store };
}

export async function createAffiliateRedirectSession(input: {
  storeId?: string;
  affiliateCode: string;
  couponCode?: string | null;
  destinationPath?: string;
  destinationUrl?: string;
  sourcePlatform?: string | null;
  sourceUrl?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  visitorToken?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const { db, store } = await getStoreOrThrow(input.storeId);
  const affiliate = await db.affiliateMember?.findFirst({ where: { storeId: store.id, affiliateCode: input.affiliateCode } });
  if (!affiliate) throw new AppError("Affiliate was not found for the redirect link.", 404);

  const clickId = crypto.randomUUID();
  const destinationUrl = input.destinationUrl ?? `https://${store.domain}${input.destinationPath ?? "/"}`;

  if (db.attributionSession) {
    await db.attributionSession.create({
      data: {
        storeId: store.id,
        affiliateMemberId: affiliate.id,
        clickId,
        visitorToken: input.visitorToken ?? null,
        sourcePlatform: input.sourcePlatform ?? null,
        sourceUrl: input.sourceUrl ?? null,
        destinationUrl,
        landingPath: input.destinationPath ?? "/",
        couponCode: input.couponCode ?? null,
        affiliateCode: affiliate.affiliateCode,
        utmSource: input.utmSource ?? null,
        utmMedium: input.utmMedium ?? null,
        utmCampaign: input.utmCampaign ?? null,
        ipHash: input.ipAddress ? hashInput(input.ipAddress) : null,
        userAgent: input.userAgent ?? null
      }
    });
  }

  return {
    clickId,
    store,
    affiliate,
    destinationUrl
  };
}

export function buildTrackedDestinationUrl(input: {
  shopDomain: string;
  destinationPath?: string;
  destinationUrl?: string;
  couponCode?: string | null;
  affiliateCode: string;
  clickId: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
}) {
  const baseDestination = input.destinationUrl ?? `https://${input.shopDomain}${input.destinationPath ?? "/"}`;
  const url = new URL(baseDestination);
  url.searchParams.set("ref", input.affiliateCode);
  url.searchParams.set("agent_click_id", input.clickId);
  if (input.couponCode) url.searchParams.set("coupon", input.couponCode);
  if (input.utmSource) url.searchParams.set("utm_source", input.utmSource);
  if (input.utmMedium) url.searchParams.set("utm_medium", input.utmMedium);
  if (input.utmCampaign) url.searchParams.set("utm_campaign", input.utmCampaign);
  return url.toString();
}

export async function getAttributionCoverageSignals(storeId?: string) {
  const { db, store } = await getStoreOrThrow(storeId);
  const sessions = db.attributionSession ? await db.attributionSession.findMany({ where: { storeId: store.id, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } }).catch(() => []) : [];
  const webhooks = db.webhookEvent ? await db.webhookEvent.findMany({ where: { storeId: store.id, platform: "shopify", createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } }).catch(() => []) : [];

  const totalSessions = sessions?.length ?? 0;
  const convertedSessions = (sessions ?? []).filter((session: any) => session.convertedAt).length;
  const healthyWebhooks = (webhooks ?? []).filter((event: any) => event.status === "processed").length;
  const webhookFailures = (webhooks ?? []).filter((event: any) => event.status === "error").length;

  const sessionMatchRate = totalSessions ? convertedSessions / totalSessions : 0.45;
  const webhookHealthRate = healthyWebhooks + webhookFailures > 0 ? healthyWebhooks / (healthyWebhooks + webhookFailures) : 0.65;
  const overallConfidence = Math.min(0.97, Math.max(0.35, sessionMatchRate * 0.55 + webhookHealthRate * 0.45));

  return {
    totalSessions,
    convertedSessions,
    sessionMatchRate,
    webhookHealthRate,
    overallConfidence
  };
}
