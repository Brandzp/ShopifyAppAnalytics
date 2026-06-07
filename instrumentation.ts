/**
 * Next.js calls register() once when the server process starts. We use it to
 * launch the background crons. Guarded to the Node.js runtime so it never tries
 * to run on the Edge runtime or during the build.
 *
 * Each start* function self-gates on its enable flag (see lib/server/cron-util
 * isCronEnabled): crons are OFF by default in development and must be turned on
 * with ENABLE_SHOPIFY_SYNC_CRON / ENABLE_CREATIVE_JOB_CRON /
 * ENABLE_WEEKLY_REPORT_CRON. In production they default ON. They each apply an
 * AbortController fetch timeout and exponential backoff on failure so a flaky
 * tick can't tight-loop or crash the process.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startShopifySyncCron } = await import("@/lib/server/shopify-sync-cron");
  startShopifySyncCron();
  const { startCreativeJobCron } = await import("@/lib/server/creative-job-cron");
  startCreativeJobCron();
  const { startWeeklyReportCron } = await import("@/lib/server/weekly-report-cron");
  startWeeklyReportCron();
}
