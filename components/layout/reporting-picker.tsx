"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calendar, ChevronDown, GitCompareArrows, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DualCalendar } from "@/components/layout/calendar";

type RangePreset =
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

type ComparisonMode = "none" | "prev_period" | "prev_year" | "prev_year_dow" | "custom";

const PRESET_GROUPS: Array<{ heading: string; presets: Array<{ value: RangePreset; label: string }> }> = [
  {
    heading: "Day",
    presets: [
      { value: "today", label: "Today" },
      { value: "yesterday", label: "Yesterday" }
    ]
  },
  {
    heading: "Last",
    presets: [
      { value: "last_7", label: "Last 7 days" },
      { value: "last_30", label: "Last 30 days" },
      { value: "last_90", label: "Last 90 days" }
    ]
  },
  {
    heading: "Period to date",
    presets: [
      { value: "wtd", label: "Week to date" },
      { value: "mtd", label: "Month to date" },
      { value: "qtd", label: "Quarter to date" },
      { value: "ytd", label: "Year to date" }
    ]
  },
  {
    heading: "Year",
    presets: [{ value: "last_year", label: "Last year" }]
  }
];

const COMPARISON_OPTIONS: Array<{ value: ComparisonMode; label: string }> = [
  { value: "none", label: "No comparison" },
  { value: "prev_period", label: "Previous period" },
  { value: "prev_year", label: "Previous year" },
  { value: "prev_year_dow", label: "Previous year (match day of week)" },
  { value: "custom", label: "Custom" }
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseInputDate(value: string): Date | null {
  if (!ISO_DATE.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() < 1970 || date.getFullYear() > 2100) return null;
  return date;
}

function toInputDate(date: Date | null): string {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDate(value: string | null) {
  if (!value) return "";
  const d = parseInputDate(value);
  if (!d) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function rangeSummary(start: string, end: string) {
  const a = formatDate(start);
  const b = formatDate(end);
  if (!a || !b) return "";
  if (a === b) return a;
  return `${a} – ${b}`;
}

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  align?: "start" | "end";
}

function Popover({ open, onClose, children, className, align = "end" }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(event.target as Node)) onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      role="dialog"
      className={cn(
        "absolute z-50 mt-2 rounded-2xl border border-border/70 bg-card text-card-foreground shadow-xl",
        align === "end" ? "end-0" : "start-0",
        className
      )}
    >
      {children}
    </div>
  );
}

export interface ReportingPickerProps {
  initialPreset: RangePreset;
  initialStart: string;
  initialEnd: string;
  initialComparisonMode: ComparisonMode;
  initialComparisonStart: string;
  initialComparisonEnd: string;
  initialRangeLabel: string;
  initialComparisonLabel: string;
  exportLabel?: string;
}

