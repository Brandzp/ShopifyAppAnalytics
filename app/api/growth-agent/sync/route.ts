import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { runGrowthAgentManualSync } from "@/lib/services/growth-agent-sync-service";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.storeId !== "string" || !body.storeId) {
      throw new AppError("Store id is required for Growth Agent sync.", 400);
    }
    const result = await runGrowthAgentManualSync(body.storeId);
    return NextResponse.json(result);
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
