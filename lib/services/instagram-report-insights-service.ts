// Hebrew AI-generated Instagram + affiliate insights for the weekly report.
//
// Produces 3 short blocks the same shape as the Meta Ads insights so the
// print page can render them in a matching layout:
//   • hookLine — one sentence summarising the Instagram week
//   • observations — patterns the AI saw across affiliates and posts
//   • actions — recommended outreach / content moves
//
// Inputs fed to the model:
//   • Per-affiliate roster including silent ones (so it can spot who's
//     dormant)
//   • Posts in the last 30 days with engagement
//   • Optional sales attribution (which affiliates drove orders)
//
// Provider: same gpt-4o-mini path as Meta Ads insights.

export interface InstagramAffiliateSummary {
  username: string;
  displayName?: string | null;
  status: "stored" | "scanned" | "handle_saved" | "missing";
  postsStored: number;
  lastPostAt?: string | null;
  attributedSales?: number;
  attributedOrders?: number;
}

export interface InstagramPostSummary {
  username: string;
  postedAt: string; // YYYY-MM-DD
  likes: number;
  comments: number;
  captionPreview?: string | null;
}

export interface InstagramInsightsInput {
  dateRange: { start: string; end: string };
  affiliates: InstagramAffiliateSummary[];
  recentPosts: InstagramPostSummary[];
}

export interface InstagramInsights {
  hookLine: string;
  observations: string[];
  actions: string[];
}

const OPENAI_MODEL = "gpt-4o-mini";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

