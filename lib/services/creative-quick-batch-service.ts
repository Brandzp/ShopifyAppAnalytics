// Creative Quick Batch — ask the Creative agent for N visual prompts on
// a theme, then generate N real images through Higgsfield, and persist
// them as ONE CreativeProject with N CreativeAssets so they appear in
// the existing /creative history list.
//
// This is the "show me 5 images for X campaign" flow — smaller than the
// full Sprint feature (no Meta publishing, no cascade, no approval gates),
// but uses the same underlying clients.

import { Prisma } from "@prisma/client";
import {
  createHiggsfieldJob,
  downloadHiggsfieldAsset,
  pollHiggsfieldUntilDone
} from "@/lib/clients/higgsfield-client";
import { askCreativeAgentJson } from "@/lib/clients/bi-agent-client";
import { buildStorageKey, putObject, suggestFilename } from "@/lib/services/creative-storage-service";
import { getDb } from "@/lib/server/db";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { AppError } from "@/lib/server/errors";

export interface QuickBatchInput {
  storeId: string;
  // Operator-supplied theme, e.g. "summer perfume campaign".
  theme: string;
  // 1-10. Default 5.
  count?: number;
  // Aspect ratio for ad creative. Default 9:16.
  aspectRatio?: "9:16" | "1:1" | "4:5" | "16:9";
  // Optional product context if the operator wants to ground the agent.
  productName?: string;
  // Brand voice notes — passed verbatim into the agent prompt.
  brandNotes?: string;
}

export interface QuickBatchResult {
  projectId: string;
  succeeded: number;
  failed: number;
  // The visual prompts the Creative agent generated, in slot order.
  prompts: string[];
}

interface AgentPromptDraft {
  // Short label for the matrix, e.g. "golden-hour-girl".
  label?: string;
  // The visual description fed straight to Higgsfield (English; image models
  // tend to underperform on Hebrew prompts).
  visualPrompt: string;
  // Optional headline + body the agent might also draft for our records.
  headline?: string;
  body?: string;
}

function buildCreativePrompt(input: Required<Pick<QuickBatchInput, "theme" | "count">> & QuickBatchInput): string {
  return [
    `You are a senior performance-marketing art director.`,
    "",
    `Campaign theme: ${input.theme}`,
    input.productName ? `Product: ${input.productName}` : null,
    input.brandNotes ? `Brand voice notes: ${input.brandNotes}` : null,
    `Aspect ratio target: ${input.aspectRatio ?? "9:16"} vertical (Meta-feed format)`,
    "",
    `Produce exactly ${input.count} DISTINCT visual concepts for this campaign.`,
    `Each concept should feel meaningfully different — different lighting, framing, mood, subject matter.`,
    `Avoid repetition: don't generate "the same scene with different colors."`,
    "",
    `For each concept, write a "visualPrompt": a 2-3 sentence directive an image model can render directly.`,
    `Mention: subject, framing, lighting, mood, surface/background, any props.`,
    `Photography style preferred (luxury editorial, not illustration).`,
    `English only for visualPrompt (image models work better in English).`,
    "",
    `Output JSON array of length ${input.count}:`,
    `[{ "label": "<short tag>", "visualPrompt": "...", "headline": "<optional ad headline>", "body": "<optional 1-line body>" }, ...]`
  ]
    .filter(Boolean)
    .join("\n");
}

