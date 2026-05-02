import { Badge } from "@/components/ui/badge";
import type { Store } from "@/lib/domain/types";
import type { AppLocale } from "@/lib/i18n";
import { DateRangeControls } from "@/components/layout/date-range-controls";

export function Topbar({
  store,
  controls,
  labels
}: {
  store: Store;
  controls?: {
    dateRangeLabel?: string;
    comparisonLabel?: string;
    startDate?: string;
    endDate?: string;
  };
  locale: AppLocale;
  labels: {
    common: Record<string, string>;
  };
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-border/70 pb-5 sm:pb-6 lg:flex-row lg:items-center lg:justify-between">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <Badge>{store.connected ? labels.common.connectedStore : labels.common.storeSetup}</Badge>
          <p className="text-sm text-muted-foreground">{store.domain}</p>
        </div>
        <div>
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{store.name}</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {labels.common.founderAnalyticsCopy}
          </p>
        </div>
      </div>
      <DateRangeControls
        initialStart={controls?.startDate ?? new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
        initialEnd={controls?.endDate ?? new Date().toISOString().slice(0, 10)}
        comparisonLabel={controls?.comparisonLabel ?? labels.common.compareToPriorPeriod}
        exportLabel={labels.common.exportSummary}
      />
    </div>
  );
}
