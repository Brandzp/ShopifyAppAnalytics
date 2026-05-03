import { getDb, withOptionalDb } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";
import { createShopifyClient, resolveShopifyAdminAccessToken } from "@/lib/shopify/client";
import { SHOP_QUERY } from "@/lib/shopify/queries/shop";
import { normalizeShopDomain, validateOptionalAdminAccessToken } from "@/lib/shopify/validators";
import { mapShopMetadata } from "@/lib/shopify/mappers/shopify-mappers";
import type { ShopifyConnectionSummary } from "@/lib/domain/types";
import type { ShopifyCredentialInput } from "@/lib/shopify/types";

const CLIENT_CREDENTIALS_SENTINEL = "client_credentials";

export async function testShopifyConnection(input: ShopifyCredentialInput) {
  const shopDomain = normalizeShopDomain(input.shopDomain);
  const adminAccessToken = validateOptionalAdminAccessToken(input.adminAccessToken);
  const resolved = await resolveShopifyAdminAccessToken({ shopDomain, adminAccessToken });
  const client = createShopifyClient({ shopDomain, adminAccessToken: resolved.adminAccessToken });
  const data = await client.request<{ shop: any }>(SHOP_QUERY);
  const mapped = mapShopMetadata(data.shop);

  return {
    ok: true,
    authSource: resolved.source,
    storePreview: mapped
  };
}

export async function saveShopifyCredentials(input: ShopifyCredentialInput) {
  const db = getDb();
  if (!db) {
    throw new AppError("Database client is not available. Generate Prisma client and try again.", 500);
  }

  const tested = await testShopifyConnection(input);
  const shopDomain = normalizeShopDomain(input.shopDomain);
  const adminAccessToken = validateOptionalAdminAccessToken(input.adminAccessToken);
  const tokenToStore = adminAccessToken ?? CLIENT_CREDENTIALS_SENTINEL;
  const encryptedToken = encryptSecret(tokenToStore);
  const tokenLastFour = adminAccessToken ? adminAccessToken.slice(-4) : "oauth";

  const store = await db.store.upsert({
    where: { domain: shopDomain },
    update: {
      name: tested.storePreview.name,
      shopifyShopId: tested.storePreview.shopifyShopId,
      currency: tested.storePreview.currency,
      timezone: tested.storePreview.timezone,
      planName: tested.storePreview.planName,
      connected: true
    },
    create: {
      domain: shopDomain,
      name: tested.storePreview.name,
      shopifyShopId: tested.storePreview.shopifyShopId,
      currency: tested.storePreview.currency,
      timezone: tested.storePreview.timezone,
      planName: tested.storePreview.planName,
      connected: true
    }
  });

  await db.shopifyConnection.upsert({
    where: { storeId: store.id },
    update: {
      shopDomain,
      adminAccessTokenEnc: encryptedToken,
      tokenLastFour,
      syncStatus: "idle",
      lastSyncError: null
    },
    create: {
      storeId: store.id,
      shopDomain,
      adminAccessTokenEnc: encryptedToken,
      tokenLastFour
    }
  });

  return {
    ok: true,
    authSource: tested.authSource,
    storeId: store.id
  };
}

export async function getStoredShopifyCredentials(storeId: string) {
  const db = getDb();
  if (!db) throw new AppError("Database client is not available.", 500);

  const connection = await db.shopifyConnection.findUnique({
    where: { storeId }
  });

  if (!connection) {
    throw new AppError("Shopify connection not found for this store.", 404);
  }

  const decrypted = decryptSecret(connection.adminAccessTokenEnc);
  const adminAccessToken = decrypted === CLIENT_CREDENTIALS_SENTINEL
    ? (await resolveShopifyAdminAccessToken({ shopDomain: connection.shopDomain })).adminAccessToken
    : decrypted;

  return {
    shopDomain: connection.shopDomain,
    adminAccessToken,
    apiVersion: connection.apiVersion
  };
}

export async function getShopifyConnectionSummary(storeId?: string): Promise<ShopifyConnectionSummary | null> {
  const store: any = await withOptionalDb(
    (db) =>
      storeId
        ? db.store.findUnique({ where: { id: storeId }, include: { connection: true } })
        : db.store.findFirst({ where: { connected: true, connection: { isNot: null } }, include: { connection: true }, orderBy: { updatedAt: "desc" } }),
    null
  );

  if (!store) return null;

  return {
    shopDomain: store.domain,
    connected: Boolean(store.connected && store.connection),
    apiVersion: store.connection?.apiVersion,
    tokenLastFour: store.connection?.tokenLastFour,
    syncStatus: (store.connection?.syncStatus ?? "idle") as ShopifyConnectionSummary["syncStatus"],
    lastSyncAt: store.connection?.lastSyncAt?.toISOString() ?? null,
    lastSyncError: store.connection?.lastSyncError ?? null
  };
}