async function generateOneAsset(input: {
  prompt: string;
  storeId: string;
  projectId: string;
  slotIndex: number;
  aspectRatio: "9:16" | "1:1" | "4:5" | "16:9";
  agentDraft: AgentPromptDraft;
}): Promise<{ assetId: string }> {
  const db = getDb();
  // Create the asset row up-front in "rendering" so the UI can show
  // a loading tile.
  const asset = await db.creativeAsset.create({
    data: {
      projectId: input.projectId,
      assetType: "IMAGE",
      status: "rendering",
      promptUsed: input.prompt,
      providerName: "higgsfield"
    }
  });

  try {
    const job = await createHiggsfieldJob({
      assetType: "image",
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      idempotencyKey: asset.id
    });
    const completed = job.status === "completed" ? job : await pollHiggsfieldUntilDone(job.id);
    if (completed.status !== "completed" || !completed.assetUrl) {
      throw new Error(completed.errorMessage || `Higgsfield ended in status=${completed.status}`);
    }

    const bytes = await downloadHiggsfieldAsset(completed.assetUrl);
    const mimeType = completed.assetMimeType || "image/png";
    const ext = mimeType === "image/png" ? "png" : "webp";
    const filename = suggestFilename(`quick-${input.slotIndex}.${ext}`);
    const storageKey = buildStorageKey({
      storeId: input.storeId,
      scope: "assets",
      segments: ["quick-batch", input.projectId],
      filename
    });
    await putObject({ key: storageKey, body: bytes, contentType: mimeType });

    await db.creativeAsset.update({
      where: { id: asset.id },
      data: {
        storageKey,
        rawStorageKey: storageKey,
        status: "ready",
        width: completed.width,
        height: completed.height,
        providerJobId: completed.id,
        metaJson: {
          higgsfieldAssetUrl: completed.assetUrl,
          higgsfieldThumbnailUrl: completed.thumbnailUrl,
          agentLabel: input.agentDraft.label,
          agentHeadline: input.agentDraft.headline,
          agentBody: input.agentDraft.body
        } as unknown as Prisma.InputJsonValue
      }
    });
    return { assetId: asset.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.creativeAsset
      .update({
        where: { id: asset.id },
        data: { status: "failed", errorMessage: message.slice(0, 500) }
      })
      .catch(() => {
        // best-effort
      });
    throw err;
  }
}

export async function runCreativeQuickBatch(input: QuickBatchInput): Promise<QuickBatchResult> {
  await assertStoreInActiveOrg(input.storeId);

  const count = Math.max(1, Math.min(10, input.count ?? 5));
  const aspectRatio = input.aspectRatio ?? "9:16";

  // Step 1 — ask the Creative agent for N visual prompts.
  const drafts = await askCreativeAgentJson<AgentPromptDraft[]>({
    question: buildCreativePrompt({ ...input, count }),
    jsonHint: `array of ${count} concept objects`,
    timeoutMs: 90_000
  });
  if (!Array.isArray(drafts) || drafts.length === 0) {
    throw new AppError("Creative agent returned no concepts.", 502);
  }
  const usedDrafts = drafts.slice(0, count);
  // Pad with safe fallbacks if the agent under-delivered.
  while (usedDrafts.length < count) {
    usedDrafts.push({
      label: `fallback-${usedDrafts.length + 1}`,
      visualPrompt: `Clean vertical 9:16 product hero shot for ${input.theme}, soft studio lighting, premium feel.`
    });
  }

  // Step 2 — create the parent CreativeProject so all N assets share a
  // container and appear as a single entry in /creative history.
  const db = getDb();
  const project = await db.creativeProject.create({
    data: {
      storeId: input.storeId,
      name: input.theme.slice(0, 80),
      creativeType: "META_AD",
      aspectRatio,
      provider: "higgsfield",
      status: "generating",
      targetCount: count,
      briefJson: {
        source: "creative-quick-batch",
        theme: input.theme,
        productName: input.productName ?? null,
        brandNotes: input.brandNotes ?? null,
        agentDrafts: usedDrafts
      } as unknown as Prisma.InputJsonValue
    }
  });

  // Step 3 — fan out N Higgsfield jobs in parallel (bounded 3 to be nice
  // to the provider). Failures are per-asset.
  let succeeded = 0;
  let failed = 0;
  const concurrency = 3;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, usedDrafts.length) }, async () => {
    while (true) {
      const i = cursor;
      cursor += 1;
      if (i >= usedDrafts.length) return;
      const draft = usedDrafts[i];
      try {
        await generateOneAsset({
          prompt: draft.visualPrompt,
          storeId: input.storeId,
          projectId: project.id,
          slotIndex: i + 1,
          aspectRatio,
          agentDraft: draft
        });
        succeeded += 1;
      } catch (err) {
        failed += 1;
        console.error(`[quick-batch] slot ${i + 1} failed:`, err);
      }
    }
  });
  await Promise.all(workers);

  // Step 4 — finalize project status. "ready" if any succeeded, "archived"
  // if all failed (so it doesn't clog the list but is still inspectable).
  await db.creativeProject.update({
    where: { id: project.id },
    data: {
      status: succeeded > 0 ? "ready" : "archived"
    }
  });

  return {
    projectId: project.id,
    succeeded,
    failed,
    prompts: usedDrafts.map((d) => d.visualPrompt)
  };
}
