import { cookies } from "next/headers";
import { getDefaultDateRange, getPreviousDateRange } from "@/lib/server/analytics";

export const REPORTING_DATE_RANGE_COOKIE = "reporting-date-range";

export interface ReportingDateRangeSelection {
  start: Date;
  end: Date;
  startInput: string;
  endInput: string;
  label: string;
  comparisonLabel: string;
}

function toInputDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function describeRange(start: Date, end: Date) {
  return `${toInputDate(start)} - ${toInputDate(end)}`;
}

export async function getReportingDateRangeSelection(): Promise<ReportingDateRangeSelection> {
  const fallback = getDefaultDateRange();
  const cookieStore = await cookies();
  const raw = cookieStore.get(REPORTING_DATE_RANGE_COOKIE)?.value;

  let start = fallback.start;
  let end = fallback.end;

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { start?: string; end?: string };
      const nextStart = parsed.start ? new Date(`${parsed.start}T00:00:00.000Z`) : null;
      const nextEnd = parsed.end ? new Date(`${parsed.end}T23:59:59.999Z`) : null;
      if (nextStart && nextEnd && !Number.isNaN(nextStart.getTime()) && !Number.isNaN(nextEnd.getTime()) && nextStart <= nextEnd) {
        start = nextStart;
        end = nextEnd;
      }
    } catch {
      // Ignore malformed cookie and fall back to default range.
    }
  }

  const previous = getPreviousDateRange({ start, end });

  return {
    start,
    end,
    startInput: toInputDate(start),
    endInput: toInputDate(end),
    label: describeRange(start, end),
    comparisonLabel: describeRange(previous.start, previous.end)
  };
}
