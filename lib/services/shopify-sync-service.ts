import { getDb } from "@/lib/server/db";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { createShopifyClient } from "@/lib/shopify/client";
import { CUSTOMERS_QUERY } from "@/lib/shopify/queries/customers";
import { ORDERS_QUERY } from "@/lib/shopify/queries/orders";
import { PRODUCTS_QUERY } from "@/lib/shopify/queries/products";
import { SHOP_QUERY } from "@/lib/shopify/queries/shop";
import { mapCustomerNode, mapOrderNode, mapProductNode, mapShopMetadata } from "@/lib/shopify/mappers/shopify-mappers";
import { getStoredShopifyCredentials } from "@/lib/services/shopify-connection-service";
import type { SyncMode, SyncRunSummary } from "@/lib/domain/types";

function buildUpdatedAfterQuery(updatedAfter?: Date | null) {
  return updatedAfter ? `updated_at:>=${updatedAfter.toISOString()}` : undefined;
}

async function startSyncRun(storeId: string, mode: SyncMode, syncFrom?: Date | null) {
  const db = getDb();
  return db.syncRun.create({
    data: {
      storeId,
      mode,
      status: "running",
      syncFrom: syncFrom ?? null
    }
  });
}

async function finishSyncRun(syncRunId: string, payload: Record<string, unknown>) {
  const db = getDb();
  return db.syncRun.update({
    where: { id: syncRunId },
    data: {
      ...payload,
      completedAt: new Date()
    }
  });
}

async function setConnectionSyncState(storeId: string, status: "running" | "success" | "error", error?: string | null) {
  const db = getDb();
  return db.shopifyConnection.update({
    where: { storeId },
    data: {
      syncStatus: status,
      lastSyncError: error ?? null,
      ...(status === "success" ? { lastSyncAt: new Date(), lastSuccessfulSyncAt: new Date() } : {})
    }
  });
}

export async function syncStoreMetadata(storeId: string) {
  const db = getDb();
  const credentials = await getStoredShopifyCredentials(storeId);
  const client = createShopifyClient(credentials);
  const data = await client.request<{ shop: any }>(SHOP_QUERY);
  const mapped = mapShopMetadata(data.shop);

  await db.store.update({
    where: { id: storeId },
    data: {
      name: mapped.name,
      domain: mapped.domain,
      shopifyShopId: mapped.shopifyShopId,
      currency: mapped.currency,
      timezone: mapped.timezone,
      planName: mapped.planName,
      connected: true
    }
  });
}

export async function syncProducts(storeId: string, updatedAfter?: Date | null) {
  const db = getDb();
  const store = await db.store.findUnique({ where: { id: storeId } });
  if (!store) throw new AppError("Store not found.", 404);

  const credentials = await getStoredShopifyCredentials(storeId);
  const client = createShopifyClient(credentials);
  const query = buildUpdatedAfterQuery(updatedAfter);
  const products = await client.paginateConnection<any, { products: any }>("products", PRODUCTS_QUERY, { query });
  let created = 0;
  let updated = 0;

  for (const productNode of products) {
    const mapped = mapProductNode(productNode, storeId);
    const product = await db.product.upsert({
      where: {
        storeId_shopifyProductId: {
          storeId,
          shopifyProductId: mapped.product.shopifyProductId
        }
      },
      update: mapped.product,
      create: mapped.product
    });

    updated += 1;

    for (const variant of mapped.variants) {
      await db.productVariant.upsert({
        where: {
          storeId_shopifyVariantId: {
            storeId,
            shopifyVariantId: variant.shopifyVariantId
          }
        },
        update: {
          ...variant,
          productId: product.id
        },
        create: {
          ...variant,
          productId: product.id
        }
      });
      created += 1;
    }
  }

  await db.shopifyConnection.update({
    where: { storeId },
    data: {
      lastProductsSyncAt: new Date()
    }
  });

  return { created, updated, fetched: products.length };
}

export async function syncCustomers(storeId: string, updatedAfter?: Date | null) {
  const db = getDb();
  const credentials = await getStoredShopifyCredentials(storeId);
  const client = createShopifyClient(credentials);
  const query = buildUpdatedAfterQuery(updatedAfter);
  const customers = await client.paginateConnection<any, { customers: any }>("customers", CUSTOMERS_QUERY, { query });
  let created = 0;
  let updated = 0;

  for (const customerNode of customers) {
    const mapped = mapCustomerNode(customerNode, storeId);
    await db.customer.upsert({
      where: {
        storeId_shopifyCustomerId: {
          storeId,
          shopifyCustomerId: mapped.shopifyCustomerId
        }
      },
      update: mapped,
      create: mapped
    });
    updated += 1;
    created += 1;
  }

  await db.shopifyConnection.update({
    where: { storeId },
    data: {
      lastCustomersSyncAt: new Date()
    }
  });

  return { created, updated, fetched: customers.length };
}

