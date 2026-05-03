import { getDb, withOptionalDb } from "@/lib/server/db";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { createShopifyClient } from "@/lib/shopify/client";
import { COLLECTIONS_QUERY, COLLECTION_PRODUCTS_PAGE_QUERY } from "@/lib/shopify/queries/collections";
import { CUSTOMERS_QUERY } from "@/lib/shopify/queries/customers";
import { ORDERS_QUERY } from "@/lib/shopify/queries/orders";
import { PRODUCTS_QUERY } from "@/lib/shopify/queries/products";
import { SHOP_QUERY } from "@/lib/shopify/queries/shop";
import { mapCustomerNode, mapOrderNode, mapProductNode, mapShopMetadata } from "@/lib/shopify/mappers/shopify-mappers";
import { getStoredShopifyCredentials } from "@/lib/services/shopify-connection-service";
import type { SyncMode, SyncRunSummary } from "@/lib/domain/types";

const STALE_SYNC_THRESHOLD_MS = 20 * 60 * 1000;
const STALE_SYNC_ERROR_MESSAGE = "Previous sync was interrupted before completion.";
const SUPERSEDED_SYNC_ERROR_MESSAGE = "This sync was closed after another sync completed for the store.";
const ACTIVE_SYNC_ERROR_MESSAGE = "A Shopify sync is already running for this store. Wait for it to finish before starting another one.";

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

async function reconcileRunningSyncRuns(storeId: string) {
  const db = getDb();
  const connection = await db.shopifyConnection.findUnique({
    where: { storeId },
    select: { syncStatus: true }
  });
  const runningRuns = await db.syncRun.findMany({
    where: {
      storeId,
      status: "running"
    },
    orderBy: { startedAt: "asc" }
  });

  if (!runningRuns.length) {
    return [];
  }

  const now = Date.now();
  const storeStillRunning = connection?.syncStatus === "running";
  const staleRuns = runningRuns.filter((run: any) => {
    if (!storeStillRunning) {
      return true;
    }

    return now - run.startedAt.getTime() > STALE_SYNC_THRESHOLD_MS;
  });
  const activeRuns = runningRuns.filter((run: any) => now - run.startedAt.getTime() <= STALE_SYNC_THRESHOLD_MS);

  if (staleRuns.length) {
    const staleRunIds = staleRuns.map((run: any) => run.id);
    const staleMessage = storeStillRunning ? STALE_SYNC_ERROR_MESSAGE : SUPERSEDED_SYNC_ERROR_MESSAGE;
    await db.syncRun.updateMany({
      where: { id: { in: staleRunIds } },
      data: {
        status: "error",
        errorMessage: staleMessage,
        completedAt: new Date()
      }
    });

    if (!activeRuns.length && storeStillRunning) {
      await db.shopifyConnection.update({
        where: { storeId },
        data: {
          syncStatus: "error",
          lastSyncError: STALE_SYNC_ERROR_MESSAGE
        }
      });
    }
  }

  return storeStillRunning ? activeRuns : [];
}

