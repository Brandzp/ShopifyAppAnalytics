import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { runGrowthAgentManualHealthCheck } from "@/lib/services/growth-agent-sync-service";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.storeId !== "string" || !body.storeId) {
      throw new AppError("Store id is required for Growth Agent health checks.", 400);
    }
    const result = await runGrowthAgentManualHealthCheck(body.storeId);
    return NextResponse.json(result);
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
