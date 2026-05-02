import { NextResponse } from "next/server";
import { runIncrementalSync } from "@/lib/services/shopify-sync-service";
import { AppError, toErrorMessage } from "@/lib/server/errors";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await runIncrementalSync(body.storeId);
    return NextResponse.json({ ok: true, syncRun: result });
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