async function ensureSyncCanStart(storeId: string) {
  const activeRuns = await reconcileRunningSyncRuns(storeId);
  if (activeRuns.length) {
    throw new AppError(ACTIVE_SYNC_ERROR_MESSAGE, 409);
  }
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

function stripGid(gid?: string | null) {
  if (!gid) return null;
  return gid.split("/").pop() ?? gid;
}

export async function syncCollections(storeId: string) {
  const db = getDb();
  const store = await db.store.findUnique({ where: { id: storeId } });
  if (!store) throw new AppError("Store not found.", 404);

  const credentials = await getStoredShopifyCredentials(storeId);
  const client = createShopifyClient(credentials);

  // Build a lookup from shopify product id -> internal product id (for membership rows)
  const products = await db.product.findMany({
    where: { storeId },
    select: { id: true, shopifyProductId: true }
  });
  const productLookup = new Map(products.map((p: { id: string; shopifyProductId: string }) => [p.shopifyProductId, p.id]));

  let collectionsFetched = 0;
  let collectionsUpdated = 0;
  let membershipsCreated = 0;
  let cursor: string | null = null;

  do {
    const page: any = await (client as any).request(COLLECTIONS_QUERY, { cursor });
    const edges = page?.collections?.edges ?? [];
    cursor = page?.collections?.pageInfo?.hasNextPage
      ? page?.collections?.pageInfo?.endCursor ?? null
      : null;

    for (const edge of edges) {
      const node = edge.node;
      const shopifyCollectionId = stripGid(node.id);
      if (!shopifyCollectionId) continue;
      const isAutomatic = Boolean(node.ruleSet?.rules?.length);

      const collection = await db.shopifyCollection.upsert({
        where: {
          storeId_shopifyCollectionId: { storeId, shopifyCollectionId }
        },
        update: {
          title: node.title ?? "Untitled",
          handle: node.handle ?? "",
          isAutomatic,
          productsCount: node.productsCount?.count ?? 0,
          updatedAt: node.updatedAt ? new Date(node.updatedAt) : new Date()
        },
        create: {
          storeId,
          shopifyCollectionId,
          title: node.title ?? "Untitled",
          handle: node.handle ?? "",
          isAutomatic,
          productsCount: node.productsCount?.count ?? 0,
          updatedAt: node.updatedAt ? new Date(node.updatedAt) : new Date()
        }
      });
      collectionsFetched += 1;
      collectionsUpdated += 1;

      // Collect all member product ids for this collection (paginate if needed)
      const memberShopifyIds: string[] = [];
      const initial = node.products?.edges ?? [];
      for (const productEdge of initial) {
        const pid = stripGid(productEdge.node?.id);
        if (pid) memberShopifyIds.push(pid);
      }

      let membersCursor: string | null = node.products?.pageInfo?.hasNextPage
        ? node.products?.pageInfo?.endCursor ?? null
        : null;
      while (membersCursor) {
        const more: any = await (client as any).request(COLLECTION_PRODUCTS_PAGE_QUERY, {
          collectionId: node.id,
          cursor: membersCursor
        });
        const moreEdges = more?.collection?.products?.edges ?? [];
        for (const me of moreEdges) {
          const pid = stripGid(me.node?.id);
          if (pid) memberShopifyIds.push(pid);
        }
        membersCursor = more?.collection?.products?.pageInfo?.hasNextPage
          ? more?.collection?.products?.pageInfo?.endCursor ?? null
          : null;
      }

      // Replace the membership set for this collection
      await db.productCollectionMembership.deleteMany({
        where: { storeId, collectionId: collection.id }
      });
      const memberInternalIds = memberShopifyIds
        .map((sid) => productLookup.get(sid))
        .filter((id): id is string => Boolean(id));

      if (memberInternalIds.length) {
        await db.productCollectionMembership.createMany({
          data: memberInternalIds.map((productId) => ({
            storeId,
            productId,
            collectionId: collection.id
          })),
          skipDuplicates: true
        });
        membershipsCreated += memberInternalIds.length;
      }
    }
  } while (cursor);

  return { fetched: collectionsFetched, updated: collectionsUpdated, memberships: membershipsCreated };
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
  await ensureSyncCanStart(storeId);

  const syncRun = await startSyncRun(storeId, "initial", null);
  await setConnectionSyncState(storeId, "running");

  try {
    await syncStoreMetadata(storeId);
    const products = await syncProducts(storeId, null);
    const collections = await syncCollections(storeId).catch((err) => {
      console.error("Collection sync failed; continuing without collections.", err);
      return { fetched: 0, updated: 0, memberships: 0 };
    });
    const customers = await syncCustomers(storeId, null);
    const orders = await syncOrders(storeId, null);

    const result = await finishSyncRun(syncRun.id, {
      status: "success",
      errorMessage: null,
      recordsCreated: products.created + customers.created + orders.created,
      recordsUpdated: products.updated + customers.updated + orders.updated + collections.updated,
      recordsFailed: 0,
      detailsJson: {
        products,
        collections,
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
  await ensureSyncCanStart(storeId);

  const connection = await db.shopifyConnection.findUnique({ where: { storeId } });
  const syncFrom = connection?.lastSuccessfulSyncAt ?? connection?.lastSyncAt ?? null;
  const syncRun = await startSyncRun(storeId, "incremental", syncFrom);
  await setConnectionSyncState(storeId, "running");

  try {
    await syncStoreMetadata(storeId);
    const products = await syncProducts(storeId, syncFrom);
    const collections = await syncCollections(storeId).catch((err) => {
      console.error("Collection sync failed; continuing without collections.", err);
      return { fetched: 0, updated: 0, memberships: 0 };
    });
    const customers = await syncCustomers(storeId, syncFrom);
    const orders = await syncOrders(storeId, syncFrom);

    const result = await finishSyncRun(syncRun.id, {
      status: "success",
      errorMessage: null,
      recordsCreated: products.created + customers.created + orders.created,
      recordsUpdated: products.updated + customers.updated + orders.updated + collections.updated,
      recordsFailed: 0,
      detailsJson: {
        syncFrom: syncFrom?.toISOString() ?? null,
        products,
        collections,
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
  const storeRecord: any = await withOptionalDb(
    (db) =>
      storeId
        ? db.store.findUnique({ where: { id: storeId }, include: { connection: true } })
        : db.store.findFirst({ where: { connected: true, connection: { isNot: null } }, include: { connection: true }, orderBy: { updatedAt: "desc" } }),
    null
  );

  if (!storeRecord) {
    return { connection: null, recentRuns: [] };
  }

  await reconcileRunningSyncRuns(storeRecord.id);

  const store: any = await withOptionalDb(
    (db) =>
      db.store.findUnique({
        where: { id: storeRecord.id },
        include: { connection: true }
      }),
    storeRecord
  );

  const runs: any[] = await withOptionalDb(
    (db) =>
      db.syncRun.findMany({
        where: { storeId: store.id },
        orderBy: { startedAt: "desc" },
        take: 10
      }),
    []
  );

  const orderedRuns = [...runs]
    .sort((left: any, right: any) => {
      const leftRunning = left.status === "running";
      const rightRunning = right.status === "running";
      if (leftRunning !== rightRunning) {
        return leftRunning ? -1 : 1;
      }

      const leftTime = (left.completedAt ?? left.startedAt).getTime();
      const rightTime = (right.completedAt ?? right.startedAt).getTime();
      return rightTime - leftTime;
    })
    .slice(0, 5);

  return {
    connection: {
      storeId: store.id,
      shopDomain: store.domain,
      connected: store.connected,
      syncStatus: store.connection?.syncStatus ?? "idle",
      lastSyncAt: store.connection?.lastSyncAt?.toISOString() ?? null,
      lastSyncError: store.connection?.lastSyncError ?? null
    },
    recentRuns: orderedRuns.map((run: any) => ({
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
