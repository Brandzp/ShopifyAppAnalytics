// Marketing-brief generator.
//
// Turns a parsed Gantt into the structured monthly brief format the
// operator's team already uses (see reference PDFs in the design source:
// "בריף אפטר שאוור // אוקטובר/נובמבר/דצמבר"). Sections match those
// docs 1:1 so the output is drop-in replaceable.
//
// Data comes from:
//   1. The Gantt rows (task text, dates, category, role, action)
//   2. Pattern-extraction on task text (coupon codes, prices, URLs,
//      exclusions) — deterministic, no LLM cost
//   3. The BI agent — structures the rows into sections and writes the
//      theme sentence + campaign summary + KPI targets. Rows are pre-
//      digested so the agent doesn't have to invent anything.

import { askBiAgentJson, isBiAgentConfigured } from "@/lib/clients/bi-agent-client";

// ─── Types ────────────────────────────────────────────────────────────

// One offer/campaign entry. Matches the "each offer" pattern in the
// reference briefs: headline + validity + coupon + body + exclusions.
export interface BriefOffer {
  // 1-line bold pink headline (e.g. "20% הנחה + מתנה בכל רכישה מעל 199 ש״ח").
  headline: string;
  // Optional owner role — drives the "who's responsible" callout.
  ownerRole?: string | null;
  // Free-form body — 1-3 sentences of context. The agent copies from
  // the source task and cleans it up (no invention).
  body?: string | null;
  // ISO date strings. `end` may be null when the offer runs "עד גמר המלאי"
  // (until stock lasts) — display "עד גמר המלאי" in that case.
  validityStart: string | null;
  validityEnd: string | null;
  // Time-of-day cutoff. Defaults to "23:59" in the reference briefs.
  validityEndTime?: string | null;
  // The customer-facing code (e.g. "LIHI", "SET15"). Rendered as a
  // prominent chip; case-preserved so branded codes stay intact.
  couponCode?: string | null;
  // Optional deep link.
  url?: string | null;
  // Exclusion / condition bullets. The reference briefs standardise
  // these: "לא כולל כפל מבצעים", "בהזנת קוד קופון: X", etc.
  conditions: string[];
  // Callouts extracted from the source task:
  //   - "critical" — coupon code missing but text implies one, OR the
  //     dates span into another month, OR a launch with no supporting
  //     creative task on the same day
  //   - "info" — informational note that's not a hard blocker
  callouts?: Array<{ level: "critical" | "warning" | "info"; text: string }>;
  // Optional KPI target for this campaign (revenue, orders, ROAS).
  kpiTarget?: string | null;
  // Source row ids so the UI can back-link to specific Gantt cells.
  sourceRowIds?: string[];
}

// Grouping for the influencer section. Each influencer gets their own
// sub-heading + list of pieces (pulse launch → reminder → close).
export interface BriefInfluencerBlock {
  influencerName: string;
  offers: BriefOffer[];
}

export interface MarketingBrief {
  // Header — brand name, month, theme sentence, cover summary, KPIs.
  header: {
    brandName: string;
    monthLabel: string;
    // The one-sentence framing on the cover ("סוכות וחוה\"מ ורגיעה
    // לפני חגי נובמבר"). LLM-generated from the campaign shape.
    theme?: string | null;
    // 3-6 line executive summary of the month.
    campaignSummary?: string | null;
    // KPI target chips. Text like "20K תקציב", "ROAS 2-3", "50 הזמנות".
    kpis?: string[];
  };
  // Section 1: permanent offers (shipping / club / abandoned cart).
  // These are shop-wide constants — the operator can edit the defaults
  // per-store later; for now they're auto-populated from reasonable
  // defaults and overridden by anything the agent finds in the Gantt.
  permanentOffers: {
    shipping: { text: string; conditions?: string[] };
    memberSignup: { text: string; couponCode?: string | null; conditions?: string[] };
    abandonedCart: { text: string; couponCode?: string | null; conditions?: string[] };
  };
  // Section 2: influencer coupon campaigns.
  influencerBlocks: BriefInfluencerBlock[];
  // Section 3: site-wide built-in discounts.
  siteDiscounts: BriefOffer[];
  // Section 4: paid promotion brief.
  paidPromotion: {
    // "20K כלל הכל בפנים | כולל טיקטוק 2-3 ROAS"
    budgetSummary?: string | null;
    roasTarget?: string | null;
    campaigns: BriefOffer[];
  };
  // Section 5: UGC / creative content requirements.
  ugcContent: string[];
  // Metadata
  generatedAt: string;
  rowCount: number;
}

