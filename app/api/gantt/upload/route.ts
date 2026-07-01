// Gantt upload — operator drops a marketing-calendar .xlsx, we parse it
// into rows and stash the file + parsed data so the UI can show a
// per-day calendar with action buttons (create discount / open Creative
// wizard / etc.).
//
// Accepts multipart/form-data with a single `file` field (.xlsx). The
// raw file is preserved in R2 so we can re-parse with parser upgrades
// without asking the operator to re-upload.

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { getDb } from "@/lib/server/db";
import { parseGanttWorkbook } from "@/lib/services/gantt-parser-service";
import {
  buildStorageKey,
  putObject,
  suggestFilename
} from "@/lib/services/creative-storage-service";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ALLOWED_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/octet-stream", // some browsers misreport — accept if extension is .xlsx/.xls
  ""
]);
const MAX_BYTES = 20 * 1024 * 1024; // 20MB

function hasXlsxExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".xlsx") || lower.endsWith(".xls");
}

export async function POST(request: Request) {
  try {
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);
    await assertStoreInActiveOrg(storeId);

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AppError("Upload a Gantt .xlsx file in the 'file' field.", 400);
    }
    if (file.size === 0) {
      throw new AppError("Uploaded file is empty.", 400);
    }
    if (file.size > MAX_BYTES) {
      throw new AppError(`File too large (max ${MAX_BYTES / 1024 / 1024}MB).`, 400);
    }
    if (!ALLOWED_MIMES.has(file.type) && !hasXlsxExtension(file.name)) {
      throw new AppError(
        `Unexpected file type "${file.type}". Upload an Excel .xlsx file.`,
        400
      );
    }
    const titleField = form.get("title");
    const title =
      typeof titleField === "string" && titleField.trim()
        ? titleField.trim()
        : file.name.replace(/\.[^.]+$/, "");

    const buffer = Buffer.from(await file.arrayBuffer());

    let parsed;
    try {
      parsed = parseGanttWorkbook(buffer);
    } catch (err) {
      throw new AppError(
        `Could not parse the workbook. ${err instanceof Error ? err.message : String(err)}`,
        400
      );
    }
    if (parsed.rows.length === 0) {
      throw new AppError(
        `Parsed 0 tasks. Detected layout: ${parsed.layoutDetected}. ` +
          `Make sure row 1 has dates (matrix layout) OR the header row contains Task + Role + Category + Start/End columns.`,
        422
      );
    }

    // Preserve the raw upload — lets us re-parse later if we improve the
    // parser, and lets the operator download what they sent.
    const storageKey = buildStorageKey({
      storeId,
      scope: "sources",
      segments: ["gantt"],
      filename: suggestFilename(file.name || "gantt.xlsx")
    });
    await putObject({
      key: storageKey,
      body: buffer,
      contentType:
        file.type ||
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });

    const db = getDb();
    const sheet = await db.ganttSheet.create({
      data: {
        storeId,
        title,
        originalName: file.name,
        contentType:
          file.type ||
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        bytesLength: buffer.length,
        storageKey,
        rangeStart: parsed.rangeStart,
        rangeEnd: parsed.rangeEnd,
        rowCount: parsed.rows.length,
        rolesJson: parsed.roles,
        categoriesJson: parsed.categories
      }
    });

    // Bulk-insert the rows. CreateMany skips defaults/relations so we
    // pre-shape the records here.
    await db.ganttRow.createMany({
      data: parsed.rows.map((row) => ({
        sheetId: sheet.id,
        storeId,
        rowIndex: row.rowIndex,
        task: row.task,
        role: row.role,
        category: row.category,
        startDate: row.startDate,
        endDate: row.endDate,
        status: row.status,
        actionType: row.actionType,
        rawJson: row.raw as object
      }))
    });

    return NextResponse.json({
      ok: true,
      sheetId: sheet.id,
      title: sheet.title,
      layoutDetected: parsed.layoutDetected,
      sheetNamesInWorkbook: parsed.sheetNamesInWorkbook,
      parsedSheetName: parsed.parsedSheetName,
      rowCount: parsed.rows.length,
      rangeStart: parsed.rangeStart?.toISOString().slice(0, 10) ?? null,
      rangeEnd: parsed.rangeEnd?.toISOString().slice(0, 10) ?? null,
      roles: parsed.roles,
      categories: parsed.categories
    });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
