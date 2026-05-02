import { getDb } from "@/lib/server/db";

export async function resolveOrCreateBaseStore() {
  const db = getDb();
  if (!db) return null;

  const existing =
    (await db.store.findFirst({ where: { connected: true }, orderBy: { updatedAt: "desc" } })) ??
    (await db.store.findFirst({ orderBy: { updatedAt: "desc" } }));
  if (existing) return existing;

  return db.store.create({
    data: {
      id: "creator-demo-store",
      name: "Creator Demo",
      domain: "creator-demo.local",
      currency: "USD",
      timezone: "UTC",
      connected: false,
      dateRangePreset: "30d",
      estimatedCostMode: "margin_profile"
    }
  });
}
