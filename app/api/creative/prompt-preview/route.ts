import { NextResponse } from "next/server";
import { toErrorMessage } from "@/lib/server/errors";
import { buildPrompt } from "@/lib/services/creative-prompt-templates";
import {
  isCreativeAspectRatio,
  isCreativeType,
  type CreativeAspectRatio,
  type CreativeBrief,
  type CreativeType
} from "@/lib/domain/creative-types";

// Build and return the would-be AI prompt for a wizard configuration without
// running generation. The wizard's "Preview prompt" button hits this so users
// can see exactly what text we're going to send to gpt-image-1 / Gemini
// before paying for a generation.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      creativeType?: string;
      aspectRatio?: string;
      brief?: CreativeBrief;
      referenceLabels?: string[];
      index?: number;
    };

    const creativeType: CreativeType = isCreativeType(body.creativeType)
      ? (body.creativeType as CreativeType)
      : "PACKSHOT";
    const aspectRatio: CreativeAspectRatio = isCreativeAspectRatio(body.aspectRatio)
      ? (body.aspectRatio as CreativeAspectRatio)
      : "1:1";

    const built = buildPrompt({
      creativeType,
      aspectRatio,
      brief: body.brief ?? null,
      referenceLabels: Array.isArray(body.referenceLabels) ? body.referenceLabels : [],
      index: typeof body.index === "number" ? body.index : 0
    });

    return NextResponse.json({
      ok: true,
      prompt: built.prompt,
      negativePrompt: built.negativePrompt
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 500 });
  }
}
