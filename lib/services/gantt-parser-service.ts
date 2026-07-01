// Gantt xlsx parser.
//
// Israeli marketing teams overwhelmingly use a CALENDAR-MATRIX Gantt:
//   row 1   = dates across the top (one column per day)
//   row 2   = day-of-week labels (cosmetic)
//   col A   = channel / category (אתר, אימייל, ניוזלטר, פוסט, באנר, קופון…)
//   cells   = the actual task content for {row=channel, col=date}
//
// Each non-empty cell becomes ONE GanttRow with
//   category   = the channel from column A
//   task       = the cell text
//   startDate  = endDate = the column's date
//   actionType = inferred from the channel + task keywords (Hebrew + English)
//
// We also support a fallback TABULAR layout (one row per task with named
// columns) for operators who export from Asana/Monday/ClickUp.
//
// Hebrew note: the xlsx library returns Unicode strings natively. The
// mojibake operators sometimes see in CSV previews comes from the CSV
// viewer mis-decoding UTF-8 as Latin-1 — `xlsx` doesn't have that issue.

import * as XLSX from "xlsx";

// What a single parsed task looks like before it hits the DB. Multi-day
// matrix cells expand into N rows (one per date column they span).
export interface ParsedGanttRow {
  rowIndex: number;
  task: string;
  role: string | null;
  category: string | null;
  startDate: Date | null;
  endDate: Date | null;
  status: string | null;
  actionType: ParsedActionType | null;
  raw: Record<string, unknown>;
}

export interface ParsedGanttSheet {
  rows: ParsedGanttRow[];
  rangeStart: Date | null;
  rangeEnd: Date | null;
  roles: string[];
  categories: string[];
  // For UI: which sheets did we find inside the workbook, and which one
  // did we use? Operators sometimes have one tab per month — we pick the
  // first that looks Gantt-shaped but report all so the UI can let them
  // re-pick.
  sheetNamesInWorkbook: string[];
  parsedSheetName: string;
  layoutDetected: "matrix" | "tabular";
}

export type ParsedActionType =
  | "discount_code"
  | "creative_image"
  | "creative_banner"
  | "creative_video"
  | "social_post"
  | "email_campaign"
  | "sms_campaign"
  | "web_update"
  | "blog_post";

// ─── Channel → action + role mapping ──────────────────────────────────
// Maps channel/category text (col A in matrix layout, or the role/category
// column in tabular) to an action type the UI can wire to an existing
// service. Match is case-insensitive substring on the normalized text.
//
// Each entry also names a default role so the per-role PDF grouping has
// something sensible to use even when the source sheet has no explicit
// role column (which is the common case).
const CHANNEL_RULES: Array<{
  patterns: RegExp[];
  action: ParsedActionType;
  role: string;
}> = [
  // Discounts / promos / coupons. Highest priority — operators sometimes
  // mention a coupon code (NAME15) inside an Instagram post row, which
  // should still surface the discount action.
  {
    patterns: [/קופון/i, /מבצע/i, /הנחה/i, /promo/i, /discount/i, /coupon/i, /code/i],
    action: "discount_code",
    role: "marketing"
  },
  // Banners / image creatives
  {
    patterns: [/באנר/i, /banner/i, /הירו/i, /hero/i],
    action: "creative_banner",
    role: "designer"
  },
  // Video / reels
  {
    patterns: [/וידאו/i, /סרטון/i, /ריל/i, /reel/i, /video/i, /tiktok/i],
    action: "creative_video",
    role: "designer"
  },
  // Social posts / stories
  {
    patterns: [/פוסט/i, /post/i, /סטור/i, /story/i, /stories/i, /אינסט/i, /instagram/i, /facebook/i, /פייסבוק/i, /social/i, /סושיאל/i],
    action: "social_post",
    role: "social"
  },
  // Email / newsletter
  {
    patterns: [/אימייל/i, /מייל/i, /ניוזלטר/i, /newsletter/i, /email/i, /e-?mail/i],
    action: "email_campaign",
    role: "email"
  },
  // SMS
  {
    patterns: [/סמס/i, /sms/i, /מסרון/i, /text/i],
    action: "sms_campaign",
    role: "email"
  },
  // Web / landing pages
  {
    patterns: [/אתר/i, /website/i, /landing/i, /דף נחיתה/i, /home ?page/i, /הומפ/i],
    action: "web_update",
    role: "web"
  },
  // Blog
  {
    patterns: [/blog/i, /בלוג/i, /מאמר/i, /article/i],
    action: "blog_post",
    role: "content"
  },
  // Generic images / creative
  {
    patterns: [/תמונה/i, /image/i, /creative/i, /יצירה/i, /ויזואל/i, /visual/i],
    action: "creative_image",
    role: "designer"
  }
];

function classifyChannel(text: string | null | undefined): { action: ParsedActionType | null; role: string | null } {
  if (!text) return { action: null, role: null };
  for (const rule of CHANNEL_RULES) {
    if (rule.patterns.some((re) => re.test(text))) {
      return { action: rule.action, role: rule.role };
    }
  }
  return { action: null, role: null };
}

