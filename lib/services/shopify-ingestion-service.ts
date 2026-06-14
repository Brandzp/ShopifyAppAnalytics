import { runFullInitialSync, runIncrementalSync, syncCustomers, syncOrders, syncProducts, syncStoreMetadata } from "@/lib/services/shopify-sync-service";
import { getDb } from "@/lib/server/db";
import { getStoredShopifyCredentials } from "@/lib/services/shopify-connection-service";
import { registerOrderWebhooks } from "@/lib/services/shopify-oauth-service";

/**
 * Register the order webhooks for an ALREADY-connected store (e.g. to backfill
 * webhooks on a connection that was created before SA-HIGH-01, or to retry a
 * registration that previously failed). The OAuth install/callback flow itself
 * registers webhooks automatically in persistOauthConnection(); this entry point
 * lets the app (re)register them on demand for an existing connection.
 *
 * Best-effort: registerOrderWebhooks never throws. Returns a small status
 * object describing what happened.
 */
export async function startShopifyOAuthPlaceholder(storeDomain: string) {
  const db = getDb();
  if (!db) {
    return { status: "db_unavailable", storeDomain } as const;
  }

  const store = await db.store.findUnique({ where: { domain: storeDomain } });
  if (!store) {
    return { status: "store_not_found", storeDomain } as const;
  }

  let credentials: { shopDomain: string; adminAccessToken: string };
  try {
    credentials = await getStoredShopifyCredentials(store.id);
  } catch {
    return { status: "not_connected", storeDomain } as const;
  }

  const result = await registerOrderWebhooks({
    shopDomain: credentials.shopDomain,
    accessToken: credentials.adminAccessToken
  });

  if (result.webhookIds.length > 0) {
    await db.shopifyConnection
      .update({
        where: { storeId: store.id },
        data: { webhookIds: result.webhookIds, webhooksRegisteredAt: new Date() }
      })
      .catch(() => undefined);
  } else if (result.registered > 0) {
    await db.shopifyConnection
      .update({ where: { storeId: store.id }, data: { webhooksRegisteredAt: new Date() } })
      .catch(() => undefined);
  }

  return {
    status: result.failed === 0 ? "ok" : "partial",
    storeDomain,
    registered: result.registered,
    failed: result.failed,
    webhookIds: result.webhookIds
  } as const;
}

export async function runShopifyAdminIngestionPlaceholder(storeId: string) {
  return runFullInitialSync(storeId);
}

export async function syncProductCostsPlaceholder(storeId: string) {
  // TODO: Integrate product cost inputs from ERP, spreadsheets, or explicit SKU cost settings.
  return {
    status: "not_implemented",
    storeId
  } as const;
}

export {
  runFullInitialSync,
  runIncrementalSync,
  syncCustomers,
  syncOrders,
  syncProducts,
  syncStoreMetadata
};
