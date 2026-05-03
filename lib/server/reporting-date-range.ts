import { cookies } from "next/headers";
import { getDefaultDateRange, getPreviousDateRange } from "@/lib/server/analytics";

export const REPORTING_DATE_RANGE_COOKIE = "reporting-date-range";

export type RangePreset =
  | "today"
  | "yesterday"
  | "last_7"
  | "last_30"
  | "last_90"
  | "wtd"
  | "mtd"
  | "qtd"
  | "ytd"
  | "last_year"
  | "custom";

export type ComparisonMode = "none" | "prev_period" | "prev_year" | "prev_year_dow" | "custom";

export interface ReportingPickerState {
  preset: RangePreset;
  start: string;
  end: string;
  comparison: {
    mode: ComparisonMode;
    start?: string;
    end?: string;
  };
}

export interface ReportingDateRangeSelection {
  start: Date;
  end: Date;
  startInput: string;
  endInput: string;
  label: string;
  preset: RangePreset;
  comparison: {
    mode: ComparisonMode;
    enabled: boolean;
    start: Date;
    end: Date;
    startInput: string;
    endInput: string;
    label: string;
  };
}

function toInputDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function startOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(23, 59, 59, 999);
  return next;
}

function parseInputDate(value: string, mode: "start" | "end") {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return mode === "start" ? startOfDay(date) : endOfDay(date);
}

export function resolvePreset(preset: RangePreset, now = new Date()): { start: Date; end: Date } {
  const today = startOfDay(now);
  switch (preset) {
    case "today":
      return { start: today, end: endOfDay(today) };
    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { start: startOfDay(y), end: endOfDay(y) };
    }
    case "last_7": {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return { start: startOfDay(start), end: endOfDay(today) };
    }
    case "last_30": {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      return { start: startOfDay(start), end: endOfDay(today) };
    }
    case "last_90": {
      const start = new Date(today);
      start.setDate(start.getDate() - 89);
      return { start: startOfDay(start), end: endOfDay(today) };
    }
    case "wtd": {
      const start = new Date(today);
      const day = start.getDay(); // 0 = Sun
      start.setDate(start.getDate() - day);
      return { start: startOfDay(start), end: endOfDay(today) };
    }
    case "mtd": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: startOfDay(start), end: endOfDay(today) };
    }
    case "qtd": {
      const quarterStartMonth = Math.floor(today.getMonth() / 3) * 3;
      const start = new Date(today.getFullYear(), quarterStartMonth, 1);
      return { start: startOfDay(start), end: endOfDay(today) };
    }
    case "ytd": {
      const start = new Date(today.getFullYear(), 0, 1);
      return { start: startOfDay(start), end: endOfDay(today) };
    }
    case "last_year": {
      const start = new Date(today.getFullYear() - 1, 0, 1);
      const end = new Date(today.getFullYear() - 1, 11, 31);
      return { start: startOfDay(start), end: endOfDay(end) };
    }
    case "custom":
    default:
      return getDefaultDateRange(now);
  }
}

export function presetLabel(preset: RangePreset, locale: "en" | "he" = "en") {
  if (locale === "he") {
    const map: Record<RangePreset, string> = {
      today: "היום",
      yesterday: "אתמול",
      last_7: "7 הימים האחרונים",
      last_30: "30 הימים האחרונים",
      last_90: "90 הימים האחרונים",
      wtd: "השבוע עד היום",
      mtd: "החודש עד היום",
      qtd: "הרבעון עד היום",
      ytd: "השנה עד היום",
      last_year: "השנה הקודמת",
      custom: "טווח מותאם"
    };
    return map[preset];
  }
  const map: Record<RangePreset, string> = {
    today: "Today",
    yesterday: "Yesterday",
    last_7: "Last 7 days",
    last_30: "Last 30 days",
    last_90: "Last 90 days",
    wtd: "Week to date",
    mtd: "Month to date",
    qtd: "Quarter to date",
    ytd: "Year to date",
    last_year: "Last year",
    custom: "Custom"
  };
  return map[preset];
}

export function comparisonLabel(mode: ComparisonMode, locale: "en" | "he" = "en") {
  if (locale === "he") {
    const map: Record<ComparisonMode, string> = {
      none: "ללא השוואה",
      prev_period: "התקופה הקודמת",
      prev_year: "השנה שעברה",
      prev_year_dow: "השנה שעברה (אותו יום בשבוע)",
      custom: "טווח מותאם"
    };
    return map[mode];
  }
  const map: Record<ComparisonMode, string> = {
    none: "No comparison",
    prev_period: "Previous period",
    prev_year: "Previous year",
    prev_year_dow: "Previous year (match day of week)",
    custom: "Custom"
  };
  return map[mode];
}

