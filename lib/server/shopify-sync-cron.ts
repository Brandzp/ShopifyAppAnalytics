import { isCronEnabled, fetchWithTimeout, computeBackoffMs } from "./cron-util";

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const BOOT_DELAY_MS = 20_000; // first run shortly after server is listening
const FETCH_TIMEOUT_MS = 5 * 60 * 1000; // sync can be slow; abort after 5 min
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
 *  - ENABLE_SHOPIFY_SYNC_CRON=1     → opt-in. Default OFF in development,
 *                                     ON in production. Set to start it locally.
 *  - SHOPIFY_SYNC_CRON_DISABLED=1   → hard kill switch (overrides ENABLE_*)
 *  - SHOPIFY_SYNC_CRON_MS=<ms>      → override the interval (default 1h)
 *  - SHOPIFY_SYNC_CRON_URL=<url>    → override the endpoint it pings
 */
export function startShopifySyncCron() {
  if (!isCronEnabled("SHOPIFY_SYNC")) {
    console.log("[shopify-sync-cron] DISABLED (set ENABLE_SHOPIFY_SYNC_CRON=1 to enable)");
    return;
  }

  const globalScope = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: NodeJS.Timeout;
  };
  // Guard against double-scheduling within the same process (e.g. dev HMR).
  if (globalScope[GLOBAL_KEY]) return;

  const parsed = Number(process.env.SHOPIFY_SYNC_CRON_MS);
  const intervalMs = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MS;
  const url = resolveCronUrl();

  let running = false;
  let failures = 0; // consecutive failures, drives backoff
  let backoffUntil = 0; // epoch ms; skip ticks before this
  const tick = async () => {
    if (running) return; // a previous (slow) sync is still going — skip this beat
    if (Date.now() < backoffUntil) return; // backing off after recent failures
    running = true;
    try {
      const response = await fetchWithTimeout(url, { method: "POST" }, FETCH_TIMEOUT_MS);
      const body = await response.json().catch(() => ({}));
      if (body?.skipped) {
        console.log("[shopify-sync-cron] skipped (no connected store or sync already running)");
      } else if (response.ok && body?.ok) {
        console.log(`[shopify-sync-cron] full sync completed for store ${body.storeId ?? "?"}`);
      } else {
        console.warn(`[shopify-sync-cron] sync did not complete: ${body?.error ?? response.status}`);
      }
      failures = 0;
      backoffUntil = 0;
    } catch (error) {
      failures += 1;
      const backoff = computeBackoffMs(failures, intervalMs);
      backoffUntil = Date.now() + backoff;
      console.error(
        `[shopify-sync-cron] trigger failed (attempt ${failures}, backing off ${Math.round(
          backoff / 1000
        )}s)`,
        error instanceof Error ? error.message : error
      );
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
