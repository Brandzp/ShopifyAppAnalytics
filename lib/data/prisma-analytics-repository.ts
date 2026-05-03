import type { AnalyticsRepository } from "@/lib/domain/repository";
import type {
  Alert,
  CollectionPerformanceRow,
  Order,
  ProductStockRow,
  StockFlag,
  Store,
  Summary
} from "@/lib/domain/types";
import { withOptionalDb } from "@/lib/server/db";
import { toNumber } from "@/lib/server/numbers";
import { buildDailyMetrics, buildDiscountUsage, buildProductPerformance, buildRetentionSnapshot } from "@/lib/server/analytics";
import { pickAnalyticsDiscountCode, shouldIgnoreOrderForAnalytics } from "@/lib/server/analytics-order-rules";
import { getReportingDateRangeSelection } from "@/lib/server/reporting-date-range";

const DISCONNECTED_PREVIEW_STORE: Store = {
  id: "local-preview-store",
  name: "Shopify Profit Ops Preview",
  domain: "setup-required.local",
  currency: "USD",
  connected: false,
  timezone: "UTC",
  dateRangePreset: "30d",
  estimatedCostMode: "margin_profile",
  defaultCostRatio: 0.35
};

function mapStore(store: any): Store {
  return {
    id: store.id,
    name: store.name,
    domain: store.domain,
    currency: store.currency,
    connected: store.connected,
    timezone: store.timezone,
    planName: store.planName ?? undefined,
    dateRangePreset: store.dateRangePreset,
    estimatedCostMode: store.estimatedCostMode,
    defaultCostRatio: toNumber(store.defaultCostRatio)
  };
}

function mapOrders(records: any[]): Order[] {
  return records
    .filter((order) => !shouldIgnoreOrderForAnalytics(order))
    .map((order) => ({
      id: order.id,
      customerId: order.customerId,
      createdAt: order.createdAt.toISOString(),
      orderNumber: order.orderNumber,
      isRefunded: toNumber(order.totalRefunds) > 0,
      refundAmount: toNumber(order.totalRefunds),
      discountCode: pickAnalyticsDiscountCode(order.discountUsages?.map((discount: any) => discount.code) ?? []),
      totalPrice: toNumber(order.totalPrice),
      totalDiscounts: toNumber(order.totalDiscounts),
      lineItems: order.lineItems.map((item: any) => ({
        id: item.id,
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: item.quantity ? toNumber(item.lineSubtotal) / item.quantity : 0,
        discountAmount: toNumber(item.lineDiscountAmount),
        estimatedCost: toNumber(item.estimatedCostAmount)
      }))
    }));
}

function withAnalyticsOrderFilters(where: Record<string, unknown>) {
  return {
    AND: [
      where,
      {
        NOT: {
          AND: [
            { fulfillmentStatus: { equals: "FULFILLED", mode: "insensitive" } },
            { totalPrice: { gte: 0, lte: 20 } }
          ]
        }
      }
    ]
  };
}

function mapSummary(summary: any): Summary {
  return {
    id: summary.id,
    headline: summary.headline,
    generatedAt: summary.generatedAt.toISOString(),
    sections: Array.isArray(summary.contentJson) ? summary.contentJson : []
  };
}

function mapStoredAlert(alert: any): Alert {
  return {
    id: alert.id,
    severity: alert.severity,
    title: alert.title,
    explanation: alert.explanation,
    suggestedAction: alert.suggestedAction,
    periodLabel: alert.periodLabel,
    timestamp: alert.timestamp.toISOString()
  };
}

async function getConnectedStoreRecord(): Promise<any | null> {
  return withOptionalDb(
    (db) =>
      db.store.findFirst({
        where: { connected: true, connection: { isNot: null } },
        orderBy: { updatedAt: "desc" }
      }),
    null
  );
}

async function getStoreRecord(storeId?: string): Promise<any | null> {
  if (storeId) {
    return withOptionalDb((db) => db.store.findUnique({ where: { id: storeId } }), null);
  }

  return getConnectedStoreRecord();
}

async function getOrdersForRange(storeId: string, start: Date, end: Date): Promise<any[]> {
  return withOptionalDb(
    (db) =>
      db.order.findMany({
        where: withAnalyticsOrderFilters({
          storeId,
          createdAt: {
            gte: start,
            lte: end
          }
        }),
        include: {
          lineItems: true,
          discountUsages: true
        },
        orderBy: { createdAt: "asc" }
      }),
    []
  );
}

