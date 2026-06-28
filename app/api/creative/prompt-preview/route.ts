import { NextResponse } from "next/server";
import { toErrorMessage } from "@/lib/server/errors";
import { buildPrompt } from "@/lib/services/creative-prompt-templates";
import { craftPromptWithCreativeAgent } from "@/lib/services/creative-prompt-agent-service";
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
//
// When `useAgent: true`, we additionally call the Creative agent to write a
// polished prompt and substitute it into the brief.customPrompt slot before
// wrapping with the deterministic template (same flow the live generate
// path uses). Surfaces the actual final text — including the agent's
// contribution — instead of just the bare template.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      creativeType?: string;
      aspectRatio?: string;
      brief?: CreativeBrief;
      referenceLabels?: string[];
      index?: number;
      useAgent?: boolean;
      hasReferenceImage?: boolean;
    };

    const creativeType: CreativeType = isCreativeType(body.creativeType)
      ? (body.creativeType as CreativeType)
      : "PACKSHOT";
    const aspectRatio: CreativeAspectRatio = isCreativeAspectRatio(body.aspectRatio)
      ? (body.aspectRatio as CreativeAspectRatio)
      : "1:1";

    let brief: CreativeBrief | null = body.brief ?? null;
    let agentPrompt: string | null = null;
    let agentError: string | null = null;

    if (body.useAgent) {
      try {
        agentPrompt = await craftPromptWithCreativeAgent({
          creativeType,
          aspectRatio,
          brief,
          referenceLabels: Array.isArray(body.referenceLabels) ? body.referenceLabels : [],
          hasReferenceImage: Boolean(body.hasReferenceImage)
        });
        if (agentPrompt) {
          // Substitute the agent prompt into the customPrompt slot — same
          // place the live generate path injects it — so the template wrap
          // matches what the model will actually receive.
          brief = { ...(brief ?? {}), customPrompt: agentPrompt };
        } else {
          agentError = "Agent returned no prompt (not configured, disabled, or empty response).";
        }
      } catch (err) {
        agentError = err instanceof Error ? err.message : String(err);
      }
    }

    const built = buildPrompt({
      creativeType,
      aspectRatio,
      brief,
      referenceLabels: Array.isArray(body.referenceLabels) ? body.referenceLabels : [],
      index: typeof body.index === "number" ? body.index : 0
    });

    return NextResponse.json({
      ok: true,
      prompt: built.prompt,
      negativePrompt: built.negativePrompt,
      agentPrompt,
      agentError
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 500 });
  }
}
