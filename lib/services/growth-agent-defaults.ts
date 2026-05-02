import type {
  GrowthAction,
  GrowthAgentSettings,
  GrowthFinding,
  GrowthPlatformConnection,
  GrowthTrafficChannel
} from "@/lib/domain/growth-agent-types";

export const defaultGrowthAgentSettings: GrowthAgentSettings = {
  agentEnabled: true,
  agentMode: "approval_required",
  checkFrequencyMinutes: 60,
  thresholds: {
    sessionsDropPercent: 20,
    ordersDropPercent: 15,
    conversionRateDropPercent: 12,
    aovDropPercent: 10,
    returningCustomerDropPercent: 10,
    trafficSourceDropPercent: 25
  },
  comparisonWindows: {
    compareToYesterday: true,
    compareToLast7Days: true,
    compareToSameWeekdayLastWeek: true
  },
  channels: {
    shopify: true,
    metaAds: false,
    instagram: true,
    facebook: false,
    tiktok: false,
    googleAnalytics: false
  },
  notifications: {
    email: true,
    inApp: true,
    slack: false,
    webhook: false
  },
  guardrails: {
    maxDailyAdBudget: 250,
    maxSingleActionBudget: 80,
    minConfidenceScore: 0.72,
    requireInventoryAvailable: true,
    minimumInventoryThreshold: 8,
    blockIfTrackingConfidenceLow: true,
    cooldownMinutesBetweenActions: 180
  },
  allowedActions: {
    sendAlert: true,
    createRecommendation: true,
    createCreativeBrief: true,
    draftOrganicPost: true,
    publishOrganicPost: false,
    createAdCampaignDraft: true,
    launchAdCampaign: false,
    scaleExistingCampaign: false,
    pauseCampaign: true
  },
  approvalRules: {
    requireApprovalAboveBudget: 40,
    requireApprovalForCampaignLaunch: true,
    requireApprovalForScaling: true,
    requireApprovalForPublishingPost: true
  },
  productResearch: {
    enabled: false,
    sourceUrls: "",
    nicheKeywords: "",
    maxRecommendations: 6
  }
};

export const defaultPlatformConnections: Omit<GrowthPlatformConnection, "id">[] = [
  { platform: "shopify", status: "connected", healthMessage: "Store data is available through the Shopify ingestion pipeline.", lastSyncAt: null, tokenLastFour: null },
  { platform: "productCrawler", status: "stub", healthMessage: "Product crawler is ready. Add supplier, catalog, or product-listing URLs to let AI discover products.", lastSyncAt: null, tokenLastFour: null },
  { platform: "amazon", status: "stub", healthMessage: "Amazon supplier drafting is ready. Save ASINs or supplier URLs to prepare manual dropship order drafts.", lastSyncAt: null, tokenLastFour: null },
  { platform: "metaAds", status: "stub", healthMessage: "Connector scaffold is ready. OAuth/token exchange is still required.", lastSyncAt: null, tokenLastFour: null },
  { platform: "instagram", status: "stub", healthMessage: "Can reuse creator/Instagram signals when connected.", lastSyncAt: null, tokenLastFour: null },
  { platform: "facebook", status: "stub", healthMessage: "Meta page and traffic signals are not connected yet.", lastSyncAt: null, tokenLastFour: null },
  { platform: "tiktok", status: "stub", healthMessage: "TikTok Ads connector is prepared as a stub.", lastSyncAt: null, tokenLastFour: null },
  { platform: "googleAnalytics", status: "stub", healthMessage: "Analytics source abstraction is ready for GA4 or another traffic source.", lastSyncAt: null, tokenLastFour: null }
];

export const fallbackFindings: GrowthFinding[] = [
  {
    id: "finding-sessions-drop",
    findingType: "traffic_drop",
    severity: "critical",
    metricName: "sessions",
    summary: "Sessions down 32% versus the 7-day baseline.",
    possibleCauses: ["Paid social delivery softened", "Landing page tracking may be degraded"],
    recommendedActions: ["Check paid social spend and campaign delivery", "Verify tracking confidence before taking paid action"],
    confidenceScore: 0.82,
    timestamp: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
    sourceData: { delta7d: -32, deltaYesterday: -21, confidence: 0.82 }
  },
  {
    id: "finding-conversion-stable",
    findingType: "stability_signal",
    severity: "info",
    metricName: "conversion_rate",
    summary: "Conversion rate is stable while traffic dropped.",
    possibleCauses: ["Site experience is likely intact", "Traffic quality mix changed more than merchandising"],
    recommendedActions: ["Investigate channel acquisition before changing storefront messaging"],
    confidenceScore: 0.74,
    timestamp: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
    sourceData: { delta7d: -1.8 }
  },
  {
    id: "finding-inventory",
    findingType: "inventory_risk",
    severity: "warning",
    metricName: "inventory",
    summary: "Top product inventory is below the configured threshold.",
    possibleCauses: ["High sell-through on the hero SKU", "Replenishment lag"],
    recommendedActions: ["Hold any scale-up recommendation for the hero SKU", "Review replenishment ETA"],
    confidenceScore: 0.91,
    timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    sourceData: { sku: "hero", inventory: 4 }
  }
];

export const fallbackActions: GrowthAction[] = [
  {
    id: "action-recommendation-1",
    actionType: "CREATE_RECOMMENDATION",
    status: "recommended",
    title: "Review paid social traffic health before budget changes",
    reason: "Traffic declined while conversion remained stable, which points more strongly to acquisition than to site performance.",
    payload: { channel: "metaAds", dryRun: true },
    estimatedImpact: { upside: "Recover traffic quality before revenue erosion deepens" },
    riskLevel: "low",
    confidenceScore: 0.82,
    approvalRequired: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 50).toISOString()
  },
  {
    id: "action-creative-brief-1",
    actionType: "GENERATE_CREATIVE_BRIEF",
    status: "pending_approval",
    title: "Generate a creative brief for retention-focused organic content",
    reason: "Returning customers softened and inventory is limited, so a non-paid recovery step is safer than launching spend.",
    payload: { channel: "instagram", objective: "retention" },
    estimatedImpact: { impact: "Support existing customer demand without adding paid risk" },
    riskLevel: "medium",
    confidenceScore: 0.76,
    approvalRequired: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 75).toISOString()
  }
];

export const fallbackTrafficChannels: GrowthTrafficChannel[] = [
  { channel: "Organic", sessions: 4820, revenue: 18240, delta: -6.2, confidence: 0.88, status: "normal" },
  { channel: "Paid Social", sessions: 2130, revenue: 6240, delta: -41.1, confidence: 0.79, status: "critical" },
  { channel: "Email", sessions: 1220, revenue: 5940, delta: 8.4, confidence: 0.92, status: "normal" },
  { channel: "Direct", sessions: 880, revenue: 3010, delta: -11.7, confidence: 0.61, status: "warning" }
];

