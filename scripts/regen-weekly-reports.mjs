// regen-weekly-reports.mjs — SA-BUG-005
//
// One-shot admin utility to clear corrupted WeeklyReport rows left behind by
// the historical mojibake bug (SA-BUG-002) and re-trigger weekly/monthly
// report generation.
//
// BACKGROUND
//   SA-BUG-002 double-encoded Hebrew text (UTF-8 bytes re-interpreted as
//   Windows-1252) before persisting it into WeeklyReport. The source-level fix
//   landed in commit 964459d (summary-service.ts), so NEW rows are clean — but
//   OLD rows still carry the garbled content inside their JSON.
//
//   The normal regen route is  POST /api/weekly-summary/cron/run  with
//   {weekly:true,monthly:true}. That route's findReportForPeriod() is
//   IDEMPOTENT: it SKIPS any existing (storeId, kind, periodStart, periodEnd)
//   row. So the corrupted rows will NEVER be overwritten by the cron — they
//   MUST be deleted first. That is exactly what this script does.
//
// SCHEMA NOTE
//   The live Prisma model (prisma/schema.prisma) stores report content in
//   `dataJson` (Json, NOT NULL) and `insightsJson` (Json?). There is no
//   `summary` column on WeeklyReport — the SA-BUG-002 corruption lives inside
//   the serialized JSON (e.g. the AI `headline` and the Hebrew insight blocks).
//   This script therefore scans the serialized JSON of BOTH columns for the
//   mojibake markers, and additionally inspects any nested `headline` field.
//
// USAGE
//   node scripts/regen-weekly-reports.mjs            # dry-run (default) — no deletes
//   node scripts/regen-weekly-reports.mjs --dry-run  # explicit dry-run
//   node scripts/regen-weekly-reports.mjs --execute  # actually delete + re-trigger regen
//
// ENV (loaded from .env.local then .env, else process.env)
//   DATABASE_URL  (required)  — same connection string the app uses
//   APP_URL       (optional)  — if set, the script POSTs the regen endpoint
//   CRON_SECRET   (optional)  — sent as a bearer token + x-cron-secret header

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// scripts/ lives one level under the repo root.
const REPO_ROOT = path.resolve(__dirname, "..");

// ── Minimal .env loader ──────────────────────────────────────────────────
// The repo has no `dotenv` dependency and standalone scripts don't get
// Next.js's automatic env loading, so we parse the files ourselves. Existing
// process.env values always win (never clobber an explicitly-exported var).
function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return 0;
  let loaded = 0;
  const raw = readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // Strip a single layer of matching surrounding quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
      loaded++;
    }
  }
  return loaded;
}

// Load .env.local first (higher priority), then .env as a fallback. Because
// loadEnvFile never overwrites an already-set var, .env.local wins.
loadEnvFile(path.join(REPO_ROOT, ".env.local"));
loadEnvFile(path.join(REPO_ROOT, ".env"));

// ── Args ───────────────────────────────────────────────────────────────────
const args = new Set(process.argv.slice(2));
// Dry-run is the default. Only an explicit --execute turns off dry-run.
const EXECUTE = args.has("--execute");
const DRY_RUN = !EXECUTE; // --dry-run is accepted but is also the default.

// ── Mojibake detection ───────────────────────────────────────────────────
// Markers that indicate Windows-1252 double-encoding of Hebrew/UTF-8 text, or
// a lossy "?"-replacement. Matches the heuristic in the SA-BUG-005 task:
//   Ã  ×  Ø  �   (corrupted byte sequences rendered back to text)
//   ???          (literal triple-question-mark from a lossy round-trip)
const MARKER_CHARS = ["Ã", "×", "Ø", "�"]; // Ã × Ø �
const TRIPLE_Q = "???";

