// POST /api/gantt/[sheetId]/brief[?refresh=1]
//
// Ask the brief generator to structure a full monthly marketing brief
// (matches the reference DOCX format the team already uses). Cached on
// GanttSheet.briefJson; force-regenerate with ?refresh=1.

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { getDb } from "@/lib/server/db";
import {
  generateMarketingBrief,
  type MarketingBrief
} from "@/lib/services/gantt-brief-generator-service";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

function monthLabelFromRange(start: Date | null, end: Date | null): string {
  if (!start) return "";
  const monthsHe = [
    "ינואר",
    "פברואר",
    "מרץ",
    "אפריל",
    "מאי",
    "יוני",
    "יולי",
    "אוגוסט",
    "ספטמבר",
    "אוקטובר",
    "נובמבר",
    "דצמבר"
  ];
  const startLabel = `${monthsHe[start.getUTCMonth()]} ${start.getUTCFullYear()}`;
  if (!end || end.getUTCMonth() === start.getUTCMonth()) return startLabel;
  return `${startLabel} → ${monthsHe[end.getUTCMonth()]} ${end.getUTCFullYear()}`;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ sheetId: string }> }
) {
  try {
    const { sheetId } = await context.params;
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);
    await assertStoreInActiveOrg(storeId);

    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get("refresh") === "1";

    const db = getDb();
    const sheet = await db.ganttSheet.findFirst({
      where: { id: sheetId, storeId },
      include: {
        rows: { orderBy: [{ startDate: "asc" }, { rowIndex: "asc" }] },
        store: { select: { name: true } }
      }
    });
    if (!sheet) throw new AppError("Sheet not found.", 404);

    if (!forceRefresh && sheet.briefJson) {
      return NextResponse.json({
        ok: true,
        cached: true,
        generatedAt: sheet.briefGeneratedAt?.toISOString() ?? null,
        brief: sheet.briefJson
      });
    }

    const monthLabel = monthLabelFromRange(sheet.rangeStart, sheet.rangeEnd);
    const brief: MarketingBrief = await generateMarketingBrief({
      storeBrandName: sheet.store?.name ?? "",
      monthLabel,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rows: sheet.rows.map((r: any) => ({
        id: r.id,
        task: r.task,
        category: r.category,
        role: r.role,
        startDate: r.startDate,
        endDate: r.endDate,
        actionType: r.actionType
      }))
    });

    const updated = await db.ganttSheet.update({
      where: { id: sheet.id },
      data: {
        briefJson: brief as unknown as object,
        briefGeneratedAt: new Date()
      }
    });

    return NextResponse.json({
      ok: true,
      cached: false,
      generatedAt: updated.briefGeneratedAt?.toISOString() ?? null,
      brief
    });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
