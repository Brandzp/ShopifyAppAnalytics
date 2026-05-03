import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import type { MarketingBrand, MarketingPlannerExecutionMode, MarketingPlannerFocus } from "@/lib/domain/marketing-planner-types";
import { generateMarketingPlannerWorkbook } from "@/lib/services/marketing-planner-service";

function isBrand(value: FormDataEntryValue | null): value is MarketingBrand {
  return value === "Incense" || value === "After";
}

function isFocusMode(value: FormDataEntryValue | null): value is MarketingPlannerFocus {
  return value === "site" || value === "influencers" || value === "paid_ads" || value === "retention" || value === "balanced";
}

function isExecutionMode(value: FormDataEntryValue | null): value is MarketingPlannerExecutionMode {
  return value === "recommend_only" || value === "allow_create";
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const brand = formData.get("brand");
    const planningMonth = formData.get("planningMonth");
    const briefText = formData.get("briefText");
    const storeId = formData.get("storeId");
    const focusChannels = formData.get("focusChannels");
    const focusMode = formData.get("focusMode");
    const executionMode = formData.get("executionMode");
    const file = formData.get("file");

    if (!isBrand(brand)) {
      throw new AppError("בחרי מותג לפני יצירת הגאנט.", 400);
    }

    if (typeof planningMonth !== "string" || !planningMonth) {
      throw new AppError("בחרי חודש תכנון לפני יצירת הגאנט.", 400);
    }

    const result = await generateMarketingPlannerWorkbook(
      {
        brand,
        planningMonth,
        briefText: typeof briefText === "string" ? briefText : "",
        storeId: typeof storeId === "string" ? storeId : null,
        focusChannels: typeof focusChannels === "string" ? focusChannels : "",
        focusMode: isFocusMode(focusMode) ? focusMode : "balanced",
        executionMode: isExecutionMode(executionMode) ? executionMode : "recommend_only",
        sourceFileName: file instanceof File ? file.name : null
      },
      file instanceof File ? file : null
    );

    return NextResponse.json(result);
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