function findMarkers(text) {
  if (typeof text !== "string" || text.length === 0) return [];
  const hits = [];
  for (const m of MARKER_CHARS) {
    if (text.includes(m)) hits.push(m);
  }
  if (text.includes(TRIPLE_Q)) hits.push(TRIPLE_Q);
  return hits;
}

// Walk an arbitrary JSON value, collecting any nested `headline` string values
// so we can report the headline specifically (SA-BUG-002's primary victim).
function collectHeadlines(value, out) {
  if (value == null) return;
  if (Array.isArray(value)) {
    for (const item of value) collectHeadlines(item, out);
    return;
  }
  if (typeof value === "object") {
    for (const [key, v] of Object.entries(value)) {
      if (key === "headline" && typeof v === "string") out.push(v);
      collectHeadlines(v, out);
    }
  }
}

// A row is corrupt if the serialized JSON of either content column contains a
// marker. We serialize the whole object so we catch corruption anywhere in the
// nested structure (headline, Hebrew section titles, insight blocks, etc.).
function inspectRow(row) {
  const dataStr = row.dataJson != null ? JSON.stringify(row.dataJson) : "";
  const insightsStr = row.insightsJson != null ? JSON.stringify(row.insightsJson) : "";

  const markerSet = new Set([
    ...findMarkers(dataStr),
    ...findMarkers(insightsStr),
  ]);

  // Headline-specific check (kept explicit per the task) — even though it is
  // already covered by the serialized-JSON scan above, surfacing the headline
  // makes the dry-run report readable.
  const headlines = [];
  collectHeadlines(row.dataJson, headlines);
  collectHeadlines(row.insightsJson, headlines);
  const corruptHeadline =
    headlines.find((h) => findMarkers(h).length > 0) ?? null;

  return {
    corrupt: markerSet.size > 0,
    markers: [...markerSet],
    headlinePreview: corruptHeadline
      ? corruptHeadline.slice(0, 80)
      : headlines[0]
        ? headlines[0].slice(0, 80)
        : null,
  };
}

// ── Regen trigger ──────────────────────────────────────────────────────────
const REGEN_PATH = "/api/weekly-summary/cron/run";
const REGEN_BODY = { weekly: true, monthly: true };

function buildCurlCommand(appUrl) {
  const base = appUrl ?? "$APP_URL";
  const secret = process.env.CRON_SECRET ? "$CRON_SECRET" : "$CRON_SECRET";
  return [
    `curl -X POST "${base}${REGEN_PATH}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -H "Authorization: Bearer ${secret}" \\`,
    `  -H "x-cron-secret: ${secret}" \\`,
    `  -d '${JSON.stringify(REGEN_BODY)}'`,
  ].join("\n");
}