// ─── Pattern extractors (deterministic — no LLM) ──────────────────────

const COUPON_PATTERNS: RegExp[] = [
  // "קוד להטבה: welcome" / "קוד קופון: LIHI" / "קופון: NAME15"
  /(?:קוד(?:\s+קופון)?(?:\s+להטבה)?|קופון)\s*[:\-]\s*([A-Z0-9][A-Z0-9_\-]{1,32})/i,
  // Inline uppercase code (2-16 chars, mostly caps).
  /\b([A-Z][A-Z0-9]{1,15})(?=\s|$|[.,)])/
];

export function extractCouponCode(text: string): string | null {
  for (const re of COUPON_PATTERNS) {
    const m = text.match(re);
    if (m && m[1] && m[1].length >= 2) {
      // Reject obvious noise (single letters, common HTML tags).
      if (["THE", "AND", "OR", "PDF", "URL"].includes(m[1].toUpperCase())) continue;
      return m[1];
    }
  }
  return null;
}

export function extractUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s"'<>]+/i);
  return m ? m[0] : null;
}

const KNOWN_EXCLUSION_KEYWORDS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /לא\s+כולל\s+כפל\s+מבצעים/, label: "לא כולל כפל מבצעים" },
  { pattern: /לא\s+כולל\s+(?:הטבת\s+)?הרשמה\s+למועדון/, label: "לא כולל הטבת הרשמה למועדון" },
  { pattern: /לא\s+כולל\s+מארזים/, label: "לא כולל מארזים" },
  { pattern: /משלוח\s+חינם\s+מעל\s+150/, label: "משלוח חינם מעל 150₪" },
  { pattern: /בהוספת\s+המוצרים\s+לסל/, label: "בהוספת המוצרים לסל" },
  { pattern: /תקף\s+לרכישה\s+1\s+פר\s+הזמנה/, label: "תקף לרכישה 1 פר הזמנה" }
];

export function extractConditions(text: string): string[] {
  const out: string[] = [];
  for (const { pattern, label } of KNOWN_EXCLUSION_KEYWORDS) {
    if (pattern.test(text) && !out.includes(label)) out.push(label);
  }
  return out;
}

