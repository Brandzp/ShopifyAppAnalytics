import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import type { GrowthProductRecommendation } from "@/lib/domain/growth-agent-types";
import { importGrowthAgentRecommendationToShopify } from "@/lib/services/growth-agent-product-crawler-service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const recommendation = body?.recommendation as GrowthProductRecommendation | undefined;

    if (!recommendation?.title || !recommendation?.sourceUrl || !recommendation?.sourceDomain) {
      throw new AppError("Recommendation payload is incomplete.", 400);
    }

    const result = await importGrowthAgentRecommendationToShopify(recommendation, body?.storeId);
    return NextResponse.json(result);
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
