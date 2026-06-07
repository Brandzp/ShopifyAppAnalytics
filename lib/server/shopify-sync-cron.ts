const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const BOOT_DELAY_MS = 20_000; // first run shortly after server is listening
const GLOBAL_KEY = "__shopifySyncCronHandle__";

function resolveCronUrl() {
  if (process.env.SHOPIFY_SYNC_CRON_URL) return process.env.SHOPIFY_SYNC_CRON_URL;
  // Next sets process.env.PORT for `next dev -p` / `next start -p`.
  const port = process.env.PORT || "3000";
  return `http://127.0.0.1:${port}/api/cron/shopify-sync`;
}

/**
 * Registers an in-process hourly Shopify full-sync trigger. Started from
 * instrumentation.ts on server boot so it runs in the background for the whole
 * lifetime of the Node server (works with `npm run dev` and `npm start`).
 *
 * It intentionally does NOT import the sync services directly — that pulls
 * Node-only modules (crypto, Prisma) into Next's instrumentation compile and
 * breaks it. Instead it pings the /api/cron/shopify-sync route, which runs the
 * heavy work in the normal Node route runtime.
 *
 * Env knobs:
 *  - SHOPIFY_SYNC_CRON_DISABLED=1   → don't schedule it at all
 *  - SHOPIFY_SYNC_CRON_MS=<ms>      → override the interval (default 1h)
 *  - SHOPIFY_SYNC_CRON_URL=<url>    → override the endpoint it pings
 */
export function startShopifySyncCron() {
  if (process.env.SHOPIFY_SYNC_CRON_DISABLED === "1") return;

  const globalScope = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: NodeJS.Timeout;
  };
  // Guard against double-scheduling within the same process (e.g. dev HMR).
  if (globalScope[GLOBAL_KEY]) return;

  const parsed = Number(process.env.SHOPIFY_SYNC_CRON_MS);
  const intervalMs = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MS;
  const url = resolveCronUrl();

  let running = false;
  const tick = async () => {
    if (running) return; // a previous (slow) sync is still going — skip this beat
    running = true;
    try {
      const response = await fetch(url, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (body?.skipped) {
        console.log("[shopify-sync-cron] skipped (no connected store or sync already running)");
      } else if (response.ok && body?.ok) {
        console.log(`[shopify-sync-cron] full sync completed for store ${body.storeId ?? "?"}`);
      } else {
        console.warn(`[shopify-sync-cron] sync did not complete: ${body?.error ?? response.status}`);
      }
    } catch (error) {
      console.error("[shopify-sync-cron] trigger failed", error);
    } finally {
      running = false;
    }
  };

  const handle = setInterval(tick, intervalMs);
  handle.unref?.(); // don't keep the event loop alive solely for this timer
  globalScope[GLOBAL_KEY] = handle;

  console.log(
    `[shopify-sync-cron] scheduled full Shopify sync every ${Math.round(
      intervalMs / 60000
    )} min via ${url}`
  );

  // Kick off one run soon after boot so data is fresh without waiting an hour.
  setTimeout(tick, BOOT_DELAY_MS).unref?.();
}
