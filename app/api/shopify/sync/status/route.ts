import { NextResponse } from "next/server";
import { getSyncStatus } from "@/lib/services/shopify-sync-service";
import { AppError, toErrorMessage } from "@/lib/server/errors";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const storeId = url.searchParams.get("storeId") ?? undefined;
    const result = await getSyncStatus(storeId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