async function getCustomerOrderHistory(storeId: string): Promise<Map<string, string[]>> {
  return withOptionalDb(async (db) => {
    const orders = await db.order.findMany({
      where: withAnalyticsOrderFilters({ storeId, customerId: { not: null } }),
      select: { id: true, customerId: true, createdAt: true },
      orderBy: { createdAt: "asc" }
    });

    const history = new Map<string, string[]>();
    for (const order of orders) {
      if (!order.customerId) continue;
      const current = history.get(order.customerId) ?? [];
      current.push(order.id);
      history.set(order.customerId, current);
    }
    return history;
  }, () => new Map<string, string[]>());
}

async function getActiveRange() {
  const selection = await getReportingDateRangeSelection();
  return {
    current: { start: selection.start, end: selection.end },
    previous: { start: selection.comparison.start, end: selection.comparison.end }
  };
}

export const STOCK_FLAG_THRESHOLDS = { red: 20, yellow: 50 } as const;

export function classifyStock(quantity: number | null): StockFlag {
  if (quantity === null) return "unknown";
  if (quantity < STOCK_FLAG_THRESHOLDS.red) return "red";
  if (quantity < STOCK_FLAG_THRESHOLDS.yellow) return "yellow";
  return "green";
}

/**
 * For each product in the store, return every Shopify collection title it
 * belongs to (smart + manual collections, sorted alphabetically). Empty array
 * means the product has no collection memberships yet.
 */
async function buildProductCollectionsLookup(storeId: string): Promise<Map<string, string[]>> {
  const memberships = await withOptionalDb(
    (db) =>
      db.productCollectionMembership.findMany({
        where: { storeId },
        select: {
          productId: true,
          collection: { select: { title: true } }
        }
      }),
    [] as Array<{ productId: string; collection: { title: string } }>
  );

  const lookup = new Map<string, Set<string>>();
  for (const m of memberships) {
    const set = lookup.get(m.productId) ?? new Set<string>();
    set.add(m.collection.title);
    lookup.set(m.productId, set);
  }

  const result = new Map<string, string[]>();
  for (const [productId, titles] of lookup.entries()) {
    result.set(productId, Array.from(titles).sort((a, b) => a.localeCompare(b)));
  }
  return result;
}

/**
 * Sum variant inventoryQuantity per product. A product with all-null variants
 * gets `null` (unknown / not tracked). A product with at least one tracked
 * variant returns the sum of the tracked ones.
 */
async function buildProductStockLookup(storeId: string): Promise<
  Map<string, { quantity: number | null; variantCount: number }>
> {
  const variants = await withOptionalDb(
    (db) =>
      db.productVariant.findMany({
        where: { storeId },
        select: { productId: true, inventoryQuantity: true }
      }),
    [] as Array<{ productId: string; inventoryQuantity: number | null }>
  );

  const lookup = new Map<string, { quantity: number | null; variantCount: number }>();
  for (const variant of variants) {
    const entry = lookup.get(variant.productId) ?? { quantity: null, variantCount: 0 };
    entry.variantCount += 1;
    if (variant.inventoryQuantity !== null && variant.inventoryQuantity !== undefined) {
      entry.quantity = (entry.quantity ?? 0) + Number(variant.inventoryQuantity);
    }
    lookup.set(variant.productId, entry);
  }
  return lookup;
}

