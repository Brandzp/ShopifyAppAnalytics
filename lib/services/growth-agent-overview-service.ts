import type { GrowthOverviewPayload, GrowthProductRecommendation } from "@/lib/domain/growth-agent-types";
import { buildGrowthActionsFromFindings } from "@/lib/services/growth-agent-action-engine";
import { runGrowthAgentAnomalyDetection } from "@/lib/services/growth-agent-anomaly-service";
import { fallbackActions, fallbackFindings } from "@/lib/services/growth-agent-defaults";
import {
  ensureGrowthAgentDefaults,
  getGrowthActions,
  getGrowthAgentSettings,
  getGrowthAgentStoreContext,
  getGrowthFindings,
  getGrowthMetricSnapshots,
  getGrowthPlatformConnections,
  replaceGrowthFindings
} from "@/lib/services/growth-agent-service";
import { runGrowthAgentManualSync } from "@/lib/services/growth-agent-sync-service";
import { getGrowthAgentProductRecommendations } from "@/lib/services/growth-agent-product-crawler-service";

function extractProductRecommendations(findings: GrowthOverviewPayload["findings"]): GrowthProductRecommendation[] {
  return findings
    .filter((finding) => finding.findingType === "product_opportunity" && finding.sourceData?.recommendation)
    .map((finding) => finding.sourceData?.recommendation)
    .filter((item): item is GrowthProductRecommendation => Boolean(item));
}

export async function runGrowthAgentManualScan(storeId?: string) {
  const { store } = await getGrowthAgentStoreContext(storeId);
  await ensureGrowthAgentDefaults(store.id);
  await runGrowthAgentManualSync(store.id);
  const [anomalyResult, settings, productRecommendations] = await Promise.all([
    runGrowthAgentAnomalyDetection(store.id),
    getGrowthAgentSettings(store.id),
    getGrowthAgentProductRecommendations(store.id)
  ]);

  const crawlerFindings = productRecommendations.map((recommendation) => ({
    id: `finding-product-${recommendation.id}`,
    findingType: "product_opportunity",
    severity: "info" as const,
    metricName: recommendation.title,
    summary: `Potential product opportunity found: ${recommendation.title}.`,
    possibleCauses: [
      `Matched source: ${recommendation.sourceDomain}`,
      recommendation.price ? `Observed price point: ${recommendation.price}` : "No public price detected"
    ],
    recommendedActions: [
      `Review supplier page: ${recommendation.sourceUrl}`,
      recommendation.matchedKeywords.length ? `Matched keywords: ${recommendation.matchedKeywords.join(", ")}` : "Compare this product against your current catalog positioning"
    ],
    confidenceScore: Math.min(0.96, Math.max(0.61, recommendation.score / 100)),
    timestamp: new Date().toISOString(),
    sourceData: {
      recommendation,
      sourceUrl: recommendation.sourceUrl,
      sourceDomain: recommendation.sourceDomain
    }
  }));

  const allFindings = settings.productResearch.enabled
    ? [...anomalyResult.findings, ...crawlerFindings]
    : anomalyResult.findings;

  await replaceGrowthFindings(allFindings, store.id);
  const actions = await buildGrowthActionsFromFindings(allFindings, store.id);

  return {
    ok: true,
    findingsCount: allFindings.length,
    actionsCreated: actions.length,
    confidence: anomalyResult.confidence,
    productRecommendations: productRecommendations.length,
    scannedAt: new Date().toISOString()
  };
}

export async function getGrowthAgentOverview(storeId?: string): Promise<GrowthOverviewPayload> {
  const { store } = await getGrowthAgentStoreContext(storeId);
  await ensureGrowthAgentDefaults(store.id);

  const [settings, snapshots, connections, findings, actions, anomalyResult] = await Promise.all([
    getGrowthAgentSettings(store.id),
    getGrowthMetricSnapshots(store.id),
    getGrowthPlatformConnections(store.id),
    getGrowthFindings(store.id),
    getGrowthActions(store.id),
    runGrowthAgentAnomalyDetection(store.id)
  ]);

  const effectiveFindings = findings.length ? findings : anomalyResult.findings.length ? anomalyResult.findings : fallbackFindings;
  const effectiveActions = actions.length ? actions : fallbackActions;
  const alertsLast7Days = effectiveFindings.filter((finding) => Date.now() - new Date(finding.timestamp).getTime() <= 7 * 24 * 60 * 60 * 1000).length;
  const productRecommendations = extractProductRecommendations(effectiveFindings);

  return {
    status: settings.agentEnabled ? "active" : "paused",
    lastSyncTime: snapshots[0]?.bucketedAt ?? null,
    currentMode: settings.agentMode,
    connectedPlatforms: connections,
    activeRulesCount: Object.values(settings.allowedActions).filter(Boolean).length + Object.keys(settings.thresholds).length,
    alertsLast7Days,
    recentActionsTaken: effectiveActions.filter((action) => action.status === "executed").length,
    topDetectedIssues: effectiveFindings.filter((finding) => finding.severity !== "info").slice(0, 3),
    monitoringCards: anomalyResult.monitoringCards,
    trafficChannels: anomalyResult.trafficChannels,
    findings: effectiveFindings,
    actions: effectiveActions,
    productRecommendations
  };
}

