import {
  ArrowDownRight,
  ArrowUpRight,
  Crown,
  Flame,
  Lightbulb,
  type LucideIcon,
  Minus,
  Package2,
  ShieldAlert,
  TrendingUp
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";
import type { KPI } from "@/lib/domain/types";
import { formatKpiValue } from "@/lib/formatters";
import { cn, formatSignedPercent } from "@/lib/utils";

function explainKpi(label: string): { hint: string; tooltip: string } {
  const k = label.toLowerCase();
  if (k.includes("revenue")) {
    return {
      hint: "Total money your store made before refunds and fees.",
      tooltip: "Sum of every order's gross total in the selected window."
    };
  }
  if (k.includes("profit")) {
    return {
      hint: "What you keep after discounts, refunds, and product cost.",
      tooltip:
        "Revenue − discounts − refunds − configured product cost. Approximation until real COGS lands."
    };
  }
  if (k.includes("returning") || k.includes("repeat")) {
    return {
      hint: "Share of orders coming from existing customers — higher = stickier brand.",
      tooltip:
        "Orders where the customer had at least one prior order, divided by total orders."
    };
  }
  if (k.includes("order value") || k.includes("aov")) {
    return {
      hint: "Average dollars per checkout — useful for upsell decisions.",
      tooltip: "Total revenue ÷ total orders in this window."
    };
  }
  if (k.includes("discount")) {
    return {
      hint: "How much of each sale is lost to promo codes — keep it low.",
      tooltip: "Total discount amount ÷ revenue, averaged across days."
    };
  }
  if (k.includes("refund")) {
    return {
      hint: "How much revenue you had to give back — investigate when it climbs.",
      tooltip: "Refunded amount ÷ revenue, averaged across days."
    };
  }
  return { hint: "", tooltip: "" };
}

function defaultIcon(label: string): LucideIcon {
  const k = label.toLowerCase();
  if (k.includes("revenue")) return Crown;
  if (k.includes("profit")) return TrendingUp;
  if (k.includes("returning") || k.includes("repeat")) return Flame;
  if (k.includes("refund")) return ShieldAlert;
  if (k.includes("discount")) return Lightbulb;
  return Package2;
}

export function KpiTile({
  kpi,
  currency,
  hint: hintOverride,
  tooltip: tooltipOverride,
  icon: IconOverride
}: {
  kpi: KPI;
  currency: string;
  hint?: string;
  tooltip?: string;
  icon?: LucideIcon;
}) {
  const auto = explainKpi(kpi.label);
  const Icon = IconOverride ?? defaultIcon(kpi.label);
  const hint = hintOverride ?? auto.hint;
  const tooltip = tooltipOverride ?? auto.tooltip;
  const hasChange = typeof kpi.change === "number";
  const change = kpi.change ?? 0;
  const positive = change > 0;
  const negative = change < 0;
  const ChangeIcon = positive ? ArrowUpRight : negative ? ArrowDownRight : Minus;

  return (
    <Card className="transition-shadow hover:shadow-lg">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          {hasChange ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                positive && "bg-emerald-500/10 text-emerald-700",
                negative && "bg-rose-500/10 text-rose-700",
                !positive && !negative && "bg-muted text-muted-foreground"
              )}
            >
              <ChangeIcon className="h-3 w-3" />
              {formatSignedPercent(change)}
            </span>
          ) : null}
        </div>
        <div className="mt-4 flex items-center gap-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {kpi.label}
          </p>
          {tooltip ? <HelpTip>{tooltip}</HelpTip> : null}
        </div>
        <p className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          {formatKpiValue(kpi, currency)}
        </p>
        {hint ? (
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Generic stat tile — for plain values that aren't KPIs (no change %).
 */
export function StatTile({
  label,
  value,
  hint,
  tooltip,
  icon: Icon = Package2
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tooltip?: string;
  icon?: LucideIcon;
}) {
  return (
    <Card className="transition-shadow hover:shadow-lg">
      <CardContent className="p-5">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="mt-4 flex items-center gap-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          {tooltip ? <HelpTip>{tooltip}</HelpTip> : null}
        </div>
        <p className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{value}</p>
        {hint ? (
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
