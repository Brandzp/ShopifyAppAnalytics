import { Badge } from "@/components/ui/badge";
import type { Store } from "@/lib/domain/types";
import type { AppLocale } from "@/lib/i18n";
import { ReportingPicker } from "@/components/layout/reporting-picker";
import {
  StoreSwitcher,
  type StoreSwitcherStore
} from "@/components/layout/store-switcher";

export interface TopbarControls {
  dateRangeLabel?: string;
  comparisonLabel?: string;
  startDate?: string;
  endDate?: string;
  preset?: string;
  comparison?: {
    mode: string;
    enabled: boolean;
    startDate: string;
    endDate: string;
    label: string;
  };
}

export function Topbar({
  store,
  controls,
  labels,
  allStores
}: {
  store: Store;
  controls?: TopbarControls;
  locale: AppLocale;
  labels: {
    common: Record<string, string>;
  };
  // List of every installed brand. When length > 1, the StoreSwitcher
  // renders as a dropdown next to the brand name. When length <= 1, it
  // renders as a subtle "+ Connect another brand" link.
  allStores?: StoreSwitcherStore[];
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-border/70 pb-5 sm:pb-6 lg:flex-row lg:items-center lg:justify-between">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <Badge>{store.connected ? labels.common.connectedStore : labels.common.storeSetup}</Badge>
          <p className="text-sm text-muted-foreground">{store.domain}</p>
          {allStores ? (
            <StoreSwitcher currentStoreId={store.id} stores={allStores} />
          ) : null}
        </div>
        <div>
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{store.name}</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {labels.common.founderAnalyticsCopy}
          </p>
        </div>
      </div>
      <ReportingPicker
        storeId={store.id}
        storeConnected={store.connected}
        initialPreset={(controls?.preset as never) ?? "last_30"}
        initialStart={controls?.startDate ?? new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
        initialEnd={controls?.endDate ?? new Date().toISOString().slice(0, 10)}
        initialComparisonMode={(controls?.comparison?.mode as never) ?? "prev_period"}
        initialComparisonStart={controls?.comparison?.startDate ?? ""}
        initialComparisonEnd={controls?.comparison?.endDate ?? ""}
        initialRangeLabel={controls?.dateRangeLabel ?? "Last 30 days"}
        initialComparisonLabel={controls?.comparisonLabel ?? "Previous period"}
        exportLabel={labels.common.exportSummary}
      />
    </div>
  );
}
