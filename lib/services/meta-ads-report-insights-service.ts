// Hebrew AI-generated insights for the weekly Meta Ads report.
//
// Given a brand bucket plus an optional prior-week snapshot, produces:
//   • hookLine — one-sentence Hebrew summary of the week
//   • observations (2-4 bullets) — concrete patterns the AI saw in the data,
//     not metric restatements. Each must reference at least one real number
//     AND explain the implication.
//   • actions (2-3 bullets) — verb-led recommendations for next week
//     (Pause / Scale / Test / Shift budget / Refresh creative…).
//
// What we feed the model:
//   • Headline KPIs (spend / CPC / CPM / CTR / ROAS / purchases)
//   • Full funnel (Impressions → Clicks → LPV → ATC → IC → Purchase)
//   • Daily breakdown (so it can call out trends like "drop on day 5")
//   • Top campaigns + top ads
//   • Optional prior-week comparison (delta % per KPI + winner/loser ads)
//
// Provider waterfall (via lib/clients/ai-insights-client):
//   1. Brandzp BI agent (askBiAgentJson) — primary; domain-tuned
//   2. OpenAI gpt-4o-mini — fallback if BI is unconfigured or throws
//   3. Deterministic fallback content if both fail (no fabrication)

import type { MetaAdsReportBrand } from "@/lib/services/meta-ads-report-service";
import { generateInsightsJson } from "@/lib/clients/ai-insights-client";

export interface BrandInsights {
  hookLine: string;
  observations: string[];
  actions: string[];
}

// Optional prior-period snapshot the caller can compute and pass in for
// week-over-week comparison. Keep it small and pre-aggregated — the model
// doesn't need raw rows again, just deltas.
export interface PriorWeekSnapshot {
  spend: number;
  clicks: number;
  impressions: number;
  purchases: number;
  purchaseRoas: number | null;
  ctr: number;
  cpc: number;
}

const OPENAI_MODEL = "gpt-4o-mini";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

function fallbackInsights(brand: MetaAdsReportBrand, isHe: boolean): BrandInsights {
  // No-fabrication fallback. The message is intentionally neutral — both
  // the BI agent and OpenAI failed, so we can't say which fix is needed.
  // Check server logs for the underlying error.
  if (isHe) {
    return {
      hookLine: `${brand.name} — סה״כ הוצאה ₪${Math.round(brand.kpis.spend).toLocaleString("he-IL")} ו־${brand.kpis.purchases} רכישות השבוע.`,
      observations: [
        "תובנות אוטומטיות לא זמינות כרגע. סוכן ה-BI ו-OpenAI שניהם נכשלו.",
        "ניתן לצפות בנתונים המלאים בטבלאות שלמטה."
      ],
      actions: ["בדקו את לוגי השרת לפרטי השגיאה."]
    };
  }
  return {
    hookLine: `${brand.name} — total spend ₪${Math.round(brand.kpis.spend)} and ${brand.kpis.purchases} purchases this week.`,
    observations: [
      "Automatic insights unavailable. Both BI agent and OpenAI failed.",
      "Full numbers are in the tables below."
    ],
    actions: ["Check server logs for the underlying error."]
  };
}

interface OpenAIChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

interface RawInsights {
  hookLine?: string;
  observations?: string[];
  actions?: string[];
}