export async function syncOrders(storeId: string, updatedAfter?: Date | null) {
  const db = getDb();
  const store = await db.store.findUnique({ where: { id: storeId } });
  if (!store) throw new AppError("Store not found.", 404);

  const credentials = await getStoredShopifyCredentials(storeId);
  const client = createShopifyClient(credentials);
  const query = buildUpdatedAfterQuery(updatedAfter);
  const orders = await client.paginateConnection<any, { orders: any }>("orders", ORDERS_QUERY, { query });
  let created = 0;
  let updated = 0;

  for (const orderNode of orders) {
    const mapped = mapOrderNode(orderNode, storeId, Number(store.defaultCostRatio ?? 0.35));

    const customer = mapped.order.shopifyCustomerId
      ? await db.customer.findUnique({
          where: {
            storeId_shopifyCustomerId: {
              storeId,
              shopifyCustomerId: mapped.order.shopifyCustomerId
            }
          }
        })
      : null;

    const orderRecord = await db.order.upsert({
      where: {
        storeId_shopifyOrderId: {
          storeId,
          shopifyOrderId: mapped.order.shopifyOrderId
        }
      },
      update: {
        orderNumber: mapped.order.orderNumber,
        displayName: mapped.order.displayName,
        createdAt: mapped.order.createdAt,
        processedAt: mapped.order.processedAt,
        currency: mapped.order.currency,
        subtotalPrice: mapped.order.subtotalPrice,
        totalDiscounts: mapped.order.totalDiscounts,
        totalTax: mapped.order.totalTax,
        totalShipping: mapped.order.totalShipping,
        totalRefunds: mapped.order.totalRefunds,
        totalPrice: mapped.order.totalPrice,
        financialStatus: mapped.order.financialStatus,
        fulfillmentStatus: mapped.order.fulfillmentStatus,
        sourceName: mapped.order.sourceName,
        updatedAt: mapped.order.updatedAt,
        customerId: customer?.id ?? null
      },
      create: {
        storeId,
        shopifyOrderId: mapped.order.shopifyOrderId,
        orderNumber: mapped.order.orderNumber,
        displayName: mapped.order.displayName,
        createdAt: mapped.order.createdAt,
        processedAt: mapped.order.processedAt,
        currency: mapped.order.currency,
        subtotalPrice: mapped.order.subtotalPrice,
        totalDiscounts: mapped.order.totalDiscounts,
        totalTax: mapped.order.totalTax,
        totalShipping: mapped.order.totalShipping,
        totalRefunds: mapped.order.totalRefunds,
        totalPrice: mapped.order.totalPrice,
        financialStatus: mapped.order.financialStatus,
        fulfillmentStatus: mapped.order.fulfillmentStatus,
        sourceName: mapped.order.sourceName,
        updatedAt: mapped.order.updatedAt,
        customerId: customer?.id ?? null
      }
    });

    await db.orderLineItem.deleteMany({ where: { orderId: orderRecord.id } });
    await db.discountUsage.deleteMany({ where: { orderId: orderRecord.id } });
    await db.refund.deleteMany({ where: { orderId: orderRecord.id } });

    for (const lineItem of mapped.lineItems) {
      const product = lineItem.shopifyProductId
        ? await db.product.findUnique({
            where: {
              storeId_shopifyProductId: {
                storeId,
                shopifyProductId: lineItem.shopifyProductId
              }
            }
          })
        : null;
      const variant = lineItem.shopifyVariantId
        ? await db.productVariant.findUnique({
            where: {
              storeId_shopifyVariantId: {
                storeId,
                shopifyVariantId: lineItem.shopifyVariantId
              }
            }
          })
        : null;
      const overrideCost = product?.costOverrideAmount ? Number(product.costOverrideAmount) * lineItem.quantity : null;

      await db.orderLineItem.create({
        data: {
          storeId,
          orderId: orderRecord.id,
          productId: product?.id ?? null,
          variantId: variant?.id ?? null,
          shopifyLineItemId: lineItem.shopifyLineItemId,
          title: lineItem.title,
          quantity: lineItem.quantity,
          originalUnitPrice: lineItem.originalUnitPrice,
          discountedUnitPrice: lineItem.discountedUnitPrice,
          lineSubtotal: lineItem.lineSubtotal,
          lineDiscountAmount: lineItem.lineDiscountAmount,
          estimatedCostAmount: overrideCost ?? lineItem.estimatedCostAmount
        }
      });
    }

    for (const discount of mapped.discounts) {
      await db.discountUsage.create({
        data: {
          storeId,
          orderId: orderRecord.id,
          code: discount.code,
          amount: mapped.order.totalDiscounts / Math.max(mapped.discounts.length, 1)
        }
      });
    }

    for (const refund of mapped.refunds) {
      await db.refund.create({
        data: {
          storeId,
          orderId: orderRecord.id,
          shopifyRefundId: refund.shopifyRefundId,
          refundedAmount: refund.refundedAmount,
          refundedLineItemsAmount: refund.refundedLineItemsAmount,
          createdAt: refund.createdAt
        }
      });
    }

    updated += 1;
    created += 1;
  }

  await db.shopifyConnection.update({
    where: { storeId },
    data: {
      lastOrdersSyncAt: new Date()
    }
  });

  return { created, updated, fetched: orders.length };
}

