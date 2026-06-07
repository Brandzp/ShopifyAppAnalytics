// Higgsfield AI provider client.
//
// Higgsfield offers two product families that map cleanly onto our Creative
// feature:
//   - Soul (image generation) → covers PACKSHOT / INSTAGRAM_POST / META_AD
//   - DoP / Higgsfield Video (image-to-video with cinematic camera motion)
//     → covers UGC_VIDEO and gives us a second video provider beside Veo.
//
// Their API uses an async pattern: POST a generation request, get an id,
// poll the status endpoint until the asset is ready, then download from the
// returned URL. This file implements a sync wrapper (submit → poll → fetch
// bytes) so callers can use it the same way they use the Replicate service
// for M1. The M2 queue worker will swap to fire-and-forget + webhook.
//
// ─────────────────────────────────────────────────────────────────────────
// NOTE on endpoint paths and request shape:
// Higgsfield's public API surface evolves quickly and exact paths sometimes
// change between rollouts. The constants below match their documented v1
// shape; if a request 404s or 422s, check the latest docs and adjust the
// HIGGSFIELD_* env vars or the keys in `buildImagePayload`/`buildVideoPayload`
// below — the rest of the integration (auth, polling, file download) is
// generic.
// ─────────────────────────────────────────────────────────────────────────

import type { BuiltPrompt } from "@/lib/services/creative-prompt-templates";
import type { CreativeAspectRatio } from "@/lib/domain/creative-types";

const DEFAULT_BASE_URL = "https://api.higgsfield.ai/v1";
const DEFAULT_IMAGE_MODEL = "soul";
const DEFAULT_VIDEO_MODEL = "dop-v1";
const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

interface HiggsfieldGenerationStatus {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | string;
  output_url?: string;
  output?: { url?: string };
  error?: string | { message?: string };
}

function getApiKey(): string {
  const key = process.env.HIGGSFIELD_API_KEY;
  if (!key) {
    throw new Error("HIGGSFIELD_API_KEY is not set. Add it to .env to use the Higgsfield provider.");
  }
  return key;
}

function getBaseUrl(): string {
  return (process.env.HIGGSFIELD_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    "Content-Type": "application/json"
  };
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const response = await fetch(url, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Higgsfield ${path} failed: ${response.status} ${text.slice(0, 200)}`);
  }
  return (await response.json()) as T;
}

async function getJson<T>(path: string): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const response = await fetch(url, { method: "GET", headers: authHeaders() });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Higgsfield ${path} failed: ${response.status} ${text.slice(0, 200)}`);
  }
  return (await response.json()) as T;
}

async function pollUntilComplete(generationId: string): Promise<HiggsfieldGenerationStatus> {
  const deadline = Date.now() + DEFAULT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = await getJson<HiggsfieldGenerationStatus>(`/generations/${generationId}`);
    if (status.status === "completed") return status;
    if (status.status === "failed") {
      const message = typeof status.error === "string" ? status.error : status.error?.message;
      throw new Error(`Higgsfield generation failed: ${message ?? "no message"}`);
    }
    await new Promise((resolve) => setTimeout(resolve, DEFAULT_POLL_INTERVAL_MS));
  }
  throw new Error(`Higgsfield generation timed out after ${DEFAULT_TIMEOUT_MS}ms.`);
}

async function downloadAsBuffer(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download Higgsfield output: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    buffer,
    contentType: response.headers.get("content-type") ?? "application/octet-stream"
  };
}

/**
 * Higgsfield doesn't take a raw multipart upload in its generation endpoint —
 * it expects a publicly fetchable URL. For local dev we POST the bytes to
 * their assets endpoint first and get back a URL we can pass to the
 * generation call. Mirrors the Replicate `files.create()` pattern.
 */
async function uploadReferenceImage(input: {
  buffer: Buffer;
  contentType: string;
}): Promise<string> {
  // Higgsfield's asset upload uses a presigned-URL flow: POST metadata,
  // receive a put URL + final URL, PUT the bytes. We expose this as one
  // async call.
  const meta = await postJson<{ upload_url: string; asset_url: string }>(`/assets`, {
    content_type: input.contentType,
    byte_length: input.buffer.length
  });
  const putResponse = await fetch(meta.upload_url, {
    method: "PUT",
    headers: { "Content-Type": input.contentType },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: input.buffer as any
  });
  if (!putResponse.ok) {
    throw new Error(`Higgsfield asset PUT failed: ${putResponse.status}`);
  }
  return meta.asset_url;
}

