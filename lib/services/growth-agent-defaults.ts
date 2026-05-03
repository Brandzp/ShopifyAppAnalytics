import type { GrowthAgentSettings, GrowthPlatformConnection } from "@/lib/domain/growth-agent-types";

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
