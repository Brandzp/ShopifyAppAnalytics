import { mockStoreRepository } from "@/lib/data/mock-store-repository";
import { hasPrismaAnalyticsData, prismaAnalyticsRepository } from "@/lib/data/prisma-analytics-repository";
import type { AnalyticsRepository } from "@/lib/domain/repository";

export async function getAnalyticsRepository(): Promise<AnalyticsRepository> {
  // TODO: Add multi-store scoping once authentication and store selection are introduced.
  return (await hasPrismaAnalyticsData()) ? prismaAnalyticsRepository : mockStoreRepository;
}
