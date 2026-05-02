import { AppError } from "@/lib/server/errors";
import { getDb } from "@/lib/server/db";
import { encryptSecret } from "@/lib/security/encryption";
import { resolveOrCreateBaseStore } from "@/lib/services/creator-admin-service";

function normalizePortalDomain(value: string) {
  const normalized = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!normalized) {
    throw new AppError("BixGrow portal domain is required.");
  }
  return normalized;
}

export async function saveBixGrowConnection(input: { portalDomain: string; apiKey?: string }) {
  const db = getDb();
  if (!db) throw new AppError("Database client is not available.", 500);
  const store = await resolveOrCreateBaseStore();
  if (!store) throw new AppError("Unable to resolve a store for BixGrow settings.", 500);

  const portalDomain = normalizePortalDomain(input.portalDomain);
  const apiKey = input.apiKey?.trim();

  await db.bixgrowConnection.upsert({
    where: { storeId: store.id },
    update: {
      portalDomain,
      apiKeyEnc: apiKey ? encryptSecret(apiKey) : null,
      tokenLastFour: apiKey ? apiKey.slice(-4) : null,
      exportMode: "manual_export"
    },
    create: {
      storeId: store.id,
      portalDomain,
      apiKeyEnc: apiKey ? encryptSecret(apiKey) : null,
      tokenLastFour: apiKey ? apiKey.slice(-4) : null,
      exportMode: "manual_export"
    }
  });

  return {
    ok: true,
    portalDomain
  };
}

export async function getBixGrowConnectionSummary() {
  const db = getDb();
  if (!db) return null;
  const store = await resolveOrCreateBaseStore();
  if (!store) return null;
  return db.bixgrowConnection.findUnique({ where: { storeId: store.id } });
}

export async function syncBixGrowAttributionPlaceholder() {
  // TODO: Replace this with a real BixGrow API or export-ingestion flow once a stable programmatic interface is confirmed.
  return {
    ok: true,
    status: "manual_export_placeholder"
  };
}