export interface HiggsfieldGenerateImageInput {
  prompt: BuiltPrompt;
  aspectRatio: CreativeAspectRatio;
  referenceImageBuffer?: { buffer: Buffer; contentType: string } | null;
  seed?: number;
  model?: string;
}

export interface HiggsfieldGenerateImageOutput {
  buffer: Buffer;
  contentType: string;
  modelUsed: string;
  promptUsed: string;
  seedUsed: number | null;
}

export async function higgsfieldGenerateImage(
  input: HiggsfieldGenerateImageInput
): Promise<HiggsfieldGenerateImageOutput> {
  const model = input.model || process.env.HIGGSFIELD_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;

  const referenceUrl = input.referenceImageBuffer
    ? await uploadReferenceImage(input.referenceImageBuffer)
    : null;

  const payload = buildImagePayload({
    model,
    prompt: input.prompt.prompt,
    negativePrompt: input.prompt.negativePrompt,
    aspectRatio: input.aspectRatio,
    referenceUrl,
    seed: input.seed
  });

  const created = await postJson<{ id: string }>(`/generations`, payload);
  const status = await pollUntilComplete(created.id);
  const url = status.output_url || status.output?.url;
  if (!url) {
    throw new Error("Higgsfield completed without an output URL.");
  }
  const downloaded = await downloadAsBuffer(url);
  return {
    buffer: downloaded.buffer,
    contentType: downloaded.contentType,
    modelUsed: `higgsfield/${model}`,
    promptUsed: input.prompt.prompt,
    seedUsed: typeof input.seed === "number" ? input.seed : null
  };
}

function buildImagePayload(args: {
  model: string;
  prompt: string;
  negativePrompt: string;
  aspectRatio: CreativeAspectRatio;
  referenceUrl: string | null;
  seed?: number;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model: args.model,
    type: "image",
    prompt: args.prompt,
    negative_prompt: args.negativePrompt || undefined,
    aspect_ratio: args.aspectRatio
  };
  if (args.referenceUrl) {
    payload.reference_image_url = args.referenceUrl;
  }
  if (typeof args.seed === "number") {
    payload.seed = args.seed;
  }
  return payload;
}

export interface HiggsfieldGenerateVideoInput {
  prompt: BuiltPrompt;
  aspectRatio: CreativeAspectRatio;
  // Higgsfield is image-to-video — you must provide a source frame.
  referenceImageBuffer: { buffer: Buffer; contentType: string };
  durationSeconds?: number;
  seed?: number;
  model?: string;
}

export interface HiggsfieldGenerateVideoOutput {
  buffer: Buffer;
  contentType: string;
  modelUsed: string;
  promptUsed: string;
  seedUsed: number | null;
  durationMs: number | null;
}

export async function higgsfieldGenerateVideo(
  input: HiggsfieldGenerateVideoInput
): Promise<HiggsfieldGenerateVideoOutput> {
  const model = input.model || process.env.HIGGSFIELD_VIDEO_MODEL || DEFAULT_VIDEO_MODEL;
  const referenceUrl = await uploadReferenceImage(input.referenceImageBuffer);

  const payload = buildVideoPayload({
    model,
    prompt: input.prompt.prompt,
    negativePrompt: input.prompt.negativePrompt,
    aspectRatio: input.aspectRatio,
    referenceUrl,
    durationSeconds: input.durationSeconds ?? 6,
    seed: input.seed
  });

  const created = await postJson<{ id: string }>(`/generations`, payload);
  const status = await pollUntilComplete(created.id);
  const url = status.output_url || status.output?.url;
  if (!url) {
    throw new Error("Higgsfield video completed without an output URL.");
  }
  const downloaded = await downloadAsBuffer(url);
  return {
    buffer: downloaded.buffer,
    contentType: downloaded.contentType,
    modelUsed: `higgsfield/${model}`,
    promptUsed: input.prompt.prompt,
    seedUsed: typeof input.seed === "number" ? input.seed : null,
    durationMs: (input.durationSeconds ?? 6) * 1000
  };
}

function buildVideoPayload(args: {
  model: string;
  prompt: string;
  negativePrompt: string;
  aspectRatio: CreativeAspectRatio;
  referenceUrl: string;
  durationSeconds: number;
  seed?: number;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model: args.model,
    type: "video",
    prompt: args.prompt,
    negative_prompt: args.negativePrompt || undefined,
    aspect_ratio: args.aspectRatio,
    source_image_url: args.referenceUrl,
    duration_seconds: args.durationSeconds
  };
  if (typeof args.seed === "number") {
    payload.seed = args.seed;
  }
  return payload;
}