function describeRange(start: Date, end: Date, locale: "en" | "he" = "en") {
  const formatter = new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
  const startStr = formatter.format(start);
  const endStr = formatter.format(end);
  return startStr === endStr ? startStr : `${startStr} – ${endStr}`;
}

function resolveComparison(
  current: { start: Date; end: Date },
  raw: { mode: ComparisonMode; start?: string; end?: string }
): { start: Date; end: Date } {
  switch (raw.mode) {
    case "prev_year": {
      const start = new Date(current.start);
      const end = new Date(current.end);
      start.setFullYear(start.getFullYear() - 1);
      end.setFullYear(end.getFullYear() - 1);
      return { start: startOfDay(start), end: endOfDay(end) };
    }
    case "prev_year_dow": {
      const lengthDays = Math.round((current.end.getTime() - current.start.getTime()) / 86400000);
      const start = new Date(current.start);
      start.setFullYear(start.getFullYear() - 1);
      const dowDiff = current.start.getDay() - start.getDay();
      start.setDate(start.getDate() + dowDiff);
      const end = new Date(start);
      end.setDate(end.getDate() + lengthDays);
      return { start: startOfDay(start), end: endOfDay(end) };
    }
    case "custom": {
      const parsedStart = raw.start ? parseInputDate(raw.start, "start") : null;
      const parsedEnd = raw.end ? parseInputDate(raw.end, "end") : null;
      if (parsedStart && parsedEnd && parsedStart <= parsedEnd) {
        return { start: parsedStart, end: parsedEnd };
      }
      return getPreviousDateRange(current);
    }
    case "none":
    case "prev_period":
    default:
      return getPreviousDateRange(current);
  }
}

function readState(raw: string | undefined): ReportingPickerState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const preset = (parsed.preset ?? "last_30") as RangePreset;
      const start = typeof parsed.start === "string" ? parsed.start : undefined;
      const end = typeof parsed.end === "string" ? parsed.end : undefined;
      const comparison = parsed.comparison ?? { mode: "prev_period" };
      const fallbackStart = start ?? "";
      const fallbackEnd = end ?? "";
      return {
        preset,
        start: fallbackStart,
        end: fallbackEnd,
        comparison: {
          mode: (comparison.mode ?? "prev_period") as ComparisonMode,
          start: typeof comparison.start === "string" ? comparison.start : undefined,
          end: typeof comparison.end === "string" ? comparison.end : undefined
        }
      };
    }
  } catch {
    // ignore malformed cookie
  }
  return null;
}

export async function getReportingDateRangeSelection(locale: "en" | "he" = "en"): Promise<ReportingDateRangeSelection> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(REPORTING_DATE_RANGE_COOKIE)?.value;
  const state = readState(raw);

  let preset: RangePreset = state?.preset ?? "last_30";
  let current: { start: Date; end: Date };

  if (preset === "custom") {
    const customStart = state?.start ? parseInputDate(state.start, "start") : null;
    const customEnd = state?.end ? parseInputDate(state.end, "end") : null;
    if (customStart && customEnd && customStart <= customEnd) {
      current = { start: customStart, end: customEnd };
    } else {
      preset = "last_30";
      current = resolvePreset(preset);
    }
  } else {
    current = resolvePreset(preset);
  }

  const comparisonRaw = state?.comparison ?? { mode: "prev_period" as ComparisonMode };
  const comparisonRange = resolveComparison(current, comparisonRaw);

  return {
    start: current.start,
    end: current.end,
    startInput: toInputDate(current.start),
    endInput: toInputDate(current.end),
    label: presetLabel(preset, locale) + (preset === "custom" ? "" : ""),
    preset,
    comparison: {
      mode: comparisonRaw.mode,
      enabled: comparisonRaw.mode !== "none",
      start: comparisonRange.start,
      end: comparisonRange.end,
      startInput: toInputDate(comparisonRange.start),
      endInput: toInputDate(comparisonRange.end),
      label: comparisonLabel(comparisonRaw.mode, locale)
    }
  };
}

export function describeAbsoluteRange(start: Date, end: Date, locale: "en" | "he" = "en") {
  return describeRange(start, end, locale);
}
