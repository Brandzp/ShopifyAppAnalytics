import { NextResponse } from "next/server";
import { syncProducts } from "@/lib/services/shopify-sync-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { AppError, toErrorMessage } from "@/lib/server/errors";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const storeId =
      typeof body?.storeId === "string" && body.storeId.trim()
        ? body.storeId.trim()
        : await resolveActiveStoreId();
    if (!storeId) {
      throw new AppError("No store available to sync.", 400);
    }
    const result = await syncProducts(storeId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