export const prismaAnalyticsRepository: AnalyticsRepository = {
  async getStore(storeId) {
    const store = await getStoreRecord(storeId);
    return store ? mapStore(store) : DISCONNECTED_PREVIEW_STORE;
  },

  async getProducts(storeId) {
    const store = await getStoreRecord(storeId);
    if (!store) return [];
    const products = await withOptionalDb((db) => db.product.findMany({ where: { storeId: store.id } }), []);
    return products.map((product: any) => ({
      id: product.id,
      title: product.title,
      handle: product.handle,
      collection: product.collection,
      vendor: product.vendor ?? undefined,
      productType: product.productType ?? undefined,
      price: toNumber(product.price),
      estimatedCost: toNumber(product.estimatedCost),
      costOverrideAmount: product.costOverrideAmount ? toNumber(product.costOverrideAmount) : null,
      marginProfile: product.marginProfile
    }));
  },

  async getCustomers(storeId) {
    const store = await getStoreRecord(storeId);
    if (!store) return [];
    const customers = await withOptionalDb((db) => db.customer.findMany({ where: { storeId: store.id } }), []);
    return customers.map((customer: any) => ({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      firstOrderDate: customer.firstOrderDate?.toISOString() ?? null,
      totalOrders: customer.totalOrders,
      lifetimeValue: toNumber(customer.lifetimeValue),
      isReturning: customer.isReturning
    }));
  },

  async getOrders(storeId) {
    const store = await getStoreRecord(storeId);
    if (!store) return [];
    const range = await getActiveRange();
    const orders = await getOrdersForRange(store.id, range.current.start, range.current.end);
    return mapOrders(orders);
  },

  async getDailyMetrics(storeId) {
    const store = await getStoreRecord(storeId);
    if (!store) return [];
    const range = await getActiveRange();
    const [orders, history] = await Promise.all([
      getOrdersForRange(store.id, range.current.start, range.current.end),
      getCustomerOrderHistory(store.id)
    ]);
    return buildDailyMetrics(mapOrders(orders), history);
  },

  async getPreviousPeriodMetrics(storeId) {
    const store = await getStoreRecord(storeId);
    if (!store) return [];
    const range = await getActiveRange();
    const [orders, history] = await Promise.all([
      getOrdersForRange(store.id, range.previous.start, range.previous.end),
      getCustomerOrderHistory(store.id)
    ]);
    return buildDailyMetrics(mapOrders(orders), history);
  },

  async getDiscountUsage(storeId) {
    const orders = await this.getOrders(storeId);
    return buildDiscountUsage(orders);
  },

  async getCollectionPerformance(storeId) {
    const store = await getStoreRecord(storeId);
    if (!store) return [];
    const range = await getActiveRange();
    const orderRecords = await getOrdersForRange(store.id, range.current.start, range.current.end);
    const orders = mapOrders(orderRecords);
    const products = await withOptionalDb((db) => db.product.findMany({ where: { storeId: store.id } }), []);
    const [stockLookup, collectionsLookup] = await Promise.all([
      buildProductStockLookup(store.id),
      buildProductCollectionsLookup(store.id)
    ]);
    const lookup = new Map<
      string,
      { title: string; collection: string; inventoryQuantity: number | null; collections: string[] }
    >(
      products.map((product: any) => [
        product.id as string,
        {
          title: product.title,
          collection: product.collection,
          inventoryQuantity: stockLookup.get(product.id as string)?.quantity ?? null,
          collections: collectionsLookup.get(product.id as string) ?? []
        }
      ])
    );
    const performance = buildProductPerformance(orders, lookup);

    // Prefer real Shopify collections (smart/manual) when memberships exist.
    // Fall back to the vendor/productType-based "collection" string on the Product row.
    const memberships = await withOptionalDb(
      (db) =>
        db.productCollectionMembership.findMany({
          where: { storeId: store.id },
          include: { collection: true }
        }),
      [] as Array<{ productId: string; collection: { id: string; title: string } }>
    );

    if (memberships.length > 0) {
      // Map productId -> [{ id, title }]
      const productToCollections = new Map<string, Array<{ id: string; title: string }>>();
      for (const m of memberships) {
        const arr = productToCollections.get(m.productId) ?? [];
        arr.push({ id: m.collection.id, title: m.collection.title });
        productToCollections.set(m.productId, arr);
      }

      const grouped = new Map<string, CollectionPerformanceRow>();
      for (const row of performance) {
        const productCollections = productToCollections.get(row.productId);
        if (productCollections && productCollections.length > 0) {
          // A product can belong to multiple collections — split contribution evenly so
          // we don't double-count revenue across them.
          const share = 1 / productCollections.length;
          for (const collection of productCollections) {
            const current = grouped.get(collection.id) ?? {
              collection: collection.title,
              revenue: 0,
              estimatedProfit: 0
            };
            current.revenue += row.revenue * share;
            current.estimatedProfit += row.estimatedProfit * share;
            grouped.set(collection.id, current);
          }
        } else {
          const key = `__uncategorized__:${row.collection || "Uncategorized"}`;
          const current = grouped.get(key) ?? {
            collection: row.collection || "Uncategorized",
            revenue: 0,
            estimatedProfit: 0
          };
          current.revenue += row.revenue;
          current.estimatedProfit += row.estimatedProfit;
          grouped.set(key, current);
        }
      }
      return Array.from(grouped.values()).sort((a, b) => b.revenue - a.revenue);
    }

    // Fallback: case-insensitive + whitespace-stripped bucket key on the vendor-based
    // "collection" string. "Incense Parfums" and "incenseparfums" collapse into one row.
    const buckets = new Map<
      string,
      { row: CollectionPerformanceRow; displayCounts: Map<string, number> }
    >();

    for (const row of performance) {
      const key = String(row.collection ?? "Uncategorized")
        .toLowerCase()
        .replace(/\s+/g, "");
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.row.revenue += row.revenue;
        bucket.row.estimatedProfit += row.estimatedProfit;
        bucket.displayCounts.set(row.collection, (bucket.displayCounts.get(row.collection) ?? 0) + 1);
      } else {
        const counts = new Map<string, number>();
        counts.set(row.collection, 1);
        buckets.set(key, {
          row: { collection: row.collection, revenue: row.revenue, estimatedProfit: row.estimatedProfit },
          displayCounts: counts
        });
      }
    }

    // Pick the most-used original casing per bucket (with length tie-break)
    for (const bucket of buckets.values()) {
      let bestName = bucket.row.collection;
      let bestCount = -1;
      for (const [name, count] of bucket.displayCounts.entries()) {
        if (
          count > bestCount ||
          (count === bestCount && name.length > bestName.length)
        ) {
          bestName = name;
          bestCount = count;
        }
      }
      bucket.row.collection = bestName;
    }

    return Array.from(buckets.values())
      .map((b) => b.row)
      .sort((a, b) => b.revenue - a.revenue);
  },

  async getProductStock(storeId): Promise<ProductStockRow[]> {
    const store = await getStoreRecord(storeId);
    if (!store) return [];
    const [stockLookup, collectionsLookup] = await Promise.all([
      buildProductStockLookup(store.id),
      buildProductCollectionsLookup(store.id)
    ]);
    // Only ACTIVE products belong in the restock queue. DRAFT and ARCHIVED
    // products aren't visible to customers, so flagging them as low-stock
    // would be noise. Case-insensitive in case Shopify ever changes the
    // casing convention.
    const products = await withOptionalDb(
      (db) =>
        db.product.findMany({
          where: {
            storeId: store.id,
            status: { equals: "ACTIVE", mode: "insensitive" }
          },
          select: {
            id: true,
            title: true,
            collection: true,
            vendor: true
          }
        }),
      [] as Array<{ id: string; title: string; collection: string; vendor: string | null }>
    );

    return products
      .map((product) => {
        const stock = stockLookup.get(product.id);
        const quantity = stock?.quantity ?? null;
        return {
          productId: product.id,
          productTitle: product.title,
          collection: product.collection,
          collections: collectionsLookup.get(product.id) ?? [],
          vendor: product.vendor ?? null,
          inventoryQuantity: quantity,
          variantCount: stock?.variantCount ?? 0,
          flag: classifyStock(quantity)
        };
      })
      .sort((a, b) => {
        // unknown last, otherwise lowest stock first
        const orderFlag = (f: StockFlag) => (f === "unknown" ? 99 : f === "red" ? 0 : f === "yellow" ? 1 : 2);
        const flagDiff = orderFlag(a.flag) - orderFlag(b.flag);
        if (flagDiff !== 0) return flagDiff;
        const aq = a.inventoryQuantity ?? Number.POSITIVE_INFINITY;
        const bq = b.inventoryQuantity ?? Number.POSITIVE_INFINITY;
        return aq - bq;
      });
  },

  async getAlerts(storeId) {
    const store = await getStoreRecord(storeId);
    if (!store) return [];
    const alerts = await withOptionalDb(
      (db) =>
        db.alert.findMany({
          where: { storeId: store.id },
          orderBy: { timestamp: "desc" }
        }),
      []
    );
    return alerts.map(mapStoredAlert);
  },

  async getSummaries(storeId) {
    const store = await getStoreRecord(storeId);
    if (!store) return [];
    const summaries = await withOptionalDb(
      (db) =>
        db.summary.findMany({
          where: { storeId: store.id },
          orderBy: { generatedAt: "desc" }
        }),
      []
    );
    return summaries.map(mapSummary);
  }
};