// Detect a percentage discount headline (e.g. "20%", "15% הנחה").
export function extractDiscountPct(text: string): number | null {
  const m = text.match(/(\d{1,2})\s*%/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 99 ? n : null;
}

// ─── Digest row for the agent ─────────────────────────────────────────
//
// The agent sees pre-extracted structured facts alongside the raw text,
// so it doesn't hallucinate coupon codes or dates.

interface RowDigest {
  id: string;
  date: string | null;
  category: string | null;
  role: string | null;
  action: string | null;
  extracted: {
    couponCode: string | null;
    url: string | null;
    discountPct: number | null;
    conditions: string[];
  };
  task: string;
}

export interface GanttRowForBrief {
  id: string;
  task: string;
  category: string | null;
  role: string | null;
  startDate: Date | null;
  endDate: Date | null;
  actionType: string | null;
}

export interface BriefGeneratorInput {
  storeBrandName: string;
  monthLabel: string; // e.g. "יולי 2026" or "November 2026"
  rows: GanttRowForBrief[];
}

function digestRow(row: GanttRowForBrief): RowDigest {
  return {
    id: row.id,
    date: row.startDate ? row.startDate.toISOString().slice(0, 10) : null,
    category: row.category,
    role: row.role,
    action: row.actionType,
    extracted: {
      couponCode: extractCouponCode(row.task),
      url: extractUrl(row.task),
      discountPct: extractDiscountPct(row.task),
      conditions: extractConditions(row.task)
    },
    // Truncate to keep context small.
    task: row.task.length > 800 ? row.task.slice(0, 800) + "…" : row.task
  };
}

// ─── Fallback brief (LLM off / failing) ───────────────────────────────
//
// If the BI agent isn't available, we still emit a usable brief by
// grouping rows heuristically. Not as polished as the LLM version but
// operator can hand-edit.

function fallbackBrief(input: BriefGeneratorInput): MarketingBrief {
  const influencerRows = input.rows.filter((r) => r.role === "affiliates");
  const siteRows = input.rows.filter((r) => r.role === "web" || r.actionType === "web_update");
  const paidRows = input.rows.filter((r) => /קידום|ממומן|ROAS|K\b/i.test(r.task));
  const ugcRows = input.rows.filter(
    (r) => r.actionType === "creative_image" || r.actionType === "creative_video"
  );

  const toOffer = (r: GanttRowForBrief): BriefOffer => ({
    headline: r.task.split(/[\n.]/)[0].slice(0, 100),
    ownerRole: r.role ?? null,
    body: r.task,
    validityStart: r.startDate?.toISOString().slice(0, 10) ?? null,
    validityEnd: r.endDate?.toISOString().slice(0, 10) ?? null,
    validityEndTime: "23:59",
    couponCode: extractCouponCode(r.task),
    url: extractUrl(r.task),
    conditions: extractConditions(r.task),
    sourceRowIds: [r.id]
  });

  const influencerBlocks: BriefInfluencerBlock[] = [];
  if (influencerRows.length) {
    influencerBlocks.push({
      influencerName: "משפיעניות",
      offers: influencerRows.map(toOffer)
    });
  }

  return {
    header: {
      brandName: input.storeBrandName,
      monthLabel: input.monthLabel,
      theme: null,
      campaignSummary: null,
      kpis: []
    },
    permanentOffers: {
      shipping: {
        text: "משלוח סטנדרטי עד 7 ימי עסקים בעלות 30₪ · משלוח חינם ברכישה מעל 150 ש\"ח"
      },
      memberSignup: {
        text: "10% הנחה נשלחים למייל לאחר הרשמה למייל וטלפון",
        couponCode: "welcome",
        conditions: ["למימוש פעם אחת בלבד ללקוח לכל החיים"]
      },
      abandonedCart: {
        text: "הנחת עגלה נטושה 15%- בתוקף ל-48 שעות",
        couponCode: "חד ערכי",
        conditions: ["למימוש פעם אחת בלבד ללקוח ל-48 שעות", "לא כולל מארזים"]
      }
    },
    influencerBlocks,
    siteDiscounts: siteRows.map(toOffer),
    paidPromotion: {
      budgetSummary: null,
      roasTarget: null,
      campaigns: paidRows.map(toOffer)
    },
    ugcContent:
      ugcRows.length > 0
        ? [`${ugcRows.length} משימות תוכן/עיצוב בגאנט לחודש זה`]
        : ["2 סרטוני UGC לכל הטבה (עם בנות שונות)", "מינימום 3 עיצובי גרפיקה לכל הטבה"],
    generatedAt: new Date().toISOString(),
    rowCount: input.rows.length
  };
}

// ─── LLM prompt ───────────────────────────────────────────────────────

function buildAgentPrompt(digests: RowDigest[], input: BriefGeneratorInput): string {
  return [
    `You are a senior marketing operations lead for the Israeli e-commerce brand "${input.storeBrandName}".`,
    `Turn the Gantt data below into a monthly marketing brief in the EXACT format the team uses.`,
    ``,
    `Month: ${input.monthLabel}`,
    ``,
    `SECTIONS the brief MUST have (Hebrew content, RTL):`,
    `  1. Header — brand, month, theme sentence (1 line, sets the mood for the month), campaign summary (3-5 lines), kpis (target metrics as short chips: budget, ROAS, revenue).`,
    `  2. Permanent offers (shipping / club signup / abandoned cart) — usually the standard defaults, override only if the Gantt says something specific.`,
    `  3. Influencer coupon campaigns — grouped by influencer name.`,
    `  4. Site discounts — non-influencer built-in offers.`,
    `  5. Paid promotion brief — budgetSummary (like "20K כלל הכל בפנים | כולל טיקטוק"), roasTarget (like "2-3"), campaigns.`,
    `  6. UGC content — 2-4 bullet strings describing content requirements.`,
    ``,
    `EACH OFFER shape:`,
    `  {`,
    `    "headline": "SHORT bold Hebrew headline (e.g. \\"20% הנחה + מתנה\\")",`,
    `    "ownerRole": "web|social|graphic|affiliates|email|marketing" or null,`,
    `    "body": "1-3 sentences copy from the Gantt task",`,
    `    "validityStart": "YYYY-MM-DD" or null,`,
    `    "validityEnd": "YYYY-MM-DD" or null,`,
    `    "validityEndTime": "23:59",`,
    `    "couponCode": "CODE" or null,`,
    `    "url": "https://..." or null,`,
    `    "conditions": ["לא כולל כפל מבצעים","בהזנת קוד קופון: X"],`,
    `    "callouts": [{"level":"critical","text":"..."}],`,
    `    "kpiTarget": "..." or null,`,
    `    "sourceRowIds": ["<row id>"]`,
    `  }`,
    ``,
    `HARD RULES:`,
    `  - Use ONLY facts present in the Gantt data. Do NOT invent coupon codes, dates, prices.`,
    `  - For each offer, prefer the pre-extracted couponCode / conditions in "extracted" over your own parse.`,
    `  - Preserve the operator's Hebrew wording. Do not translate to English.`,
    `  - If a source task spans days 5–10, set validityStart=day5, validityEnd=day10.`,
    `  - Raise a "critical" callout when: the offer mentions a coupon but no code is present; the date range crosses a month boundary; a launch task has no supporting creative task on the same day.`,
    ``,
    `Row data (each row is one calendar cell — task text + pre-extracted facts):`,
    JSON.stringify(digests, null, 2),
    ``,
    `Output ONLY a single JSON object with these top-level keys:`,
    `  { "header": {...}, "permanentOffers": {...}, "influencerBlocks": [...], "siteDiscounts": [...], "paidPromotion": {...}, "ugcContent": [...] }`
  ].join("\n");
}

// ─── Public entry ─────────────────────────────────────────────────────

export async function generateMarketingBrief(input: BriefGeneratorInput): Promise<MarketingBrief> {
  if (!isBiAgentConfigured() || process.env.BI_AGENT_DISABLE === "1") {
    return fallbackBrief(input);
  }
  const digests = input.rows.map(digestRow);
  try {
    const raw = await askBiAgentJson<Partial<MarketingBrief>>({
      question: buildAgentPrompt(digests, input),
      jsonHint: "object matching the MarketingBrief schema in the prompt",
      timeoutMs: 90_000
    });
    // Merge with fallback so missing keys don't leave the print page
    // rendering `undefined`. Agent fields take precedence when present.
    const fb = fallbackBrief(input);
    return {
      header: {
        brandName: raw.header?.brandName ?? fb.header.brandName,
        monthLabel: raw.header?.monthLabel ?? fb.header.monthLabel,
        theme: raw.header?.theme ?? null,
        campaignSummary: raw.header?.campaignSummary ?? null,
        kpis: Array.isArray(raw.header?.kpis) ? raw.header!.kpis : []
      },
      permanentOffers: raw.permanentOffers ?? fb.permanentOffers,
      influencerBlocks: Array.isArray(raw.influencerBlocks)
        ? raw.influencerBlocks
        : fb.influencerBlocks,
      siteDiscounts: Array.isArray(raw.siteDiscounts) ? raw.siteDiscounts : fb.siteDiscounts,
      paidPromotion: raw.paidPromotion ?? fb.paidPromotion,
      ugcContent: Array.isArray(raw.ugcContent) ? raw.ugcContent : fb.ugcContent,
      generatedAt: new Date().toISOString(),
      rowCount: input.rows.length
    };
  } catch (err) {
    console.warn("[gantt-brief-generator] agent failed:", err instanceof Error ? err.message : err);
    return fallbackBrief(input);
  }
}