async function triggerRegen() {
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  if (!appUrl) {
    console.log(
      "\nAPP_URL is not set — not auto-triggering regen. Run this manually once the app is up:\n",
    );
    console.log(buildCurlCommand(null));
    console.log(
      "\n(Set $APP_URL and $CRON_SECRET in your shell first. Note: in the current\n" +
        " middleware this route is session-gated unless it is moved under /api/cron/*,\n" +
        " so an unauthenticated curl may 401 — trigger it from a signed-in session,\n" +
        " or via the in-process ENABLE_WEEKLY_REPORT_CRON scheduler.)",
    );
    return;
  }

  const url = `${appUrl}${REGEN_PATH}`;
  const headers = { "Content-Type": "application/json" };
  if (process.env.CRON_SECRET) {
    // Send both: the bearer form (per the task spec) and the header the
    // codebase's middleware actually checks (x-cron-secret), so whichever
    // gate the deployment uses is satisfied.
    headers["Authorization"] = `Bearer ${process.env.CRON_SECRET}`;
    headers["x-cron-secret"] = process.env.CRON_SECRET;
  }

  console.log(`\nTriggering regen: POST ${url}`);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(REGEN_BODY),
    });
    const text = await res.text();
    if (res.ok) {
      console.log(`Regen responded ${res.status}: ${text.slice(0, 500)}`);
    } else {
      console.warn(`Regen returned non-OK ${res.status}: ${text.slice(0, 500)}`);
      if (res.status === 401 || res.status === 403) {
        console.warn(
          "  → This route is session-protected in the current middleware. Run\n" +
            "    the equivalent request from a signed-in session, or trigger the\n" +
            "    in-process weekly-report scheduler. Curl form for reference:\n",
        );
        console.warn(buildCurlCommand(appUrl));
      }
    }
  } catch (err) {
    console.warn(
      `Could not reach ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
    console.warn("Is the app running? Manual trigger command:\n");
    console.warn(buildCurlCommand(appUrl));
  }
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log("─".repeat(72));
  console.log("SA-BUG-005 — clear corrupted WeeklyReport rows + re-trigger regen");
  console.log(`Mode: ${EXECUTE ? "EXECUTE (will delete)" : "DRY-RUN (no deletes)"}`);
  console.log("─".repeat(72));

  if (!process.env.DATABASE_URL) {
    console.error(
      "ERROR: DATABASE_URL is not set. Add it to .env / .env.local or export it,\n" +
        "then re-run. (This is the same connection string the app uses.)",
    );
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  try {
    // Pull only the columns we need to keep the payload small.
    const rows = await prisma.weeklyReport.findMany({
      select: {
        id: true,
        storeId: true,
        kind: true,
        periodStart: true,
        periodEnd: true,
        dataJson: true,
        insightsJson: true,
        generatedAt: true,
      },
      orderBy: { generatedAt: "asc" },
    });

    console.log(`Scanned ${rows.length} WeeklyReport row(s).`);

    const corrupt = [];
    for (const row of rows) {
      const result = inspectRow(row);
      if (result.corrupt) corrupt.push({ row, result });
    }

    if (corrupt.length === 0) {
      console.log(
        "\nNo corrupted rows found — nothing to delete. (New rows from the\n" +
          "964459d fix are clean.) Exiting.",
      );
      return;
    }

    console.log(`\nFound ${corrupt.length} corrupted row(s):\n`);
    for (const { row, result } of corrupt) {
      const period =
        `${row.periodStart.toISOString().slice(0, 10)}` +
        `..${row.periodEnd.toISOString().slice(0, 10)}`;
      console.log(
        `  • id=${row.id}  store=${row.storeId}  kind=${row.kind}  period=${period}`,
      );
      console.log(`      markers: ${result.markers.join(" ")}`);
      if (result.headlinePreview) {
        console.log(`      headline: ${result.headlinePreview}`);
      }
    }

    // Per-(store,kind) breakdown so the owner can sanity-check the blast radius.
    const byStoreKind = new Map();
    for (const { row } of corrupt) {
      const key = `${row.storeId}::${row.kind}`;
      byStoreKind.set(key, (byStoreKind.get(key) ?? 0) + 1);
    }
    console.log("\nSummary by (storeId, kind):");
    for (const [key, count] of byStoreKind) {
      const [storeId, kind] = key.split("::");
      console.log(`  ${storeId}  ${kind}  → ${count} row(s)`);
    }

    if (DRY_RUN) {
      console.log(
        `\nDRY-RUN: would delete ${corrupt.length} row(s). No changes made.\n` +
          "Re-run with --execute to actually delete them and re-trigger regen.",
      );
      return;
    }

    // ── EXECUTE ──────────────────────────────────────────────────────────
    const idsToDelete = corrupt.map(({ row }) => row.id);
    const del = await prisma.weeklyReport.deleteMany({
      where: { id: { in: idsToDelete } },
    });
    console.log(`\nDeleted ${del.count} corrupted WeeklyReport row(s).`);

    await triggerRegen();

    console.log(
      `\nDONE: deleted ${del.count} row(s); regen ${
        process.env.APP_URL ? "trigger attempted" : "command printed for manual run"
      }.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.stack : err);
  process.exitCode = 1;
});