export async function hasPrismaAnalyticsData() {
  const store = await getConnectedStoreRecord();
  return Boolean(store);
}

export async function getRetentionAnalyticsFromDb() {
  const store = await getConnectedStoreRecord();
  if (!store) return null;
  const range = await getActiveRange();
  const [orders, history, allOrders, products] = await Promise.all([
    getOrdersForRange(store.id, range.current.start, range.current.end),
    getCustomerOrderHistory(store.id),
    withOptionalDb(
      (db) =>
        db.order.findMany({
          where: withAnalyticsOrderFilters({ storeId: store.id }),
          include: { lineItems: true, discountUsages: true },
          orderBy: { createdAt: "asc" }
        }),
      []
    ),
    withOptionalDb((db) => db.product.findMany({ where: { storeId: store.id } }), [])
  ]);
  const normalizedOrders = mapOrders(orders);
  const allNormalizedOrders = mapOrders(allOrders);
  const snapshot = buildRetentionSnapshot(normalizedOrders, history);

  const firstOrderProducts = new Map<string, number>();
  const secondOrderProducts = new Map<string, number>();
  const orderLookup = new Map<string, Order>(allNormalizedOrders.map((order) => [order.id, order]));
  const productLookup = new Map<string, string>(products.map((product: any) => [product.id as string, product.title as string]));

  for (const [, orderIds] of history.entries()) {
    const firstOrder = orderLookup.get(orderIds[0]);
    const secondOrder = orderLookup.get(orderIds[1]);

    firstOrder?.lineItems.forEach((item) => {
      const title = item.productId ? productLookup.get(item.productId) ?? "Unknown product" : "Unknown product";
      firstOrderProducts.set(title, (firstOrderProducts.get(title) ?? 0) + item.quantity);
    });

    secondOrder?.lineItems.forEach((item) => {
      const title = item.productId ? productLookup.get(item.productId) ?? "Unknown product" : "Unknown product";
      secondOrderProducts.set(title, (secondOrderProducts.get(title) ?? 0) + item.quantity);
    });
  }

  return {
    snapshot,
    dailyMetrics: buildDailyMetrics(normalizedOrders, history),
    firstOrderProducts: Array.from(firstOrderProducts.entries()).map(([title, orders]) => ({ title, orders })).sort((a, b) => b.orders - a.orders).slice(0, 5),
    secondOrderProducts: Array.from(secondOrderProducts.entries()).map(([title, orders]) => ({ title, orders })).sort((a, b) => b.orders - a.orders).slice(0, 5),
    cohortPlaceholder:
      "Cohort retention modeling is ready for a richer warehouse-backed view once webhooks and incremental customer event sync are in place."
  };
}

