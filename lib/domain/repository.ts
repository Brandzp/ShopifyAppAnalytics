import type {
  Alert,
  CollectionPerformanceRow,
  Customer,
  DailyMetric,
  DiscountUsage,
  Order,
  Product,
  Store,
  Summary
} from "@/lib/domain/types";

export interface AnalyticsRepository {
  getStore(): Promise<Store>;
  getProducts(): Promise<Product[]>;
  getCustomers(): Promise<Customer[]>;
  getOrders(): Promise<Order[]>;
  getDailyMetrics(): Promise<DailyMetric[]>;
  getPreviousPeriodMetrics(): Promise<DailyMetric[]>;
  getDiscountUsage(): Promise<DiscountUsage[]>;
  getCollectionPerformance(): Promise<CollectionPerformanceRow[]>;
  getAlerts(): Promise<Alert[]>;
  getSummaries(): Promise<Summary[]>;
}