export async function runFullInitialSync(storeId: string): Promise<SyncRunSummary> {
  const db = getDb();
  if (!db) throw new AppError("Database client is not available.", 500);

  const syncRun = await startSyncRun(storeId, "initial", null);
  await setConnectionSyncState(storeId, "running");

  try {
    await syncStoreMetadata(storeId);
    const [products, customers, orders] = await Promise.all([
      syncProducts(storeId, null),
      syncCustomers(storeId, null),
      syncOrders(storeId, null)
    ]);

    const result = await finishSyncRun(syncRun.id, {
      status: "success",
      recordsCreated: products.created + customers.created + orders.created,
      recordsUpdated: products.updated + customers.updated + orders.updated,
      recordsFailed: 0,
      detailsJson: {
        products,
        customers,
        orders
      }
    });

    await setConnectionSyncState(storeId, "success", null);

    return {
      id: result.id,
      mode: "initial",
      status: "success",
      startedAt: result.startedAt.toISOString(),
      completedAt: result.completedAt?.toISOString() ?? null,
      recordsCreated: result.recordsCreated,
      recordsUpdated: result.recordsUpdated,
      recordsFailed: result.recordsFailed,
      errorMessage: result.errorMessage
    };
  } catch (error) {
    const message = toErrorMessage(error);
    await finishSyncRun(syncRun.id, {
      status: "error",
      errorMessage: message
    });
    await setConnectionSyncState(storeId, "error", message);
    throw error;
  }
}

export async function runIncrementalSync(storeId: string): Promise<SyncRunSummary> {
  const db = getDb();
  if (!db) throw new AppError("Database client is not available.", 500);

  const connection = await db.shopifyConnection.findUnique({ where: { storeId } });
  const syncFrom = connection?.lastSuccessfulSyncAt ?? connection?.lastSyncAt ?? null;
  const syncRun = await startSyncRun(storeId, "incremental", syncFrom);
  await setConnectionSyncState(storeId, "running");

  try {
    await syncStoreMetadata(storeId);
    const [products, customers, orders] = await Promise.all([
      syncProducts(storeId, syncFrom),
      syncCustomers(storeId, syncFrom),
      syncOrders(storeId, syncFrom)
    ]);

    const result = await finishSyncRun(syncRun.id, {
      status: "success",
      recordsCreated: products.created + customers.created + orders.created,
      recordsUpdated: products.updated + customers.updated + orders.updated,
      recordsFailed: 0,
      detailsJson: {
        syncFrom: syncFrom?.toISOString() ?? null,
        products,
        customers,
        orders
      }
    });

    await setConnectionSyncState(storeId, "success", null);

    return {
      id: result.id,
      mode: "incremental",
      status: "success",
      startedAt: result.startedAt.toISOString(),
      completedAt: result.completedAt?.toISOString() ?? null,
      recordsCreated: result.recordsCreated,
      recordsUpdated: result.recordsUpdated,
      recordsFailed: result.recordsFailed,
      errorMessage: result.errorMessage
    };
  } catch (error) {
    const message = toErrorMessage(error);
    await finishSyncRun(syncRun.id, {
      status: "error",
      errorMessage: message
    });
    await setConnectionSyncState(storeId, "error", message);
    throw error;
  }
}

export async function getSyncStatus(storeId?: string) {
  const db = getDb();
  if (!db) return { connection: null, recentRuns: [] };

  const store = storeId
    ? await db.store.findUnique({ where: { id: storeId }, include: { connection: true } })
    : await db.store.findFirst({ where: { connected: true, connection: { isNot: null } }, include: { connection: true }, orderBy: { updatedAt: "desc" } });

  if (!store) {
    return { connection: null, recentRuns: [] };
  }

  const runs = await db.syncRun.findMany({
    where: { storeId: store.id },
    orderBy: { startedAt: "desc" },
    take: 5
  });

  return {
    connection: {
      storeId: store.id,
      shopDomain: store.domain,
      connected: store.connected,
      syncStatus: store.connection?.syncStatus ?? "idle",
      lastSyncAt: store.connection?.lastSyncAt?.toISOString() ?? null,
      lastSyncError: store.connection?.lastSyncError ?? null
    },
    recentRuns: runs.map((run: any) => ({
      id: run.id,
      mode: run.mode,
      status: run.status,
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
      recordsCreated: run.recordsCreated,
      recordsUpdated: run.recordsUpdated,
      recordsFailed: run.recordsFailed,
      errorMessage: run.errorMessage
    }))
  };
}
