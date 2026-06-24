// Quick-batch endpoint — Creative agent picks N visual concepts on a theme,
// Higgsfield renders them, all stored under one CreativeProject so the
// /creative history list picks them up automatically.
import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { runCreativeQuickBatch } from "@/lib/services/creative-quick-batch-service";

export const dynamic = "force-dynamic";
// 5 Higgsfield image gens at bounded concurrency 3 typically take 60-120s.
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("Connect a store before running a quick batch.", 400);

    const body = (await request.json()) as {
      theme?: string;
      count?: number;
      aspectRatio?: "9:16" | "1:1" | "4:5" | "16:9";
      productName?: string;
      brandNotes?: string;
    };
    if (!body.theme?.trim()) throw new AppError("theme is required.", 400);

    const result = await runCreativeQuickBatch({
      storeId,
      theme: body.theme.trim(),
      count: body.count,
      aspectRatio: body.aspectRatio,
      productName: body.productName?.trim() || undefined,
      brandNotes: body.brandNotes?.trim() || undefined
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
