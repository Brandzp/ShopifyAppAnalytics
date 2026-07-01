// POST /api/gantt/[sheetId]/insights — ask the BI agent to read the
// parsed Gantt and produce insights: timeline risk, channel coverage,
// promotional clashes, gaps, prep-time concerns, etc.
//
// Result is cached on GanttSheet.insightsJson so re-opening the UI is
// instant. Force-regenerate with ?refresh=1.

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { getDb } from "@/lib/server/db";
import {
  askBiAgentJson,
  isBiAgentConfigured
} from "@/lib/clients/bi-agent-client";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface GanttInsightsPayload {
  summary: string;
  insights: Array<{
    title: string;
    severity: "info" | "warning" | "critical";
    body: string;
    // Optional: dates this insight relates to so the UI can highlight
    // them on the calendar.
    relatedDates?: string[];
    relatedCategories?: string[];
  }>;
  actions: Array<{
    title: string;
    body: string;
    suggestedDate?: string;
    suggestedActionType?: string;
  }>;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ sheetId: string }> }
) {
  try {
    const { sheetId } = await context.params;
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);
    await assertStoreInActiveOrg(storeId);

    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get("refresh") === "1";

    const db = getDb();
    const sheet = await db.ganttSheet.findFirst({
      where: { id: sheetId, storeId },
      include: { rows: { orderBy: [{ startDate: "asc" }, { rowIndex: "asc" }] } }
    });
    if (!sheet) throw new AppError("Sheet not found.", 404);

    // Return cached unless caller forced a refresh.
    if (!forceRefresh && sheet.insightsJson) {
      return NextResponse.json({
        ok: true,
        cached: true,
        generatedAt: sheet.insightsGeneratedAt?.toISOString() ?? null,
        insights: sheet.insightsJson
      });
    }

    if (!isBiAgentConfigured()) {
      throw new AppError(
        "BI agent is not configured (BI_AGENT_URL / BI_AGENT_TOKEN missing).",
        503
      );
    }

    // Compact the row data into a digest the agent can reason about
    // without blowing context. We list each task by date + channel +
    // role + first 120 chars of the description.
    const ROW_PREVIEW_CHARS = 120;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rowsDigest = sheet.rows.map((r: any) => ({
      date: r.startDate ? r.startDate.toISOString().slice(0, 10) : null,
      category: r.category,
      role: r.role,
      action: r.actionType,
      task:
        r.task.length > ROW_PREVIEW_CHARS
          ? r.task.slice(0, ROW_PREVIEW_CHARS) + "…"
          : r.task
    }));

    const question = [
      `You are a senior marketing strategist reviewing a marketing calendar (Gantt).`,
      `The calendar covers ${sheet.rangeStart?.toISOString().slice(0, 10) ?? "?"} → ${sheet.rangeEnd?.toISOString().slice(0, 10) ?? "?"}.`,
      `Channels in use: ${(sheet.categoriesJson as string[]).join(", ") || "(none labeled)"}.`,
      `Roles in use: ${(sheet.rolesJson as string[]).join(", ") || "(none labeled)"}.`,
      ``,
      `Calendar data (each task is one channel × one date cell):`,
      JSON.stringify(rowsDigest, null, 2),
      ``,
      `Output a JSON object with this shape:`,
      `{`,
      `  "summary": "2-3 sentence executive summary of the calendar.",`,
      `  "insights": [`,
      `    {`,
      `      "title": "Short headline (≤8 words).",`,
      `      "severity": "info" | "warning" | "critical",`,
      `      "body": "1-3 sentences. Specific, evidence-based.",`,
      `      "relatedDates": ["YYYY-MM-DD"],   // optional, dates this is about`,
      `      "relatedCategories": ["..."]      // optional, channels this is about`,
      `    }`,
      `  ],`,
      `  "actions": [`,
      `    {`,
      `      "title": "Imperative recommendation.",`,
      `      "body": "Why + what to do, 1-2 sentences.",`,
      `      "suggestedDate": "YYYY-MM-DD",                 // optional`,
      `      "suggestedActionType": "discount_code" | "creative_image" | "creative_banner" | "creative_video" | "social_post" | "email_campaign" | "sms_campaign" | "web_update" | "blog_post"  // optional`,
      `    }`,
      `  ]`,
      `}`,
      ``,
      `Focus on (use Hebrew labels in titles/body when the input is Hebrew — the calendar audience is Israeli):`,
      `  - Days with too much/too little going on (channel overload / gaps).`,
      `  - Promotional clashes (two competing offers same day).`,
      `  - Missing creative prep time (a launch with no banner work scheduled).`,
      `  - Coverage gaps (e.g. an Instagram story without a backing post).`,
      `  - Promo codes mentioned in task text that aren't created in Shopify yet.`,
      `  - Holiday alignment (Israeli market — pay attention to dates).`,
      `Return at most 6 insights and at most 6 actions. Pick the highest-leverage ones.`
    ].join("\n");

    let agentJson: GanttInsightsPayload | null = null;
    try {
      agentJson = await askBiAgentJson<GanttInsightsPayload>({
        question,
        jsonHint: "object with summary:string, insights:array, actions:array",
        timeoutMs: 60_000
      });
    } catch (err) {
      throw new AppError(
        `BI agent failed: ${err instanceof Error ? err.message : String(err)}`,
        502
      );
    }

    // Validate the shape just enough to refuse junk.
    if (!agentJson || typeof agentJson.summary !== "string") {
      throw new AppError("BI agent returned malformed insights.", 502);
    }
    if (!Array.isArray(agentJson.insights)) agentJson.insights = [];
    if (!Array.isArray(agentJson.actions)) agentJson.actions = [];

    const updated = await db.ganttSheet.update({
      where: { id: sheet.id },
      data: {
        insightsJson: agentJson as object,
        insightsGeneratedAt: new Date()
      }
    });

    return NextResponse.json({
      ok: true,
      cached: false,
      generatedAt: updated.insightsGeneratedAt?.toISOString() ?? null,
      insights: agentJson
    });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
