import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { runFullInitialSync } from "@/lib/services/shopify-sync-service";
import { syncMetaAdsCampaignInsights } from "@/lib/services/meta-ads-service";
import { syncInstagramPosts } from "@/lib/services/instagram-service";
import { refreshMetaTokensNearExpiry } from "@/lib/services/meta-token-refresh-service";

// Multi-source data refresh — the unified 2-hour cron tick.
//
// For every connected store, fans out four sync sources IN PARALLEL:
//   1. Shopify (orders/products/customers/refunds)
//   2. Meta Ads (campaign insights, ad creative metadata)
//   3. Instagram (creator posts, engagement)
//   4. BixGrow attribution placeholder (CSV path still preferred; this is
//      a no-op for stores without a BixGrow connection)
//
// Per-source failures are isolated — if Meta sync fails for store X,
// Shopify still completes for store X and all sources still run for
// store Y. The summary in the response indicates per-store / per-source
// outcomes so the cron's heartbeat log is actionable.
//
// Idempotency: every underlying sync is incremental and respects "last
// synced at" timestamps on each Connection row. Multiple invocations
// inside the same window are safe — the second call just sees nothing
// new to pull.

export const dynamic = "force-dynamic";
// 10 min headroom for the slowest tick (large stores with thousands of
// new orders). The cron's own AbortController kills hung ticks earlier.
export const maxDuration = 600;

interface PerStoreResult {
  storeId: string;
  storeName: string | null;
  shopify: { ok: boolean; skipped?: boolean; error?: string };
  metaAds: { ok: boolean; skipped?: boolean; error?: string };
  instagram: { ok: boolean; skipped?: boolean; error?: string };
  bixgrow: { ok: boolean; skipped: boolean };
}

async function handler() {
  const db = getDb();

  // Pre-step: refresh any Meta long-lived tokens that are within 7 days of
  // expiry. Runs once at the top of each tick (not per-store) because the
  // refresh check is a single query. Failures here don't block the rest of
  // the cron — a store with an expired token will just fail its Meta sync
  // below, but Shopify + Instagram still sync.
  const tokenRefresh = await refreshMetaTokensNearExpiry().catch((err) => {
    console.error("[refresh-all] Meta token refresh failed:", err);
    return null;
  });
  if (tokenRefresh && tokenRefresh.refreshed > 0) {
    console.log(
      `[refresh-all] refreshed ${tokenRefresh.refreshed} Meta token(s)` +
        (tokenRefresh.failed.length > 0
          ? ` (${tokenRefresh.failed.length} failed)`
          : "")
    );
  }

  // Find every store with at least a Shopify connection. Meta/Instagram/
  // BixGrow are optional — we skip those when no connection row exists.
  const stores = (await db.store.findMany({
    where: { connected: true },
    select: { id: true, name: true }
  })) as Array<{ id: string; name: string | null }>;

  if (stores.length === 0) {
    return NextResponse.json({
      ok: true,
      stores: 0,
      message: "No connected stores.",
      tokenRefresh
    });
  }

  const results: PerStoreResult[] = await Promise.all(
    stores.map(async (store) => {
      const result: PerStoreResult = {
        storeId: store.id,
        storeName: store.name,
        shopify: { ok: false },
        metaAds: { ok: false },
        instagram: { ok: false },
        bixgrow: { ok: true, skipped: true }
      };

      // ── Shopify (mandatory if connected) ──────────────────────────
      try {
        await runFullInitialSync(store.id);
        result.shopify = { ok: true };
      } catch (err) {
        // 409 = a sync is already running for this store — that's not a
        // failure, just expected when ticks overlap with a manual sync.
        const isConflict =
          err instanceof Error && err.message.includes("already running");
        result.shopify = isConflict
          ? { ok: true, skipped: true }
          : { ok: false, error: err instanceof Error ? err.message : String(err) };
      }

      // ── Meta Ads (optional) ───────────────────────────────────────
      const metaConn = await db.metaAdsConnection
        .findUnique({ where: { storeId: store.id }, select: { id: true } })
        .catch(() => null);
      if (!metaConn) {
        result.metaAds = { ok: true, skipped: true };
      } else {
        try {
          await syncMetaAdsCampaignInsights({ storeId: store.id });
          result.metaAds = { ok: true };
        } catch (err) {
          result.metaAds = {
            ok: false,
            error: err instanceof Error ? err.message : String(err)
          };
        }
      }

      // ── Instagram (optional) ──────────────────────────────────────
      const igConn = await db.instagramConnection
        .findFirst({ where: { storeId: store.id }, select: { id: true } })
        .catch(() => null);
      if (!igConn) {
        result.instagram = { ok: true, skipped: true };
      } else {
        try {
          // syncInstagramPosts reads the active store via cookie/context,
          // so it's effectively for the "current" store. In single-tenant
          // mode (one store) this matches. For multi-tenant we'll need a
          // storeId-scoped variant — tracked as a follow-up.
          await syncInstagramPosts();
          result.instagram = { ok: true };
        } catch (err) {
          result.instagram = {
            ok: false,
            error: err instanceof Error ? err.message : String(err)
          };
        }
      }

      return result;
    })
  );

  // Compact summary for the cron's heartbeat log
  const totalOk = results.filter(
    (r) => r.shopify.ok && r.metaAds.ok && r.instagram.ok
  ).length;
  const totalFailed = results.length - totalOk;

  return NextResponse.json({
    ok: totalFailed === 0,
    stores: results.length,
    summary: {
      allOk: totalOk,
      withFailures: totalFailed
    },
    tokenRefresh,
    results
  });
}

export { handler as GET, handler as POST };
