import { AlertOctagon, Bot, Briefcase, Lightbulb, Plug, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NarrativeBanner } from "@/components/dashboard-v2/narrative-banner";
import { PageHead, SectionHead } from "@/components/dashboard-v2/section-head";
import { StatTile } from "@/components/dashboard-v2/kpi-tile";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getGrowthAgentOverview } from "@/lib/services/growth-agent-overview-service";
import { getGrowthAgentStoreContext } from "@/lib/services/growth-agent-service";
import { GrowthAgentNav } from "@/components/growth-agent/agent-nav";
import { GrowthStatusBadge } from "@/components/growth-agent/status-badge";
import { GrowthMonitoringGrid } from "@/components/growth-agent/monitoring-grid";
import { GrowthFindingsList } from "@/components/growth-agent/findings-list";
import { GrowthActionCenter } from "@/components/growth-agent/action-center";
import { GrowthConnectionsPanel } from "@/components/growth-agent/connections-panel";
import { GrowthAgentManualControls } from "@/components/growth-agent/manual-controls";
import { ProductRecommendationsPanel } from "@/components/growth-agent/product-recommendations-panel";
import { formatNumber } from "@/lib/utils";

export default async function GrowthAgentOverviewPage() {
  const { store } = await getGrowthAgentStoreContext();
  const [chrome, overview] = await Promise.all([
    getAppChromeData(store.id),
    getGrowthAgentOverview(store.id)
  ]);

  const connectedCount = overview.connectedPlatforms.filter((item) => item.status === "connected").length;
  const tone = overview.status === "active" ? "up" : "neutral";
  const headline =
    overview.status === "active"
      ? `Agent is active in ${overview.currentMode.replaceAll("_", " ")} mode - ${overview.alertsLast7Days} alerts in the last 7 days.`
      : "Agent is paused. Switch it on to start watching your store.";
  const body = `${connectedCount} of ${overview.connectedPlatforms.length} platforms connected | ${overview.activeRulesCount} active rules | ${overview.productRecommendations.length} sourcing ideas waiting.`;
  const comparisonSummary = overview.provenance.comparisonWindow
    ? `${overview.provenance.comparisonWindow} (${overview.provenance.comparisonLabel})`
    : "No comparison window selected.";

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 sm:space-y-8">
        <PageHead
          eyebrow="Growth Agent"
          title="AI-driven monitoring for store health, traffic, and sourcing"
          description="Detect anomalies, explain likely causes, and run guarded actions using the store and reporting window shown below."
        />

        <NarrativeBanner
          eyebrow="Agent status"
          headline={headline}
          body={body}
          tone={tone}
          toneLabel={overview.status === "active" ? "Active" : "Paused"}
        />

        <GrowthAgentNav />

        <GrowthAgentManualControls storeId={store.id} />

        <section className="space-y-3">
          <SectionHead
            eyebrow="Step 1"
            title="Agent at a glance"
            hint="Six metrics that tell you if the agent is healthy and connected."
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <StatTile
              label="Agent status"
              value={
                <span className="flex justify-center">
                  <GrowthStatusBadge status={overview.status} />
                </span>
              }
              icon={Bot}
              tooltip="Whether the agent is currently active, paused, or in error."
            />
            <StatTile
              label="Current mode"
              value={overview.currentMode.replaceAll("_", " ")}
              icon={ShieldCheck}
              tooltip="Operating mode: observe-only, recommend, or auto-execute."
            />
            <StatTile
              label="Connected platforms"
              value={formatNumber(connectedCount)}
              icon={Plug}
              tooltip="Data sources currently healthy (Shopify, traffic, ads, social, crawler)."
              hint={`${connectedCount} / ${overview.connectedPlatforms.length} healthy`}
            />
            <StatTile
              label="Active rules"
              value={formatNumber(overview.activeRulesCount)}
              icon={Briefcase}
              tooltip="Detection rules and guardrails the agent enforces right now."
            />
            <StatTile
              label="Alerts (7d)"
              value={formatNumber(overview.alertsLast7Days)}
              icon={AlertOctagon}
              tooltip="Anomalies the agent surfaced in the past week."
              hint="Spikes mean something material moved."
            />
            <StatTile
              label="Product ideas"
              value={formatNumber(overview.productRecommendations.length)}
              icon={Lightbulb}
              tooltip="Sourcing ideas surfaced by the crawler that match your catalog and margin targets."
            />
          </div>
        </section>

        <section className="space-y-3">
          <SectionHead
            eyebrow="Step 2"
            title="Live status and evidence"
            hint="What the agent did most recently, which store it is reading, and which data sources are feeding it."
          />
          <div className="grid items-start gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Latest agent activity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  <strong className="text-foreground">Last sync:</strong>{" "}
                  {overview.lastSyncTime ? new Date(overview.lastSyncTime).toLocaleString("en-US") : "No sync yet"}
                </p>
                <p>
                  <strong className="text-foreground">Top detected issues:</strong>{" "}
                  {overview.topDetectedIssues.length
                    ? overview.topDetectedIssues.map((item) => item.metricName).join(" | ")
                    : "No urgent issues"}
                </p>
                <div className="rounded-xl border border-border/70 bg-muted/35 p-3">
                  <p>
                    <strong className="text-foreground">Store in scope:</strong>{" "}
                    {overview.provenance.storeName} ({overview.provenance.storeDomain})
                  </p>
                  <p>
                    <strong className="text-foreground">Reporting window:</strong>{" "}
                    {overview.provenance.reportingWindow} ({overview.provenance.reportingLabel})
                  </p>
                  <p>
                    <strong className="text-foreground">Compared against:</strong>{" "}
                    {comparisonSummary}
                  </p>
                  <p>
                    <strong className="text-foreground">Data used:</strong>{" "}
                    {formatNumber(overview.provenance.ordersAnalyzed)} orders and{" "}
                    {formatNumber(overview.provenance.productsAnalyzed)} products in the current window.
                  </p>
                  <p>
                    <strong className="text-foreground">Snapshot source:</strong>{" "}
                    {overview.provenance.lastSnapshotSource ?? "No snapshot yet"}
                  </p>
                </div>
                <p className="rounded-lg bg-indigo-500/5 px-3 py-2 text-indigo-700">
                  This agent is locked to the connected store shown above. Actions only run for that store when they are allowed, connected, above confidence threshold, and inside your guardrails.
                </p>
                <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-amber-800">
                  Channel explanations are strongest when traffic and ad connectors are healthy. Without them, the agent falls back to Shopify order signals and directional heuristics.
                </p>
              </CardContent>
            </Card>
            <GrowthConnectionsPanel connections={overview.connectedPlatforms} />
          </div>
        </section>

        {overview.productRecommendations.length ? (
          <section className="space-y-3">
            <SectionHead
              eyebrow="Step 3"
              title="Sourcing ideas waiting for review"
              hint="Crawler-surfaced products that match your store. Approve in the Action Center to draft them."
            />
            <ProductRecommendationsPanel
              recommendations={overview.productRecommendations}
              currency={chrome.store.currency}
              storeId={store.id}
            />
          </section>
        ) : null}

        <section className="space-y-3">
          <SectionHead
            eyebrow="Step 4"
            title="Monitoring grid"
            hint="Per-metric and per-channel signals the agent is watching right now."
          />
          <GrowthMonitoringGrid
            cards={overview.monitoringCards}
            trafficChannels={overview.trafficChannels}
            currency={chrome.store.currency}
          />
        </section>

        <section className="space-y-3">
          <SectionHead
            eyebrow="Step 5"
            title="Recent findings and action queue"
            hint="Left is what the agent flagged. Right is what is waiting for approval or already executed."
          />
          <div className="grid items-start gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <GrowthFindingsList findings={overview.findings.slice(0, 6)} title="Recent findings" />
            <GrowthActionCenter actions={overview.actions.slice(0, 6)} storeId={store.id} title="Action center preview" />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