// ─── Tabular-format header detection (fallback path) ──────────────────
// Maps a possibly-Hebrew column header to a canonical field name.
const HEADER_ALIASES: Record<string, RegExp[]> = {
  task: [/^task$/i, /^activity$/i, /^name$/i, /^title$/i, /^משימ/i, /^פעילות$/i, /^שם/i],
  role: [/^role$/i, /^owner$/i, /^assignee$/i, /^team$/i, /^תפקיד/i, /^בעלים/i, /^אחראי/i, /^צוות/i],
  category: [/^category$/i, /^phase$/i, /^channel$/i, /^section$/i, /^קטגור/i, /^שלב/i, /^ערוץ/i, /^חלק/i],
  startDate: [/start/i, /from/i, /begin/i, /^תחל/i, /^התחלה$/i, /^מתאריך/i, /^תאריך התחלה/i],
  endDate: [/end/i, /to/i, /finish/i, /due/i, /^סיום/i, /^עד/i, /^תאריך סיום/i, /^דד\-?ליין/i],
  status: [/status/i, /state/i, /^סטטוס/i, /^מצב/i]
};

function matchHeader(header: string): keyof typeof HEADER_ALIASES | null {
  for (const [field, patterns] of Object.entries(HEADER_ALIASES)) {
    if (patterns.some((re) => re.test(header.trim()))) {
      return field as keyof typeof HEADER_ALIASES;
    }
  }
  return null;
}

// ─── Date parsing ─────────────────────────────────────────────────────
// Operators give us dates in three shapes:
//   1. JS Date — xlsx already parsed it (we use { cellDates: true })
//   2. Excel serial number (e.g. 45838) — convert via SSF
//   3. String — try DD/MM/YYYY then YYYY-MM-DD then native Date()
function parseCellAsDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    // xlsx serial → JS date via SSF helper
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    const d = new Date(Date.UTC(parsed.y, (parsed.m ?? 1) - 1, parsed.d ?? 1));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // DD/MM/YYYY or DD.MM.YYYY — the Israeli default
    const dmy = trimmed.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
    if (dmy) {
      const day = Number(dmy[1]);
      const month = Number(dmy[2]);
      let year = Number(dmy[3]);
      if (year < 100) year += 2000;
      const d = new Date(Date.UTC(year, month - 1, day));
      return Number.isNaN(d.getTime()) ? null : d;
    }
    // Last-resort native parse
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function cellToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

// ─── Layout detection ─────────────────────────────────────────────────
// MATRIX = row 1 has 5+ date-shaped cells. We prefer matrix because it's
// the dominant format among Israeli marketing operators (the user's
// "אפטר שאוור גאנט שיווק" file is a textbook example).
function detectLayout(rows: unknown[][]): "matrix" | "tabular" {
  const headerRow = rows[0] ?? [];
  let dateCellsInHeader = 0;
  for (let c = 0; c < headerRow.length; c++) {
    if (parseCellAsDate(headerRow[c]) !== null) dateCellsInHeader += 1;
  }
  if (dateCellsInHeader >= 5) return "matrix";
  return "tabular";
}

// ─── Matrix parse ─────────────────────────────────────────────────────
// Walk every cell at (r, c) where r >= 2 (skip date + DoW header) and
// c >= 1 (skip the channel column itself). Each filled cell is a task.
function parseMatrix(rows: unknown[][]): {
  rows: ParsedGanttRow[];
  rangeStart: Date | null;
  rangeEnd: Date | null;
  roles: Set<string>;
  categories: Set<string>;
} {
  const dateRow = rows[0] ?? [];
  const colDates: (Date | null)[] = dateRow.map((cell) => parseCellAsDate(cell));

  // Skip the DoW row only if it actually looks like one — strings like
  // א/ב/ג/ד/ה/ו/ש or M/T/W/Th/F/S/Su. Otherwise assume row 2 is data.
  const dowRow = rows[1] ?? [];
  const looksLikeDow =
    dowRow.length > 0 &&
    dowRow
      .filter((c) => c != null && cellToString(c).length > 0)
      .every((c) => {
        const s = cellToString(c);
        return s.length <= 3;
      });
  const dataStartRow = looksLikeDow ? 2 : 1;

  const parsed: ParsedGanttRow[] = [];
  const roles = new Set<string>();
  const categories = new Set<string>();
  let rangeStart: Date | null = null;
  let rangeEnd: Date | null = null;

  let nextRowIndex = 1;
  for (let r = dataStartRow; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const channelText = cellToString(row[0]);
    if (!channelText) continue; // skip blank divider rows
    const classification = classifyChannel(channelText);
    for (let c = 1; c < row.length; c++) {
      const cellText = cellToString(row[c]);
      if (!cellText) continue;
      const date = colDates[c] ?? null;
      // Per-cell action inference — start with channel classification,
      // then upgrade based on cell content (e.g. NAME15 coupon code in
      // a social post cell → discount_code).
      const cellClass = classifyChannel(cellText);
      const action = cellClass.action ?? classification.action;
      const role = cellClass.role ?? classification.role;
      if (role) roles.add(role);
      categories.add(channelText);
      if (date) {
        if (!rangeStart || date < rangeStart) rangeStart = date;
        if (!rangeEnd || date > rangeEnd) rangeEnd = date;
      }
      parsed.push({
        rowIndex: nextRowIndex++,
        task: cellText,
        role,
        category: channelText,
        startDate: date,
        endDate: date,
        status: null,
        actionType: action,
        raw: { channel: channelText, date: date?.toISOString() ?? null, cell: cellText }
      });
    }
  }

  return { rows: parsed, rangeStart, rangeEnd, roles, categories };
}

