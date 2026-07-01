// GET /api/gantt — list uploaded Gantt sheets for the active store.
// Compact summary used by the Gantt UI's "your sheets" dropdown.

import { NextResponse } from "next/server";
import { toErrorMessage } from "@/lib/server/errors";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { getDb } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const storeId = await resolveActiveStoreId();
    if (!storeId) return NextResponse.json({ ok: true, sheets: [] });
    const db = getDb();
    const sheets = await db.ganttSheet.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        originalName: true,
        rangeStart: true,
        rangeEnd: true,
        rowCount: true,
        rolesJson: true,
        categoriesJson: true,
        insightsGeneratedAt: true,
        createdAt: true
      }
    });
    return NextResponse.json({ ok: true, sheets });
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 500 });
  }
}