function pct(numerator: number, denominator: number): string {
  if (denominator <= 0) return "n/a";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function deltaPct(current: number, prior: number): string {
  if (prior === 0) return "n/a";
  const change = ((current - prior) / prior) * 100;
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}%`;
}

function buildPrompt(
  brand: MetaAdsReportBrand,
  dateRange: { start: string; end: string },
  prior: PriorWeekSnapshot | null,
  _locale: "he" | "en"
): string {
  const lines: string[] = [];
  lines.push(`Brand: ${brand.name}`);
  lines.push(`Date range: ${dateRange.start} → ${dateRange.end}`);
  lines.push("");

  // Headline KPIs.
  lines.push("HEADLINE KPIs:");
  lines.push(
    `  spend ₪${brand.kpis.spend.toFixed(2)} | CPC ₪${brand.kpis.cpc.toFixed(2)} | CPM ₪${brand.kpis.cpm.toFixed(2)} | CTR ${brand.kpis.ctr.toFixed(2)}%`
  );
  lines.push(
    `  clicks ${brand.kpis.clicks} | impressions ${brand.kpis.impressions} | purchases ${brand.kpis.purchases} | ROAS ${brand.kpis.purchaseRoas != null ? brand.kpis.purchaseRoas.toFixed(2) + "x" : "n/a"}`
  );

  // Week-over-week deltas (huge for "is this trending up or down" framing).
  if (prior) {
    lines.push("");
    lines.push("WEEK-OVER-WEEK CHANGE (this week vs prior):");
    lines.push(`  spend: ${deltaPct(brand.kpis.spend, prior.spend)}`);
    lines.push(`  clicks: ${deltaPct(brand.kpis.clicks, prior.clicks)}`);
    lines.push(`  impressions: ${deltaPct(brand.kpis.impressions, prior.impressions)}`);
    lines.push(`  purchases: ${deltaPct(brand.kpis.purchases, prior.purchases)}`);
    lines.push(`  CPC: ${deltaPct(brand.kpis.cpc, prior.cpc)} (lower is better)`);
    lines.push(`  CTR: ${deltaPct(brand.kpis.ctr, prior.ctr)}`);
    if (prior.purchaseRoas != null && brand.kpis.purchaseRoas != null) {
      lines.push(`  ROAS: ${deltaPct(brand.kpis.purchaseRoas, prior.purchaseRoas)}`);
    }
  }

  // Funnel — this is where "where do users fall off" insights come from.
  const f = brand.funnel;
  lines.push("");
  lines.push("CONVERSION FUNNEL (step → step %):");
  lines.push(`  impressions: ${f.impressions}`);
  lines.push(`  → clicks: ${f.clicks} (${pct(f.clicks, f.impressions)} of impressions)`);
  lines.push(`  → landing page views: ${f.landingPageViews} (${pct(f.landingPageViews, f.clicks)} of clicks)`);
  lines.push(`  → add to cart: ${f.addToCart} (${pct(f.addToCart, f.landingPageViews)} of LPVs)`);
  lines.push(`  → initiate checkout: ${f.initiateCheckout} (${pct(f.initiateCheckout, f.addToCart)} of ATCs)`);
  lines.push(`  → purchase: ${f.purchases} (${pct(f.purchases, f.initiateCheckout)} of ICs)`);

  // Daily breakdown — lets the model spot weekday/weekend patterns or
  // monotonic decline.
  if (brand.daily.length > 0) {
    lines.push("");
    lines.push(`DAILY BREAKDOWN (${brand.daily.length} days):`);
    for (const d of brand.daily) {
      lines.push(
        `  ${d.date}: spend ₪${d.spend.toFixed(0)} | clicks ${d.clicks} | purchases ${d.purchases} | ROAS ${d.purchaseRoas != null ? d.purchaseRoas.toFixed(2) + "x" : "—"}`
      );
    }
  }

  // Campaigns.
  lines.push("");
  lines.push(`CAMPAIGNS (${brand.campaigns.length}, sorted by spend):`);
  for (const c of brand.campaigns.slice(0, 12)) {
    lines.push(
      `  "${c.campaignName}" — spend ₪${c.spend.toFixed(0)} | clicks ${c.clicks} | CPC ₪${c.cpc.toFixed(2)} | CTR ${c.ctr.toFixed(2)}% | purchases ${c.purchases} | ROAS ${c.purchaseRoas != null ? c.purchaseRoas.toFixed(2) + "x" : "—"}`
    );
  }

  // Top ads with creative-level signals.
  if (brand.ads.length > 0) {
    lines.push("");
    lines.push(`TOP ADS (${Math.min(10, brand.ads.length)} of ${brand.ads.length}):`);
    for (const a of brand.ads.slice(0, 10)) {
      lines.push(
        `  "${a.adName ?? "?"}" in adset "${a.adsetName ?? "?"}" — spend ₪${a.spend.toFixed(0)} | clicks ${a.clicks} | CPC ₪${a.cpc.toFixed(2)} | purchases ${a.purchases} | ROAS ${a.purchaseRoas != null ? a.purchaseRoas.toFixed(2) + "x" : "—"}`
      );
    }
  }

  return lines.join("\n");
}

// System prompt — this is where insight QUALITY actually lives. The prior
// version asked for "observations + actions" generically and got back
// "spend was ₪5,000, ROAS was 3.5x" — useless. This version forces the
// model to identify SPECIFIC PATTERNS (trend, winner, loser, funnel
// bottleneck) and tie every observation to a concrete recommendation.
function buildSystemPrompt(locale: "he" | "en"): string {
  const heGuidance = `
שפת המוצא: עברית טבעית של מקצוען. אסור להשתמש באנגלית מלבד שמות קמפיינים, שמות מודעות, ויחידות מידה (₪, %, x). הימנעו ממילים כמו "אופטימיזציה" / "סינרגיה" / "פוטנציאל" — דברו כמו מנהל מדיה לפנדר ישראלי. הסבירו את ה"למה" של כל אבחנה, לא רק "מה קרה".`;

  const enGuidance = `
Write in clear founder-readable English. Avoid jargon ("synergy", "optimization", "potential"). Talk like a senior media buyer giving a brand owner a Monday briefing.`;

  // CRITICAL — language directive at the TOP. Without this the model can
  // mirror the English data dump and ignore the trailing Hebrew hint.
  const languageHeader =
    locale === "he"
      ? "ענה אך ורק בעברית. כל המחרוזות ב־JSON (hookLine, observations, actions) חייבות להיות בעברית טבעית. אסור להחזיר אנגלית מלבד שמות קמפיינים, שמות מודעות, ויחידות מידה (₪, %, x)."
      : "Respond exclusively in English. All strings in the JSON must be in English.";

  return [
    languageHeader,
    "",
    "You are a senior Meta Ads media buyer producing a weekly readout for a Shopify brand owner.",
    "",
    "You receive raw KPI + funnel + daily + campaign + ad data, including week-over-week deltas when available.",
    "",
    "Your job: identify SPECIFIC, ACTIONABLE PATTERNS — not metric restatements.",
    "",
    "DO say things like:",
    '  • "CTR dropped from 2.4% to 1.6% — ad fatigue is starting to bite on the Advantage+ creatives."',
    '  • "Funnel is healthy until checkout — 38% of add-to-carts abandon before completing. Worth checking checkout speed / payment options."',
    '  • "ROAS spiked midweek on the Paz adset (10.7x on May 28) — that creative is doing the heavy lifting; consider duplicating it into a fresh adset."',
    "",
    "DO NOT say things like:",
    '  • "Spend was ₪5,855."  (that\'s just restating a metric)',
    '  • "ROAS was strong."  (vague, no number)',
    '  • "Consider optimizing performance."  (no concrete action)',
    "",
    "REQUIRED JSON STRUCTURE — return ONLY this, no prose, no markdown, no code fences:",
    "{",
    '  "hookLine": "ONE sentence, 12-22 words, summarising the most important pattern of the week. Cite at least one real number.",',
    '  "observations": [',
    "    \"2 to 4 bullets. Each cites a specific number AND explains the implication. Patterns to look for:\",",
    '    "  – trend direction (improving / declining vs prior week)",',
    '    "  – funnel bottleneck (which step lost the most users %-wise)",',
    '    "  – best-performing ad / adset / campaign — call it out by NAME with its number",',
    '    "  – worst-performing ad / adset / campaign — call it out by NAME with its number",',
    '    "  – day-of-week pattern in the daily breakdown if there is one",',
    '    "  – ad fatigue signal (rising CPM, falling CTR)"',
    "  ],",
    '  "actions": [',
    '    "2 to 3 verb-led recommendations for next week. Each must reference a specific entity (campaign/adset/ad by name) and a specific outcome.",',
    '    "Examples of good actions:",',
    '    "  – \\"שכפלו את \'Paz_1_day_click\' לקבוצה נפרדת כדי לבחון את התקרה שלו ב־₪200/יום\\"",',
    '    "  – \\"השהו את \'Static_Omer\' — ₪147 הוצאה, 0 רכישות, סימן לרענון יצירתי\\"",',
    '    "  – \\"בדקו את שלב ה־checkout — 38% נשירה מהוספה־לסל לתחילת תשלום היא חריגה\\""',
    "  ]",
    "}",
    "",
    "RULES:",
    "1. Never invent campaigns, ads, or numbers not in the data.",
    "2. Every observation must cite at least one real number from the input.",
    "3. If a metric is missing (n/a), do not fabricate a value — call out the gap.",
    "4. If week-over-week data is provided, USE IT — trend framing is the highest-value observation.",
    "5. If the funnel has a sharp drop-off, that's almost always the most important observation.",
    "6. Maximum 4 observations, maximum 3 actions.",
    "",
    locale === "he" ? heGuidance : enGuidance
  ].join("\n");
}

export async function generateBrandInsights(
  brand: MetaAdsReportBrand,
  dateRange: { start: string; end: string },
  locale: "he" | "en" = "he",
  options: { prior?: PriorWeekSnapshot | null } = {}
): Promise<BrandInsights> {
  const systemPrompt = buildSystemPrompt(locale);
  const userPrompt = buildPrompt(brand, dateRange, options.prior ?? null, locale);
  const fallback = fallbackInsights(brand, locale === "he");

  const parsed = await generateInsightsJson<RawInsights>({
    systemPrompt,
    userPrompt,
    openaiModel: OPENAI_MODEL,
    temperature: 0.5,
    maxTokens: 900,
    jsonHint: 'object with hookLine:string, observations:string[2-4], actions:string[2-3]'
  });
  if (!parsed) return fallback;

  return {
    hookLine:
      typeof parsed.hookLine === "string" && parsed.hookLine.trim()
        ? parsed.hookLine.trim()
        : fallback.hookLine,
    observations:
      Array.isArray(parsed.observations) && parsed.observations.length > 0
        ? parsed.observations.map((s) => String(s).trim()).filter(Boolean).slice(0, 4)
        : fallback.observations,
    actions:
      Array.isArray(parsed.actions) && parsed.actions.length > 0
        ? parsed.actions.map((s) => String(s).trim()).filter(Boolean).slice(0, 3)
        : fallback.actions
  };
}
