import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { importProductCostsCsv } from "@/lib/services/product-cost-service";

// Product cost (COGS) CSV import endpoint — SA-HIGH-03.
//
// Accepts multipart/form-data with a single `file` field (.csv). The CSV needs
// a header row with a cost column (cost / cogs / unit_cost / cost_per_item ...)
// and at least one product-identifier column (sku / handle / product_id /
// title). Each row sets the owning product's per-unit COGS and re-costs its
// synced order line items. Returns the import summary.
//
// The target store is resolved server-side from the caller's session, so a
// caller can only import into the store they're already viewing.

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
    if (file.size === 0) throw new AppError("Uploaded file is empty.", 400);
    if (file.size > 10 * 1024 * 1024) throw new AppError("File too large (max 10MB).", 400);

    const csvContent = await file.text();
    const result = await importProductCostsCsv({ storeId, csvContent });
    return NextResponse.json({ ...result, fileName: file.name });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
