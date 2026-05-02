import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getGrowthAgentOverview } from "@/lib/services/growth-agent-overview-service";
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
  const [chrome, overview] = await Promise.all([getAppChromeData(), getGrowthAgentOverview()]);

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <SectionHeading
          eyebrow="Growth Agent"
          title="AI-driven monitoring for store health, traffic signals, guarded automation, and product discovery"
          description="Detect anomalies, explain likely causes, and optionally crawl supplier or catalog pages to surface product ideas that fit the store."
        />
        <GrowthAgentNav />
      </section>

      <GrowthAgentManualControls />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Agent status" value={<span className="flex justify-center"><GrowthStatusBadge status={overview.status} /></span>} />
        <StatCard label="Current mode" value={overview.currentMode.replaceAll("_", " ")} />
        <StatCard label="Connected platforms" value={formatNumber(overview.connectedPlatforms.filter((item) => item.status === "connected").length)} />
        <StatCard label="Active rules" value={formatNumber(overview.activeRulesCount)} />
        <StatCard label="Alerts in last 7 days" value={formatNumber(overview.alertsLast7Days)} />
        <StatCard label="Product ideas" value={formatNumber(overview.productRecommendations.length)} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Agent overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Last sync: {overview.lastSyncTime ? new Date(overview.lastSyncTime).toLocaleString("en-US") : "No sync yet"}</p>
            <p>Top detected issues: {overview.topDetectedIssues.length ? overview.topDetectedIssues.map((item) => item.metricName).join(" • ") : "No urgent issues"}</p>
            <p>The agent will only execute actions that are allowed, connected, above confidence threshold, and inside the configured guardrails.</p>
          </CardContent>
        </Card>
        <GrowthConnectionsPanel connections={overview.connectedPlatforms} />
      </section>

      {overview.productRecommendations.length ? (
        <ProductRecommendationsPanel recommendations={overview.productRecommendations} currency={chrome.store.currency} />
      ) : null}

      <GrowthMonitoringGrid cards={overview.monitoringCards} trafficChannels={overview.trafficChannels} currency={chrome.store.currency} />

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <GrowthFindingsList findings={overview.findings.slice(0, 6)} title="Recent findings" />
        <GrowthActionCenter actions={overview.actions.slice(0, 6)} title="Action center preview" />
      </section>
    </AppShell>
  );
}

