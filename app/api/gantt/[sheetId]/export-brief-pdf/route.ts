// POST /api/gantt/[sheetId]/export-brief-pdf
//
// Runs the /print/gantt-marketing-brief page through Playwright and
// streams the result back as a downloadable PDF. Requires that the brief
// has been generated first (via POST /api/gantt/[sheetId]/brief).

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { getDb } from "@/lib/server/db";
import { getInternalBaseUrl } from "@/lib/server/base-url";
import { renderPdfFromUrl } from "@/lib/server/pdf-renderer";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function parseCookieHeader(header: string | null): Array<{ name: string; value: string }> {
  if (!header) return [];
  return header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf("=");
      if (eq === -1) return { name: part, value: "" };
      return { name: part.slice(0, eq), value: part.slice(eq + 1) };
    });
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

    const db = getDb();
    const sheet = await db.ganttSheet.findFirst({
      where: { id: sheetId, storeId },
      select: { id: true, title: true, briefJson: true }
    });
    if (!sheet) throw new AppError("Sheet not found.", 404);
    if (!sheet.briefJson) {
      throw new AppError(
        "No brief generated yet. Call POST /api/gantt/[id]/brief first.",
        409
      );
    }

    const baseUrl = getInternalBaseUrl(request);
    const printUrl = new URL("/print/gantt-marketing-brief", baseUrl);
    printUrl.searchParams.set("sheetId", sheet.id);

    const cookies = parseCookieHeader(request.headers.get("cookie"));
    const pdf = await renderPdfFromUrl({
      url: printUrl.toString(),
      cookies,
      format: "A4"
    });

    const safeTitle = sheet.title
      .toLowerCase()
      .replace(/[^a-z0-9א-ת]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    const filename = `brief-${safeTitle || sheet.id}.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdf.byteLength),
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
