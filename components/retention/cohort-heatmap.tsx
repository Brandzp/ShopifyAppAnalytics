import type { CohortRetentionReport } from "@/lib/services/cohort-retention-service";

// Classic retention triangle. Rows = acquisition cohort (newest at top),
// columns = months since first order. Cell shading scales with retention
// rate so the eye picks up the curve without reading every number.
//
// Read-only — no client JS. The picker for window length lives on the page.

function formatMonthLabel(yyyyMm: string, locale: "he" | "en"): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString(locale === "he" ? "he-IL" : "en-US", {
    month: "short",
    year: "2-digit"
  });
}

function cellShade(rate: number | null): {
  bg: string;
  text: string;
} {
  if (rate == null) return { bg: "#ffffff", text: "#94a3b8" };
  if (rate <= 0) return { bg: "#f8fafc", text: "#cbd5e1" };
  // Indigo ramp — same hue as the rest of the dashboards. Saturation
  // scales with rate; we cap at 60% so 100% cells don't blow out.
  const t = Math.min(rate, 0.6) / 0.6;
  // Light end #eef2ff (rgba 238, 242, 255) → strong end #6366f1 (rgba 99, 102, 241).
  const r = Math.round(238 - (238 - 99) * t);
  const g = Math.round(242 - (242 - 102) * t);
  const b = Math.round(255 - (255 - 241) * t);
  const bg = `rgb(${r}, ${g}, ${b})`;
  // Flip text to white above ~40% intensity for legibility.
  const text = t > 0.5 ? "#ffffff" : "#1e293b";
  return { bg, text };
}

export function CohortHeatmap({
  report,
  locale = "he",
  display = "rate"
}: {
  report: CohortRetentionReport;
  locale?: "he" | "en";
  // "rate" = percentage (default), "count" = absolute customer count
  display?: "rate" | "count";
}) {
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);

  if (report.cohorts.length === 0) {
    return (
      <p className="text-sm leading-6 text-muted-foreground">
        {lang(
          "אין עדיין נתוני קוהורט מספיקים להצגה.",
          "No cohort data yet — comes online once more order history is captured."
        )}
      </p>
    );
  }

  // Build the column header set: +0, +1, +2, ... +monthsOut.
  const cols: number[] = [];
  for (let i = 0; i <= report.monthsOut; i += 1) cols.push(i);

  return (
    <div className="overflow-x-auto table-scroll scroll-fade-end">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 border border-border bg-card px-2 py-1 text-start text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {lang("מחזור (גודל)", "Cohort (size)")}
            </th>
            {cols.map((i) => (
              <th
                key={i}
                className="border border-border bg-card px-1.5 py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                +{i}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.cohorts.map((row) => (
            <tr key={row.cohortMonth}>
              <td className="sticky left-0 z-10 whitespace-nowrap border border-border bg-card px-2 py-1 text-[11px] font-semibold">
                {formatMonthLabel(row.cohortMonth, locale)}{" "}
                <span className="font-normal text-muted-foreground">
                  ({row.cohortSize})
                </span>
              </td>
              {row.values.map((count, i) => {
                const rate = row.rates[i];
                const shade = cellShade(rate);
                return (
                  <td
                    key={i}
                    className="border border-border px-1 py-1 text-center text-[11px] font-medium"
                    style={{ background: shade.bg, color: shade.text }}
                    title={
                      rate != null && count != null
                        ? `${count} ${lang("לקוחות", "customers")} (${(rate * 100).toFixed(1)}%)`
                        : ""
                    }
                  >
                    {rate == null
                      ? ""
                      : display === "rate"
                        ? `${Math.round(rate * 100)}%`
                        : String(count)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span>{lang("מקרא:", "Legend:")}</span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-6 rounded-sm" style={{ background: "#eef2ff" }} />
          {lang("נמוך", "Low")}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-6 rounded-sm" style={{ background: "#6366f1" }} />
          {lang("גבוה", "High")}
        </span>
        <span className="ms-auto">
          {lang(
            `${report.cohorts.length} מחזורים · ${report.totalCustomers} לקוחות`,
            `${report.cohorts.length} cohorts · ${report.totalCustomers} customers`
          )}
        </span>
      </div>
    </div>
  );
}
