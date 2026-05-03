import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getGrowthAgentSettings, saveGrowthAgentSettings } from "@/lib/services/growth-agent-service";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const storeId = url.searchParams.get("storeId") ?? undefined;
    const settings = await getGrowthAgentSettings(storeId);
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (typeof body.storeId !== "string" || !body.storeId) {
      throw new AppError("Store id is required to save Growth Agent settings.", 400);
    }
    const result = await saveGrowthAgentSettings(body.settings ?? body, body.storeId);
    return NextResponse.json(result);
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