export async function getProfitAnalyticsFromDb() {
  const store = await getConnectedStoreRecord();
  if (!store) return null;
  const range = await getActiveRange();
  const [orders, products, stockLookup, collectionsLookup] = await Promise.all([
    getOrdersForRange(store.id, range.current.start, range.current.end),
    withOptionalDb((db) => db.product.findMany({ where: { storeId: store.id } }), []),
    buildProductStockLookup(store.id),
    buildProductCollectionsLookup(store.id)
  ]);
  const normalizedOrders = mapOrders(orders);
  const productLookup = new Map<
    string,
    { title: string; collection: string; inventoryQuantity: number | null; collections: string[] }
  >(
    products.map((product: any) => [
      product.id as string,
      {
        title: product.title,
        collection: product.collection,
        inventoryQuantity: stockLookup.get(product.id as string)?.quantity ?? null,
        collections: collectionsLookup.get(product.id as string) ?? []
      }
    ])
  );
  const productPerformance = buildProductPerformance(normalizedOrders, productLookup);
  const collectionPerformance = await prismaAnalyticsRepository.getCollectionPerformance();
  const discountUsage = buildDiscountUsage(normalizedOrders);

  return {
    productPerformance,
    collectionPerformance,
    discountUsage,
    topProducts: productPerformance.slice(0, 4),
    lowProducts: [...productPerformance].sort((a, b) => a.estimatedProfit - b.estimatedProfit).slice(0, 4)
  };
}
