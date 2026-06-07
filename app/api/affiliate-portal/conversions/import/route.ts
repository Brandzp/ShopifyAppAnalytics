import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { importAffiliateConversionsCsv } from "@/lib/services/affiliate-conversion-import-service";

// CSV upload endpoint for the affiliate portal.
// Accepts multipart form-data with a single `file` field (.csv).
// Returns the import summary so the UI can show "X created / Y matched / etc."

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AppError("Upload a CSV file using the 'file' field.", 400);
    }
    if (file.size === 0) {
      throw new AppError("Uploaded file is empty.", 400);
    }
    // Generous cap so we don't OOM on a huge accidental upload, but high
    // enough for a real annual export (~20MB worst case).
    if (file.size > 30 * 1024 * 1024) {
      throw new AppError("File too large (max 30MB).", 400);
    }

    const text = await file.text();
    const result = await importAffiliateConversionsCsv({ storeId, csvText: text });
    return NextResponse.json({ ok: true, result, fileName: file.name });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
