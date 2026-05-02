import { runFullInitialSync, runIncrementalSync, syncCustomers, syncOrders, syncProducts, syncStoreMetadata } from "@/lib/services/shopify-sync-service";

export async function startShopifyOAuthPlaceholder(storeDomain: string) {
  // TODO: Implement OAuth install flow for public app distribution and webhook registration.
  return {
    status: "not_implemented",
    storeDomain
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
