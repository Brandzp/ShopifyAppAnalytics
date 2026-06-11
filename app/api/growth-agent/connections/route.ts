import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getGrowthPlatformConnections } from "@/lib/services/growth-agent-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const storeId = url.searchParams.get("storeId") ?? undefined;
    if (storeId) await assertStoreInActiveOrg(storeId);
    const connections = await getGrowthPlatformConnections(storeId);
    return NextResponse.json({ ok: true, connections });
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
