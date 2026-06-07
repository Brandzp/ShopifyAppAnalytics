/**
 * Next.js calls register() once when the server process starts. We use it to
 * launch the background hourly Shopify sync. Guarded to the Node.js runtime so
 * it never tries to run on the Edge runtime or during the build.
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
