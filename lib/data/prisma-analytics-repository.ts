import type { AnalyticsRepository } from "@/lib/domain/repository";
import type { Alert, CollectionPerformanceRow, Order, Store, Summary } from "@/lib/domain/types";
import { getDb } from "@/lib/server/db";
import { toNumber } from "@/lib/server/numbers";
import { buildDailyMetrics, buildDiscountUsage, buildProductPerformance, buildRetentionSnapshot, getPreviousDateRange } from "@/lib/server/analytics";
import { getReportingDateRangeSelection } from "@/lib/server/reporting-date-range";

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
  return records.map((order) => ({
    id: order.id,
    customerId: order.customerId,
    createdAt: order.createdAt.toISOString(),
    orderNumber: order.orderNumber,
    isRefunded: toNumber(order.totalRefunds) > 0,
    refundAmount: toNumber(order.totalRefunds),
    discountCode: order.discountUsages?.[0]?.code,
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

async function getConnectedStoreRecord() {
  const db = getDb();
  if (!db) return null;
  return db.store.findFirst({
    where: { connected: true, connection: { isNot: null } },
    orderBy: { updatedAt: "desc" }
  });
}

async function getOrdersForRange(storeId: string, start: Date, end: Date) {
  const db = getDb();
  return db.order.findMany({
    where: {
      storeId,
      createdAt: {
        gte: start,
        lte: end
      }
    },
    include: {
      lineItems: true,
      discountUsages: true
    },
    orderBy: { createdAt: "asc" }
  });
}

async function getCustomerOrderHistory(storeId: string) {
  const db = getDb();
  const orders = await db.order.findMany({
    where: { storeId, customerId: { not: null } },
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
}

async function getActiveRange() {
  const selection = await getReportingDateRangeSelection();
  return {
    current: { start: selection.start, end: selection.end },
    previous: getPreviousDateRange({ start: selection.start, end: selection.end })
  };
}

export const prismaAnalyticsRepository: AnalyticsRepository = {
  async getStore() {
    const store = await getConnectedStoreRecord();
    if (!store) throw new Error("No connected store found.");
    return mapStore(store);
  },

  async getProducts() {
    const db = getDb();
    const store = await getConnectedStoreRecord();
    if (!store) return [];
    const products = await db.product.findMany({ where: { storeId: store.id } });
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

  async getCustomers() {
    const db = getDb();
    const store = await getConnectedStoreRecord();
    if (!store) return [];
    const customers = await db.customer.findMany({ where: { storeId: store.id } });
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

  async getOrders() {
    const store = await getConnectedStoreRecord();
    if (!store) return [];
    const range = await getActiveRange();
    const orders = await getOrdersForRange(store.id, range.current.start, range.current.end);
    return mapOrders(orders);
  },

  async getDailyMetrics() {
    const store = await getConnectedStoreRecord();
    if (!store) return [];
    const range = await getActiveRange();
    const [orders, history] = await Promise.all([
      getOrdersForRange(store.id, range.current.start, range.current.end),
      getCustomerOrderHistory(store.id)
    ]);
    return buildDailyMetrics(mapOrders(orders), history);
  },

  async getPreviousPeriodMetrics() {
    const store = await getConnectedStoreRecord();
    if (!store) return [];
    const range = await getActiveRange();
    const [orders, history] = await Promise.all([
      getOrdersForRange(store.id, range.previous.start, range.previous.end),
      getCustomerOrderHistory(store.id)
    ]);
    return buildDailyMetrics(mapOrders(orders), history);
  },

  async getDiscountUsage() {
    const orders = await this.getOrders();
    return buildDiscountUsage(orders);
  },

  async getCollectionPerformance() {
    const db = getDb();
    const store = await getConnectedStoreRecord();
    if (!store) return [];
    const range = await getActiveRange();
    const orderRecords = await getOrdersForRange(store.id, range.current.start, range.current.end);
    const orders = mapOrders(orderRecords);
    const products = await db.product.findMany({ where: { storeId: store.id } });
    const lookup = new Map<string, { title: string; collection: string }>(
      products.map((product: any) => [product.id as string, { title: product.title, collection: product.collection }])
    );
    const performance = buildProductPerformance(orders, lookup);
    const grouped = new Map<string, CollectionPerformanceRow>();

    for (const row of performance) {
      const current = grouped.get(row.collection) ?? {
        collection: row.collection,
        revenue: 0,
        estimatedProfit: 0
      };
      current.revenue += row.revenue;
      current.estimatedProfit += row.estimatedProfit;
      grouped.set(row.collection, current);
    }

    return Array.from(grouped.values()).sort((a, b) => b.revenue - a.revenue);
  },

  async getAlerts() {
    const db = getDb();
    const store = await getConnectedStoreRecord();
    if (!store) return [];
    const alerts = await db.alert.findMany({
      where: { storeId: store.id },
      orderBy: { timestamp: "desc" }
    });
    return alerts.map(mapStoredAlert);
  },

  async getSummaries() {
    const db = getDb();
    const store = await getConnectedStoreRecord();
    if (!store) return [];
    const summaries = await db.summary.findMany({
      where: { storeId: store.id },
      orderBy: { generatedAt: "desc" }
    });
    return summaries.map(mapSummary);
  }
};

export async function hasPrismaAnalyticsData() {
  const store = await getConnectedStoreRecord();
  return Boolean(store);
}

export async function getRetentionAnalyticsFromDb() {
  const db = getDb();
  const store = await getConnectedStoreRecord();
  if (!store) return null;
  const range = await getActiveRange();
  const [orders, history, allOrders, products] = await Promise.all([
    getOrdersForRange(store.id, range.current.start, range.current.end),
    getCustomerOrderHistory(store.id),
    db.order.findMany({ where: { storeId: store.id }, include: { lineItems: true, discountUsages: true }, orderBy: { createdAt: "asc" } }),
    db.product.findMany({ where: { storeId: store.id } })
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
  const db = getDb();
  const store = await getConnectedStoreRecord();
  if (!store) return null;
  const range = await getActiveRange();
  const [orders, products] = await Promise.all([
    getOrdersForRange(store.id, range.current.start, range.current.end),
    db.product.findMany({ where: { storeId: store.id } })
  ]);
  const normalizedOrders = mapOrders(orders);
  const productLookup = new Map<string, { title: string; collection: string }>(
    products.map((product: any) => [product.id as string, { title: product.title, collection: product.collection }])
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
