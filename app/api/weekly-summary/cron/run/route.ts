import { NextResponse } from "next/server";
import { toErrorMessage } from "@/lib/server/errors";
import { getDb } from "@/lib/server/db";
import { buildWeeklyReportBundle, persistWeeklyReport } from "@/lib/services/weekly-report-service";
import { listActiveRecipientEmails } from "@/lib/services/weekly-report-recipient-service";
import { buildMonthlyMetaSynthesis } from "@/lib/services/monthly-report-synthesis-service";
import { renderPdfFromUrl } from "@/lib/server/pdf-renderer";
import { sendWeeklyReportEmail } from "@/lib/server/weekly-report-mailer";
import { getInternalBaseUrl } from "@/lib/server/base-url";

// Cron-triggered endpoint. Runs the weekly + monthly auto-reports for every
// store that has at least one active recipient configured. Idempotent —
// safe to call multiple times within the same period; only the first call
// for a given (store, period) writes a row and sends emails.

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes — PDF rendering + AI insights can be slow

interface RunBody {
  weekly?: boolean;
  monthly?: boolean;
}

// Compute Sunday→Saturday of the most recently completed week, anchored on
// Asia/Jerusalem so it lines up with the founder's calendar.
function computeWeeklyPeriod(now = new Date()): { start: Date; end: Date } {
  const weekday = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem",
      weekday: "long"
    }).format(now)
      .replace("Sunday", "0")
      .replace("Monday", "1")
      .replace("Tuesday", "2")
      .replace("Wednesday", "3")
      .replace("Thursday", "4")
      .replace("Friday", "5")
      .replace("Saturday", "6")
  );
  // Sunday is the start of the week in IL. "Most recently completed" = the
  // Sunday-Saturday block that ended yesterday (Saturday) or earlier.
  // Days since the most recent Saturday: weekday + 1 for any non-Sunday,
  // 1 for Sunday itself.
  const daysSinceSaturday = weekday === 6 ? 0 : weekday + 1;
  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() - daysSinceSaturday);
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  start.setUTCHours(0, 0, 0, 0);
  return { start, end };
}

// Calendar month that just ended (e.g. if today is June 1, returns May).
function computePreviousMonthPeriod(now = new Date()): { start: Date; end: Date } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // current month (0-based)
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { start, end };
}

async function findReportForPeriod(
  storeId: string,
  kind: "weekly" | "monthly",
  start: Date,
  end: Date
): Promise<{ id: string } | null> {
  const db = getDb() as any;
  return db.weeklyReport.findFirst({
    where: {
      storeId,
      kind,
      periodStart: start,
      periodEnd: end
    },
    select: { id: true }
  });
}

async function runForStore(
  storeId: string,
  kind: "weekly" | "monthly",
  start: Date,
  end: Date,
  baseUrl: string
): Promise<{ ok: boolean; reason: string; reportId?: string }> {
  const existing = await findReportForPeriod(storeId, kind, start, end);
  if (existing) return { ok: true, reason: "already-ran", reportId: existing.id };

  const recipients = await listActiveRecipientEmails(storeId);
  if (recipients.length === 0) {
    return { ok: false, reason: "no-recipients" };
  }

  const bundle = await buildWeeklyReportBundle({ storeId, start, end, locale: "he" });
  // For monthly reports, augment the bundle with the cross-week synthesis
  // that reads the prior 4-5 stored weekly reports. This is what gives
  // monthly its distinct value over "just a wider weekly".
  if (kind === "monthly") {
    const synthesis = await buildMonthlyMetaSynthesis(storeId, end, "he").catch(() => null);
    if (synthesis) {
      (bundle as any).monthlySynthesis = synthesis;
    }
  }
  const persisted = await persistWeeklyReport({ bundle, kind });

  // Render PDF using the same internal print URL the on-demand export uses.
  const printUrl = new URL("/print/meta-ads-weekly", baseUrl);
  printUrl.searchParams.set("from", bundle.periodStart);
  printUrl.searchParams.set("to", bundle.periodEnd);
  printUrl.searchParams.set("storeId", storeId);
  printUrl.searchParams.set("locale", "he");

  const pdf = await renderPdfFromUrl({ url: printUrl.toString() });

  const send = await sendWeeklyReportEmail({
    to: recipients,
    bundle,
    pdf,
    kind
  });

  const db = getDb() as any;
  await db.weeklyReport.update({
    where: { id: persisted.id },
    data: {
      sentAt: send.ok ? new Date() : null,
      sentToJson: recipients,
      errorMessage: send.ok ? null : send.error ?? "Send failed."
    }
  });

  return { ok: send.ok, reason: send.ok ? "sent" : send.error ?? "send-failed", reportId: persisted.id };
}

export async function POST(request: Request) {
  try {
    const body: RunBody = await request.json().catch(() => ({}));
    const baseUrl = getInternalBaseUrl(request);
    const db = getDb() as any;

    // Find every store that has at least one active recipient. No active
    // recipients = nothing to send, no work to do.
    const stores = await db.weeklyReportRecipient.findMany({
      where: { active: true },
      select: { storeId: true },
      distinct: ["storeId"]
    });

    const ran: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    for (const { storeId } of stores) {
      if (body.weekly) {
        const period = computeWeeklyPeriod();
        const result = await runForStore(storeId, "weekly", period.start, period.end, baseUrl).catch(
          (e) => ({ ok: false, reason: e instanceof Error ? e.message : "error" })
        );
        if (result.reason === "sent") ran.push(`weekly:${storeId}`);
        else if (result.reason === "already-ran") skipped.push(`weekly:${storeId}`);
        else errors.push(`weekly:${storeId}:${result.reason}`);
      }
      if (body.monthly) {
        const period = computePreviousMonthPeriod();
        const result = await runForStore(storeId, "monthly", period.start, period.end, baseUrl).catch(
          (e) => ({ ok: false, reason: e instanceof Error ? e.message : "error" })
        );
        if (result.reason === "sent") ran.push(`monthly:${storeId}`);
        else if (result.reason === "already-ran") skipped.push(`monthly:${storeId}`);
        else errors.push(`monthly:${storeId}:${result.reason}`);
      }
    }

    return NextResponse.json({ ok: true, ran, skipped, errors });
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 500 });
  }
}