// ─── Tabular parse (fallback) ─────────────────────────────────────────
function parseTabular(rows: unknown[][]): {
  rows: ParsedGanttRow[];
  rangeStart: Date | null;
  rangeEnd: Date | null;
  roles: Set<string>;
  categories: Set<string>;
} {
  const header = (rows[0] ?? []).map((c) => cellToString(c));
  const columnMap: Record<string, number> = {};
  header.forEach((h, i) => {
    const field = matchHeader(h);
    if (field) columnMap[field] = i;
  });

  const parsed: ParsedGanttRow[] = [];
  const roles = new Set<string>();
  const categories = new Set<string>();
  let rangeStart: Date | null = null;
  let rangeEnd: Date | null = null;

  let nextRowIndex = 1;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const task = columnMap.task != null ? cellToString(row[columnMap.task]) : "";
    if (!task) continue;
    const role = columnMap.role != null ? cellToString(row[columnMap.role]) || null : null;
    const category = columnMap.category != null ? cellToString(row[columnMap.category]) || null : null;
    const start = columnMap.startDate != null ? parseCellAsDate(row[columnMap.startDate]) : null;
    const end = columnMap.endDate != null ? parseCellAsDate(row[columnMap.endDate]) : null;
    const status = columnMap.status != null ? cellToString(row[columnMap.status]) || null : null;

    // Action inference from category > role > task text, in that priority
    // (most specific first).
    const action =
      classifyChannel(category).action ??
      classifyChannel(role).action ??
      classifyChannel(task).action;

    if (role) roles.add(role);
    if (category) categories.add(category);
    if (start) {
      if (!rangeStart || start < rangeStart) rangeStart = start;
      if (!rangeEnd || start > rangeEnd) rangeEnd = start;
    }
    if (end) {
      if (!rangeStart || end < rangeStart) rangeStart = end;
      if (!rangeEnd || end > rangeEnd) rangeEnd = end;
    }
    const raw: Record<string, unknown> = {};
    header.forEach((h, i) => {
      if (h) raw[h] = row[i];
    });
    parsed.push({
      rowIndex: nextRowIndex++,
      task,
      role,
      category,
      startDate: start,
      endDate: end ?? start,
      status,
      actionType: action,
      raw
    });
  }

  return { rows: parsed, rangeStart, rangeEnd, roles, categories };
}

// ─── Sheet picking ────────────────────────────────────────────────────
// Workbooks sometimes have one tab per month. Pick the first sheet whose
// row 1 has 5+ date cells (matrix) or whose header row contains at least
// 3 of our known tabular fields. Falls back to the first sheet.
function pickSheet(workbook: XLSX.WorkBook): { name: string; rows: unknown[][] } {
  for (const name of workbook.SheetNames) {
    const ws = workbook.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: false,
      defval: null,
      blankrows: false
    });
    if (rows.length === 0) continue;
    const layout = detectLayout(rows);
    if (layout === "matrix") return { name, rows };
    const header = (rows[0] ?? []).map((c) => cellToString(c));
    const tabularHits = header.filter((h) => matchHeader(h)).length;
    if (tabularHits >= 3) return { name, rows };
  }
  // Fallback: first non-empty sheet.
  const fallback = workbook.SheetNames[0];
  const ws = workbook.Sheets[fallback];
  const rows = ws
    ? XLSX.utils.sheet_to_json<unknown[]>(ws, {
        header: 1,
        raw: false,
        defval: null,
        blankrows: false
      })
    : [];
  return { name: fallback, rows };
}

export function parseGanttWorkbook(buffer: Buffer): ParsedGanttSheet {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const { name, rows } = pickSheet(workbook);
  const layout = detectLayout(rows);
  const result = layout === "matrix" ? parseMatrix(rows) : parseTabular(rows);
  return {
    rows: result.rows,
    rangeStart: result.rangeStart,
    rangeEnd: result.rangeEnd,
    roles: Array.from(result.roles).sort(),
    categories: Array.from(result.categories).sort(),
    sheetNamesInWorkbook: workbook.SheetNames,
    parsedSheetName: name,
    layoutDetected: layout
  };
}
