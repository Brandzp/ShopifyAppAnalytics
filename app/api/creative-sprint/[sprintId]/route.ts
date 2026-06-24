import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getSprintDetail } from "@/lib/services/creative-sprint/sprint-service";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ sprintId: string }> }) {
  try {
    const { sprintId } = await ctx.params;
    const detail = await getSprintDetail(sprintId);
    return NextResponse.json({ ok: true, sprint: detail });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