export function ReportingPicker(props: ReportingPickerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rangeOpen, setRangeOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);

  const [preset, setPreset] = useState<RangePreset>(props.initialPreset);
  const [start, setStart] = useState<string>(props.initialStart);
  const [end, setEnd] = useState<string>(props.initialEnd);

  // Pending selection inside the popover (only committed on Apply)
  const [pendingStart, setPendingStart] = useState<Date | null>(parseInputDate(props.initialStart));
  const [pendingEnd, setPendingEnd] = useState<Date | null>(parseInputDate(props.initialEnd));
  const [pendingPreset, setPendingPreset] = useState<RangePreset>(props.initialPreset);
  // Buffered text for the date inputs so partial typing doesn't get reinterpreted as 1908
  const [startText, setStartText] = useState<string>(props.initialStart);
  const [endText, setEndText] = useState<string>(props.initialEnd);

  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>(props.initialComparisonMode);
  const [comparisonStart, setComparisonStart] = useState<string>(props.initialComparisonStart);
  const [comparisonEnd, setComparisonEnd] = useState<string>(props.initialComparisonEnd);

  // Re-sync pending state every time the popover opens
  useEffect(() => {
    if (rangeOpen) {
      setPendingStart(parseInputDate(start));
      setPendingEnd(parseInputDate(end));
      setPendingPreset(preset);
      setStartText(start);
      setEndText(end);
    }
  }, [rangeOpen, start, end, preset]);

  function commit(state: {
    preset: RangePreset;
    start: string;
    end: string;
    comparison: { mode: ComparisonMode; start?: string; end?: string };
  }) {
    document.cookie = `reporting-date-range=${encodeURIComponent(JSON.stringify(state))}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => {
      router.refresh();
    });
  }

  function handleApplyRange() {
    if (!pendingStart || !pendingEnd) return;
    const nextStart = toInputDate(pendingStart);
    const nextEnd = toInputDate(pendingEnd);
    setPreset(pendingPreset);
    setStart(nextStart);
    setEnd(nextEnd);
    setRangeOpen(false);
    commit({
      preset: pendingPreset,
      start: nextStart,
      end: nextEnd,
      comparison: { mode: comparisonMode, start: comparisonStart, end: comparisonEnd }
    });
  }

  function handlePresetClick(value: RangePreset) {
    if (value === "custom") {
      setPendingPreset("custom");
      return;
    }
    // Non-custom presets apply immediately and close the popover
    setPreset(value);
    setRangeOpen(false);
    commit({
      preset: value,
      start,
      end,
      comparison: { mode: comparisonMode, start: comparisonStart, end: comparisonEnd }
    });
  }

  function handleStartTextChange(value: string) {
    setStartText(value);
    const parsed = parseInputDate(value);
    if (parsed) setPendingStart(parsed);
  }

  function handleEndTextChange(value: string) {
    setEndText(value);
    const parsed = parseInputDate(value);
    if (parsed) setPendingEnd(parsed);
  }

  function handleCalendarChange(s: Date | null, e: Date | null) {
    setPendingStart(s);
    setPendingEnd(e);
    setPendingPreset("custom");
    setStartText(toInputDate(s));
    setEndText(toInputDate(e));
  }

  function handleComparisonChoice(mode: ComparisonMode) {
    setComparisonMode(mode);
    if (mode !== "custom") {
      setCompareOpen(false);
      commit({
        preset,
        start,
        end,
        comparison: { mode }
      });
    }
  }

  function handleCustomComparisonApply() {
    setCompareOpen(false);
    commit({
      preset,
      start,
      end,
      comparison: { mode: "custom", start: comparisonStart, end: comparisonEnd }
    });
  }

  const rangeButtonLabel =
    preset === "custom" ? rangeSummary(start, end) || props.initialRangeLabel : props.initialRangeLabel;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* RANGE BUTTON */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setRangeOpen((v) => !v);
            setCompareOpen(false);
          }}
          aria-expanded={rangeOpen}
          aria-haspopup="dialog"
          className={cn(
            "inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-sm font-medium shadow-sm transition-colors",
            "hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            rangeOpen && "bg-muted/60"
          )}
        >
          <Calendar className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="max-w-[260px] truncate">{rangeButtonLabel}</span>
          <ChevronDown
            className={cn("h-4 w-4 text-muted-foreground transition-transform", rangeOpen && "rotate-180")}
            aria-hidden
          />
        </button>

        <Popover
          open={rangeOpen}
          onClose={() => setRangeOpen(false)}
          align="end"
          className="w-[min(820px,calc(100vw-2rem))]"
        >
          <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr]">
            {/* PRESETS SIDEBAR */}
            <div className="border-b border-border/70 p-3 sm:border-b-0 sm:border-e">
              <div className="space-y-4">
                {PRESET_GROUPS.map((group) => (
                  <div key={group.heading}>
                    <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {group.heading}
                    </p>
                    <div className="flex flex-col">
                      {group.presets.map((option) => {
                        const active = pendingPreset === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => handlePresetClick(option.value)}
                            className={cn(
                              "flex items-center justify-between rounded-md px-2 py-1.5 text-start text-sm transition-colors",
                              active ? "bg-muted text-foreground font-medium" : "text-foreground hover:bg-muted/60"
                            )}
                          >
                            <span>{option.label}</span>
                            {active ? <Check className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setPendingPreset("custom")}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-start text-sm transition-colors",
                    pendingPreset === "custom" ? "bg-muted font-medium" : "hover:bg-muted/60"
                  )}
                >
                  <span>Custom range</span>
                  {pendingPreset === "custom" ? (
                    <Check className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  ) : null}
                </button>
              </div>
            </div>

            {/* CALENDAR */}
            <div className="p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={startText}
                  onChange={(e) => handleStartTextChange(e.target.value)}
                  max={endText || undefined}
                  className="w-[150px] rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring/40"
                  aria-label="Start date"
                />
                <span className="text-muted-foreground" aria-hidden>
                  →
                </span>
                <input
                  type="date"
                  value={endText}
                  onChange={(e) => handleEndTextChange(e.target.value)}
                  min={startText || undefined}
                  className="w-[150px] rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring/40"
                  aria-label="End date"
                />
              </div>

              <DualCalendar
                start={pendingStart}
                end={pendingEnd}
                onChange={handleCalendarChange}
                initialMonth={pendingStart ?? new Date()}
                maxDate={new Date()}
              />

              <div className="mt-5 flex items-center justify-end gap-2 border-t border-border/70 pt-4">
                <Button type="button" variant="secondary" size="sm" onClick={() => setRangeOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isPending || !pendingStart || !pendingEnd}
                  onClick={handleApplyRange}
                >
                  {isPending ? "Applying…" : "Apply"}
                </Button>
              </div>
            </div>
          </div>
        </Popover>
      </div>

      {/* COMPARISON BUTTON */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setCompareOpen((v) => !v);
            setRangeOpen(false);
          }}
          aria-expanded={compareOpen}
          aria-haspopup="menu"
          className={cn(
            "inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-sm font-medium shadow-sm transition-colors",
            "hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            compareOpen && "bg-muted/60"
          )}
        >
          <GitCompareArrows className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="max-w-[220px] truncate">{props.initialComparisonLabel}</span>
          <ChevronDown
            className={cn("h-4 w-4 text-muted-foreground transition-transform", compareOpen && "rotate-180")}
            aria-hidden
          />
        </button>

        <Popover open={compareOpen} onClose={() => setCompareOpen(false)} align="end" className="w-[320px]">
          <div className="p-2">
            {COMPARISON_OPTIONS.map((option) => {
              const active = comparisonMode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleComparisonChoice(option.value)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-3 py-2 text-start text-sm transition-colors",
                    active ? "bg-muted text-foreground font-medium" : "hover:bg-muted/60"
                  )}
                >
                  <span>{option.label}</span>
                  {active ? <Check className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> : null}
                </button>
              );
            })}

            {comparisonMode === "custom" ? (
              <div className="mt-2 space-y-2 border-t border-border/70 px-3 pt-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    From
                  </label>
                  <input
                    type="date"
                    value={comparisonStart}
                    onChange={(e) => setComparisonStart(e.target.value)}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    To
                  </label>
                  <input
                    type="date"
                    value={comparisonEnd}
                    onChange={(e) => setComparisonEnd(e.target.value)}
                    min={comparisonStart || undefined}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
                  />
                </div>
                <div className="flex justify-end pt-1">
                  <Button
                    type="button"
                    size="sm"
                    disabled={
                      isPending ||
                      !comparisonStart ||
                      !comparisonEnd ||
                      comparisonStart > comparisonEnd
                    }
                    onClick={handleCustomComparisonApply}
                  >
                    {isPending ? "Applying…" : "Apply"}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </Popover>
      </div>

      {props.exportLabel ? <Button className="ms-1">{props.exportLabel}</Button> : null}
    </div>
  );
}
