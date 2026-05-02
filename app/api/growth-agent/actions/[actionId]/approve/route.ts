import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { approveGrowthAction } from "@/lib/services/growth-agent-action-engine";

export async function POST(request: Request, context: { params: Promise<{ actionId: string }> }) {
  try {
    const body = await request.json().catch(() => ({}));
    const { actionId } = await context.params;
    const result = await approveGrowthAction(actionId, body.approvedBy ?? "merchant");
    return NextResponse.json(result);
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