function fallback(isHe: boolean, summary: InstagramInsightsInput): InstagramInsights {
  const total = summary.affiliates.length;
  const active = summary.affiliates.filter((a) => a.status === "stored").length;
  if (isHe) {
    return {
      hookLine: `${active} מתוך ${total} משפיענים פעילים השבוע. ${summary.recentPosts.length} פוסטים סה״כ ב־30 הימים האחרונים.`,
      observations: [
        "תובנות Instagram אוטומטיות לא זמינות (OPENAI_API_KEY חסר או הקריאה נכשלה).",
        "הנתונים המלאים מופיעים בטבלאות שלמטה."
      ],
      actions: ["הוסיפו OPENAI_API_KEY ל־.env כדי לקבל ניתוח אוטומטי."]
    };
  }
  return {
    hookLine: `${active} of ${total} affiliates active this week. ${summary.recentPosts.length} posts in the last 30 days.`,
    observations: [
      "Automatic Instagram insights unavailable (OPENAI_API_KEY missing or call failed).",
      "Full numbers are in the tables below."
    ],
    actions: ["Set OPENAI_API_KEY in .env to enable weekly AI commentary."]
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

function buildUserPrompt(input: InstagramInsightsInput): string {
  const lines: string[] = [];
  lines.push(`Date range: ${input.dateRange.start} → ${input.dateRange.end}`);
  lines.push("");

  // Affiliate roster — including silent ones so the AI can call them out.
  lines.push(`AFFILIATE ROSTER (${input.affiliates.length} configured):`);
  for (const a of input.affiliates) {
    const sales = a.attributedSales ?? 0;
    const orders = a.attributedOrders ?? 0;
    lines.push(
      `  @${a.username}${a.displayName ? ` (${a.displayName})` : ""} — status:${a.status} | postsStored:${a.postsStored} | lastPost:${a.lastPostAt?.slice(0, 10) ?? "never"} | attributedSales:₪${sales.toFixed(0)} | attributedOrders:${orders}`
    );
  }
  lines.push("");

  // Posts sorted by engagement so the AI sees the strongest content first.
  lines.push(`RECENT POSTS LAST 30 DAYS (${input.recentPosts.length} posts):`);
  const sorted = input.recentPosts
    .slice()
    .sort((a, b) => b.likes + b.comments - (a.likes + a.comments))
    .slice(0, 25);
  for (const p of sorted) {
    const caption = (p.captionPreview ?? "").slice(0, 100).replace(/\s+/g, " ").trim();
    lines.push(
      `  @${p.username} ${p.postedAt} — likes:${p.likes}, comments:${p.comments}${caption ? ` | "${caption}"` : ""}`
    );
  }

  return lines.join("\n");
}

function buildSystemPrompt(locale: "he" | "en"): string {
  const heGuidance = `
שפת המוצא: עברית טבעית של מקצוען. שמות משפיענים נשארים בפורמט @username. הימנעו ממונחים שיווקיים כלליים — דברו ספציפית על מי, מה, ומה אפשר לעשות עם זה השבוע הבא.`;

  const enGuidance = `Write in clear English. Founder-readable, concrete, no marketing jargon.`;

  // CRITICAL — put the language directive at the TOP. The model otherwise
  // tends to mirror the language of the data dump (English handles +
  // English status enums) and produce English output even when the
  // language hint is at the end of the prompt.
  const languageHeader =
    locale === "he"
      ? "ענה אך ורק בעברית. כל המחרוזות ב־JSON (hookLine, observations, actions) חייבות להיות בעברית טבעית. אסור להחזיר אנגלית מלבד שמות @handles, מספרים, ו־ROAS."
      : "Respond exclusively in English. All strings in the JSON must be in English.";

  return [
    languageHeader,
    "",
    "You are a senior creator-marketing manager producing the Instagram block of a Shopify brand's weekly report.",
    "",
    "You receive: a roster of every configured affiliate (including silent ones), and the last 30 days of crawled posts with engagement counts.",
    "",
    "Your job: identify SPECIFIC PATTERNS that help the brand owner decide who to invest in, who to nudge, and what content is working.",
    "",
    "DO say things like:",
    '  • "@taliasol drove 64% of all affiliate engagement this month with 3 posts averaging 458 likes. She is the clear creative anchor — worth offering an exclusive code or higher commission."',
    '  • "@advarois and @lee_alon are configured but haven\'t posted anything brand-related in 30 days. Reach out before next cycle or remove from the active roster."',
    '  • "Reels are outperforming static posts ~3x in engagement. Consider asking creators to lead with Reels next month."',
    "",
    "DO NOT say things like:",
    '  • "There were 5 posts this month."  (just restates a count)',
    '  • "Engagement was good."  (vague, no numbers)',
    '  • "Consider boosting affiliate strategy."  (no concrete next step)',
    "",
    "REQUIRED JSON STRUCTURE — return ONLY this, no prose, no markdown, no code fences:",
    "{",
    '  "hookLine": "ONE sentence, 12-22 words, naming the most important pattern. Use a number.",',
    '  "observations": [',
    '    "2 to 4 bullets. Each must name a specific @handle (or specific post if it is a content pattern), cite a real number, and explain what it means."',
    "  ],",
    '  "actions": [',
    '    "2 to 3 verb-led recommendations for next week. Each must name a specific @handle and a specific outcome (a code, an outreach message, a content brief)."',
    "  ]",
    "}",
    "",
    "RULES:",
    "1. Never invent handles, posts, or numbers not in the data.",
    "2. Every observation must name at least one specific @handle.",
    "3. Silent affiliates (status \"handle_saved\" or 0 posts stored) are a high-signal observation — point them out by name.",
    "4. If one affiliate is clearly dominant in engagement, say so by name and number.",
    "5. Maximum 4 observations, maximum 3 actions.",
    "",
    locale === "he" ? heGuidance : enGuidance
  ].join("\n");
}

export async function generateInstagramInsights(
  input: InstagramInsightsInput,
  locale: "he" | "en" = "he"
): Promise<InstagramInsights> {
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) return fallback(locale === "he", input);

  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt(locale) },
          { role: "user", content: buildUserPrompt(input) }
        ],
        temperature: 0.5,
        max_tokens: 800
      })
    });
    if (!response.ok) return fallback(locale === "he", input);
    const payload = (await response.json()) as OpenAIChatResponse;
    if (payload.error) return fallback(locale === "he", input);
    const raw = payload.choices?.[0]?.message?.content?.trim();
    if (!raw) return fallback(locale === "he", input);
    const parsed = JSON.parse(raw) as RawInsights;
    const fb = fallback(locale === "he", input);
    return {
      hookLine:
        typeof parsed.hookLine === "string" && parsed.hookLine.trim()
          ? parsed.hookLine.trim()
          : fb.hookLine,
      observations:
        Array.isArray(parsed.observations) && parsed.observations.length > 0
          ? parsed.observations.map((s) => String(s).trim()).filter(Boolean).slice(0, 4)
          : fb.observations,
      actions:
        Array.isArray(parsed.actions) && parsed.actions.length > 0
          ? parsed.actions.map((s) => String(s).trim()).filter(Boolean).slice(0, 3)
          : fb.actions
    };
  } catch {
    return fallback(locale === "he", input);
  }
}
