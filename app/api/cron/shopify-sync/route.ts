import { NextResponse } from "next/server";
import { runScheduledFullSync } from "@/lib/services/shopify-sync-service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Triggers a full Shopify sync on demand. The hourly background job runs this
 * automatically (see instrumentation.ts), but this endpoint lets you fire it
 * manually or wire an external scheduler (cron, Vercel Cron, uptime pinger).
 */
async function handler() {
  const result = await runScheduledFullSync();
  const status = result.ok || result.skipped ? 200 : 500;
  return NextResponse.json(result, { status });
}

export { handler as GET, handler as POST };
