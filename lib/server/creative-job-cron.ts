const DEFAULT_INTERVAL_MS = 5_000; // 5s — frequent so the UI doesn't lag perceptibly
const BOOT_DELAY_MS = 8_000;
const GLOBAL_KEY = "__creativeJobCronHandle__";

function resolveCronUrl() {
  if (process.env.CREATIVE_JOB_CRON_URL) return process.env.CREATIVE_JOB_CRON_URL;
  const port = process.env.PORT || "3000";
  return `http://127.0.0.1:${port}/api/creative/jobs/worker`;
}

/**
 * In-process tick that POSTs to the creative worker route every few seconds.
 * Same shape as `startShopifySyncCron` so the operational model stays
 * uniform. Skips if a previous tick is still in flight.
 *
 * Env knobs:
 *   - CREATIVE_JOB_CRON_DISABLED=1   → don't schedule it at all
 *   - CREATIVE_JOB_CRON_MS=<ms>      → override interval (default 5s)
 *   - CREATIVE_JOB_CRON_URL=<url>    → override the endpoint it pings
 *   - CREATIVE_WORKER_SECRET=<str>   → header value sent to the worker
 */
export function startCreativeJobCron() {
  if (process.env.CREATIVE_JOB_CRON_DISABLED === "1") return;

  const globalScope = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: NodeJS.Timeout;
  };
  if (globalScope[GLOBAL_KEY]) return;

  const parsed = Number(process.env.CREATIVE_JOB_CRON_MS);
  const intervalMs = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MS;
  const url = resolveCronUrl();
  const secret = process.env.CREATIVE_WORKER_SECRET?.trim();

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const headers: Record<string, string> = {};
      if (secret) headers["x-creative-worker-secret"] = secret;
      const response = await fetch(url, { method: "POST", headers });
      if (!response.ok) {
        console.warn(`[creative-job-cron] tick failed: HTTP ${response.status}`);
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { ranJob?: boolean; jobId?: string };
      if (body.ranJob) {
        console.log(`[creative-job-cron] ran job ${body.jobId ?? "?"}`);
      }
    } catch (error) {
      console.error("[creative-job-cron] trigger failed", error);
    } finally {
      running = false;
    }
  };

  const handle = setInterval(tick, intervalMs);
  handle.unref?.();
  globalScope[GLOBAL_KEY] = handle;

  console.log(
    `[creative-job-cron] scheduled creative worker every ${Math.round(intervalMs / 1000)}s via ${url}`
  );

  setTimeout(tick, BOOT_DELAY_MS).unref?.();
}
