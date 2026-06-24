// Creative agent prompt refinement — given the form fields the operator
// fills in on /creative/new (product name, description, tone, brand notes,
// custom prompt, asset type, aspect ratio), ask the Creative agent to
// write the optimal visualPrompt for the image model.
//
// Why have the agent do this instead of the template:
// The existing creative-prompt-templates does mechanical concatenation
// ("clean studio packshot. soft natural lighting. {product}.") which
// produces correct-but-bland output. The Creative agent is tuned for
// marketing copy and can write prompts that lead to better composition,
// lighting language, and brand fit.
//
// Fail-safe: returns null on any failure. Callers should fall back to the
// existing template prompt — we never produce a worse result than today.

import { askCreativeAgentJson, isBiAgentConfigured } from "@/lib/clients/bi-agent-client";
import type { CreativeBrief, CreativeType, CreativeAspectRatio } from "@/lib/domain/creative-types";

export interface CraftPromptInput {
  creativeType: CreativeType;
  aspectRatio: CreativeAspectRatio;
  brief: CreativeBrief | null;
  // Labels the operator gave to extra "reference" uploads (e.g.
  // "model pose", "lighting style"). The image model only conditions on
  // the actual reference bytes; these labels become text hints.
  referenceLabels?: string[];
  // Indicator that a product reference image will be passed to the
  // generator. When true, the agent is told NOT to describe the product
  // (the image handles that) and focus on the scene/lighting/styling.
  hasReferenceImage?: boolean;
}

function typeStyleHint(t: CreativeType): string {
  switch (t) {
    case "PACKSHOT":
      return "clean studio packshot, neutral seamless background, ultra-sharp product focus, no people or props";
    case "INSTAGRAM_POST":
      return "modern lifestyle composition, golden-hour warmth, tasteful negative space for headline overlay";
    case "UGC_VIDEO":
      return "authentic iPhone-vertical UGC look, natural daylight, handheld feel, real-room background";
    case "META_AD":
      return "thumb-stopping editorial Meta-feed creative, bold composition, headline-friendly negative space";
  }
}

function buildPrompt(input: CraftPromptInput): string {
  const b = input.brief ?? {};
  const lines = [
    `You are a senior performance-marketing art director.`,
    `Write a single, polished image-generation prompt for the brief below.`,
    "",
    `Asset type: ${input.creativeType} — ${typeStyleHint(input.creativeType)}`,
    `Aspect ratio: ${input.aspectRatio}`,
    b.productName ? `Product name: ${b.productName}` : null,
    b.productDescription ? `Product description: ${b.productDescription}` : null,
    b.headline ? `Headline being teased: ${b.headline}` : null,
    b.tone ? `Tone: ${b.tone}` : null,
    b.brandNotes ? `Brand notes: ${b.brandNotes}` : null,
    b.customPrompt ? `Operator hint (use as inspiration, not verbatim): ${b.customPrompt}` : null,
    b.realism ? `Realism preference: ${b.realism}` : null,
    input.referenceLabels?.length ? `Reference image labels: ${input.referenceLabels.join(", ")}` : null,
    "",
    input.hasReferenceImage
      ? `IMPORTANT: a reference image of the actual product will be passed to the model. Do NOT describe the product's appearance, packaging, color, label, shape — the reference handles that. Describe the SCENE, lighting, composition, surface, props, atmosphere around the product.`
      : `No reference image is available — describe the product visually so the model can render it from scratch.`,
    "",
    `RULES:`,
    `  1. Output a SINGLE prompt string, ~3-5 sentences. English only.`,
    `  2. Photography (not illustration). Mention camera/lens hints when useful.`,
    `  3. Mention specific lighting direction (left/right/overhead), mood, surface.`,
    `  4. Avoid generic words: "beautiful", "amazing", "stunning". Use specific visual nouns.`,
    `  5. No prose-style adjectives chains. Use punchy directives.`,
    "",
    `Output JSON object: { "prompt": "<the polished prompt>" }`
  ];
  return lines.filter(Boolean).join("\n");
}

export async function craftPromptWithCreativeAgent(input: CraftPromptInput): Promise<string | null> {
  if (!isBiAgentConfigured()) return null;
  if (process.env.BI_AGENT_DISABLE === "1") return null;
  try {
    const parsed = await askCreativeAgentJson<{ prompt?: string }>({
      question: buildPrompt(input),
      jsonHint: 'object with prompt:string',
      timeoutMs: 45_000
    });
    const prompt = (parsed.prompt ?? "").trim();
    if (!prompt) return null;
    return prompt;
  } catch (err) {
    console.warn("[creative-prompt-agent] failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
