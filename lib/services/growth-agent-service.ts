import type {
  GrowthAction,
  GrowthAgentSettings,
  GrowthFinding,
  GrowthMetricSnapshot,
  GrowthPlatform,
  GrowthPlatformConnection
} from "@/lib/domain/growth-agent-types";
import { AppError } from "@/lib/server/errors";
import { getDb } from "@/lib/server/db";
import { resolveOrCreateBaseStore } from "@/lib/services/creator-admin-service";
import { defaultGrowthAgentSettings, defaultPlatformConnections } from "@/lib/services/growth-agent-defaults";

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function asSettingsRecord(input?: Partial<GrowthAgentSettings>): GrowthAgentSettings {
  const base = deepClone(defaultGrowthAgentSettings);
  if (!input) return base;
  return {
    ...base,
    ...input,
    thresholds: { ...base.thresholds, ...(input.thresholds ?? {}) },
    comparisonWindows: { ...base.comparisonWindows, ...(input.comparisonWindows ?? {}) },
    channels: { ...base.channels, ...(input.channels ?? {}) },
    notifications: { ...base.notifications, ...(input.notifications ?? {}) },
    guardrails: { ...base.guardrails, ...(input.guardrails ?? {}) },
    allowedActions: { ...base.allowedActions, ...(input.allowedActions ?? {}) },
    approvalRules: { ...base.approvalRules, ...(input.approvalRules ?? {}) },
    productResearch: { ...base.productResearch, ...(input.productResearch ?? {}) }
  };
}

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  if (typeof value === "object") return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

function decimalToNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

async function getStoreOrThrow(storeId?: string) {
  const db = getDb();
  if (!db) throw new AppError("Database client is not available.", 500);
  const store = storeId
    ? await db.store.findUnique({ where: { id: storeId } })
    : await resolveOrCreateBaseStore();
  if (!store) throw new AppError("Store was not found.", 404);
  return { db, store };
}

export async function ensureGrowthAgentDefaults(storeId?: string) {
  const { db, store } = await getStoreOrThrow(storeId);

  if (db.agentSettings) {
    await db.agentSettings.upsert({
      where: { storeId: store.id },
      update: {},
      create: {
        storeId: store.id,
        enabled: defaultGrowthAgentSettings.agentEnabled,
        mode: defaultGrowthAgentSettings.agentMode,
        checkFrequencyMinutes: defaultGrowthAgentSettings.checkFrequencyMinutes,
        thresholds: defaultGrowthAgentSettings.thresholds,
        comparisonWindows: defaultGrowthAgentSettings.comparisonWindows,
        channels: defaultGrowthAgentSettings.channels,
        notifications: defaultGrowthAgentSettings.notifications,
        guardrails: defaultGrowthAgentSettings.guardrails,
        allowedActions: defaultGrowthAgentSettings.allowedActions,
        approvalRules: defaultGrowthAgentSettings.approvalRules,
        productResearch: defaultGrowthAgentSettings.productResearch
      }
    });
  }

  if (db.platformConnection) {
    const shopifyConnected = Boolean(store.connected);
    for (const connection of defaultPlatformConnections) {
      await db.platformConnection.upsert({
        where: { storeId_platform: { storeId: store.id, platform: connection.platform } },
        update: connection.platform === "shopify"
          ? {
              status: shopifyConnected ? "connected" : "not_connected",
              healthMessage: shopifyConnected ? "Shopify ingestion is available." : "Connect Shopify to enable store monitoring.",
              lastSyncAt: shopifyConnected ? new Date() : null
            }
          : {},
        create: {
          storeId: store.id,
          platform: connection.platform,
          status: connection.platform === "shopify" ? (shopifyConnected ? "connected" : "not_connected") : connection.status,
          healthMessage: connection.platform === "shopify"
            ? shopifyConnected ? "Shopify ingestion is available." : "Connect Shopify to enable store monitoring."
            : connection.healthMessage,
          lastSyncAt: connection.platform === "shopify" && shopifyConnected ? new Date() : null,
          config: {}
        }
      });
    }
  }

  return store;
}

export async function getGrowthAgentSettings(storeId?: string): Promise<GrowthAgentSettings> {
  const { db, store } = await getStoreOrThrow(storeId);
  await ensureGrowthAgentDefaults(store.id);
  if (!db.agentSettings) return deepClone(defaultGrowthAgentSettings);

  const row = await db.agentSettings.findUnique({ where: { storeId: store.id } });
  if (!row) return deepClone(defaultGrowthAgentSettings);

  return {
    agentEnabled: Boolean(row.enabled),
    agentMode: row.mode,
    checkFrequencyMinutes: row.checkFrequencyMinutes,
    thresholds: parseJsonField(row.thresholds, deepClone(defaultGrowthAgentSettings.thresholds)),
    comparisonWindows: parseJsonField(row.comparisonWindows, deepClone(defaultGrowthAgentSettings.comparisonWindows)),
    channels: parseJsonField(row.channels, deepClone(defaultGrowthAgentSettings.channels)),
    notifications: parseJsonField(row.notifications, deepClone(defaultGrowthAgentSettings.notifications)),
    guardrails: parseJsonField(row.guardrails, deepClone(defaultGrowthAgentSettings.guardrails)),
    allowedActions: parseJsonField(row.allowedActions, deepClone(defaultGrowthAgentSettings.allowedActions)),
    approvalRules: parseJsonField(row.approvalRules, deepClone(defaultGrowthAgentSettings.approvalRules)),
    productResearch: parseJsonField((row as any).productResearch, deepClone(defaultGrowthAgentSettings.productResearch))
  } as GrowthAgentSettings;
}

export async function saveGrowthAgentSettings(input: Partial<GrowthAgentSettings>, storeId?: string) {
  const { db, store } = await getStoreOrThrow(storeId);
  const next = asSettingsRecord(input);

  if (!db.agentSettings) {
    return { ok: true, settings: next };
  }

  await db.agentSettings.upsert({
    where: { storeId: store.id },
    update: {
      enabled: next.agentEnabled,
      mode: next.agentMode,
      checkFrequencyMinutes: next.checkFrequencyMinutes,
      thresholds: next.thresholds,
      comparisonWindows: next.comparisonWindows,
      channels: next.channels,
      notifications: next.notifications,
      guardrails: next.guardrails,
      allowedActions: next.allowedActions,
      approvalRules: next.approvalRules,
      productResearch: next.productResearch
    },
    create: {
      storeId: store.id,
      enabled: next.agentEnabled,
      mode: next.agentMode,
      checkFrequencyMinutes: next.checkFrequencyMinutes,
      thresholds: next.thresholds,
      comparisonWindows: next.comparisonWindows,
      channels: next.channels,
      notifications: next.notifications,
      guardrails: next.guardrails,
      allowedActions: next.allowedActions,
      approvalRules: next.approvalRules,
      productResearch: next.productResearch
    }
  });

  return { ok: true, settings: next };
}

export async function getGrowthPlatformConnections(storeId?: string): Promise<GrowthPlatformConnection[]> {
  const { db, store } = await getStoreOrThrow(storeId);
  await ensureGrowthAgentDefaults(store.id);
  if (!db.platformConnection) {
    return defaultPlatformConnections.map((connection, index) => ({ ...connection, id: `connection-${index}` }));
  }

  const rows = await db.platformConnection.findMany({ where: { storeId: store.id }, orderBy: { platform: "asc" } });
  return rows.map((row: any) => ({
    id: row.id,
    platform: row.platform as GrowthPlatform,
    status: row.status,
    config: parseJsonField<Record<string, unknown> | null>(row.config, {}),
    healthMessage: row.healthMessage ?? null,
    tokenLastFour: row.tokenLastFour ?? null,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null
  }));
}

export async function saveGrowthPlatformConnection(input: {
  platform: GrowthPlatform;
  status: "connected" | "not_connected" | "degraded" | "stub";
  config?: Record<string, unknown>;
  healthMessage?: string;
  tokenLastFour?: string | null;
  lastSyncAt?: string | null;
}, storeId?: string) {
  const { db, store } = await getStoreOrThrow(storeId);
  await ensureGrowthAgentDefaults(store.id);
  if (!db.platformConnection) return { ok: true };

  await db.platformConnection.upsert({
    where: { storeId_platform: { storeId: store.id, platform: input.platform } },
    update: {
      status: input.status,
      config: input.config ?? {},
      healthMessage: input.healthMessage ?? null,
      tokenLastFour: input.tokenLastFour ?? null,
      lastSyncAt: input.lastSyncAt ? new Date(input.lastSyncAt) : new Date()
    },
    create: {
      storeId: store.id,
      platform: input.platform,
      status: input.status,
      config: input.config ?? {},
      healthMessage: input.healthMessage ?? null,
      tokenLastFour: input.tokenLastFour ?? null,
      lastSyncAt: input.lastSyncAt ? new Date(input.lastSyncAt) : new Date()
    }
  });

  return { ok: true };
}

export async function getGrowthFindings(storeId?: string): Promise<GrowthFinding[]> {
  const { db, store } = await getStoreOrThrow(storeId);
  if (!db.agentFinding) return [];
  const rows = await db.agentFinding.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" }, take: 25 });
  return rows.map((row: any) => ({
    id: row.id,
    findingType: row.findingType,
    severity: row.severity,
    metricName: row.metricName,
    summary: row.summary,
    possibleCauses: parseJsonField<string[]>(row.possibleCauses, []),
    recommendedActions: parseJsonField<string[]>(row.recommendedActions, []),
    confidenceScore: decimalToNumber(row.confidenceScore, 0.65),
    timestamp: row.createdAt.toISOString(),
    sourceData: parseJsonField<Record<string, unknown> | null>(row.sourceData, null)
  }));
}

export async function replaceGrowthFindings(findings: GrowthFinding[], storeId?: string) {
  const { db, store } = await getStoreOrThrow(storeId);
  if (!db.agentFinding) return { ok: true, count: findings.length };
  await db.agentFinding.deleteMany({ where: { storeId: store.id } });
  if (findings.length) {
    await db.agentFinding.createMany({
      data: findings.map((finding) => ({
        id: finding.id,
        storeId: store.id,
        findingType: finding.findingType,
        severity: finding.severity,
        metricName: finding.metricName,
        summary: finding.summary,
        possibleCauses: finding.possibleCauses,
        recommendedActions: finding.recommendedActions,
        confidenceScore: finding.confidenceScore,
        sourceData: finding.sourceData ?? {},
        createdAt: new Date(finding.timestamp)
      }))
    });
  }
  return { ok: true, count: findings.length };
}

export async function getGrowthActions(storeId?: string): Promise<GrowthAction[]> {
  const { db, store } = await getStoreOrThrow(storeId);
  if (!db.agentAction) return [];
  const rows = await db.agentAction.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" }, take: 40 });
  return rows.map((row: any) => ({
    id: row.id,
    actionType: row.actionType,
    status: row.status,
    title: row.title,
    reason: row.reason,
    payload: parseJsonField<Record<string, unknown>>(row.payload, {}),
    estimatedImpact: parseJsonField<Record<string, unknown> | null>(row.estimatedImpact, null),
    riskLevel: row.riskLevel,
    confidenceScore: decimalToNumber(row.confidenceScore, 0.65),
    approvalRequired: Boolean(row.approvalRequired),
    approvedBy: row.approvedBy ?? null,
    executedAt: row.executedAt?.toISOString() ?? null,
    failureReason: row.failureReason ?? null,
    createdAt: row.createdAt.toISOString()
  }));
}

export async function createGrowthActions(actions: GrowthAction[], storeId?: string) {
  const { db, store } = await getStoreOrThrow(storeId);
  if (!db.agentAction) return { ok: true, count: actions.length };
  if (!actions.length) return { ok: true, count: 0 };
  await db.agentAction.createMany({
    data: actions.map((action) => ({
      id: action.id,
      storeId: store.id,
      actionType: action.actionType,
      status: action.status,
      title: action.title,
      reason: action.reason,
      payload: action.payload,
      estimatedImpact: action.estimatedImpact ?? {},
      riskLevel: action.riskLevel,
      confidenceScore: action.confidenceScore,
      approvalRequired: action.approvalRequired,
      approvedBy: action.approvedBy ?? null,
      dryRun: true,
      executedAt: action.executedAt ? new Date(action.executedAt) : null,
      failureReason: action.failureReason ?? null,
      createdAt: new Date(action.createdAt)
    })),
    skipDuplicates: true
  });
  return { ok: true, count: actions.length };
}

export async function updateGrowthActionStatus(input: {
  actionId: string;
  status: GrowthAction["status"];
  approvedBy?: string | null;
  failureReason?: string | null;
  executedAt?: string | null;
}, storeId?: string) {
  const { db, store } = await getStoreOrThrow(storeId);
  if (!db.agentAction) throw new AppError("Action storage is not available.", 500);

  const existing = await db.agentAction.findFirst({
    where: { id: input.actionId, storeId: store.id }
  });

  if (!existing) {
    throw new AppError("This action no longer exists. Refresh the page and run a fresh scan if needed.", 404);
  }

  const row = await db.agentAction.update({
    where: { id: input.actionId },
    data: {
      status: input.status,
      approvedBy: input.approvedBy ?? undefined,
      failureReason: input.failureReason ?? undefined,
      executedAt: input.executedAt ? new Date(input.executedAt) : input.status === "executed" ? new Date() : undefined
    }
  });

  return {
    ok: true,
    action: {
      id: row.id,
      status: row.status,
      executedAt: row.executedAt?.toISOString() ?? null
    }
  };
}

export async function getGrowthMetricSnapshots(storeId?: string): Promise<GrowthMetricSnapshot[]> {
  const { db, store } = await getStoreOrThrow(storeId);
  if (!db.metricSnapshot) return [];
  const rows = await db.metricSnapshot.findMany({ where: { storeId: store.id }, orderBy: { bucketedAt: "desc" }, take: 48 });
  return rows.map((row: any) => ({
    id: row.id,
    source: row.source,
    bucketedAt: row.bucketedAt.toISOString(),
    metrics: parseJsonField<Record<string, unknown>>(row.metrics, {}),
    confidenceScore: row.confidenceScore ? decimalToNumber(row.confidenceScore) : null
  }));
}

export async function createGrowthMetricSnapshot(input: {
  source: string;
  bucketedAt: string;
  metrics: Record<string, unknown>;
  confidenceScore?: number | null;
}, storeId?: string) {
  const { db, store } = await getStoreOrThrow(storeId);
  if (!db.metricSnapshot) return { ok: true };
  await db.metricSnapshot.create({
    data: {
      storeId: store.id,
      source: input.source,
      bucketedAt: new Date(input.bucketedAt),
      metrics: input.metrics,
      confidenceScore: input.confidenceScore ?? null
    }
  });
  return { ok: true };
}

export async function getGrowthAgentStoreContext(storeId?: string) {
  return getStoreOrThrow(storeId);
}

export async function getGrowthWebhookEvents(storeId?: string) {
  const { db, store } = await getStoreOrThrow(storeId);
  if (!db.webhookEvent) return [];
  const rows = await db.webhookEvent.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" }, take: 30 });
  return rows.map((row: any) => ({
    id: row.id,
    platform: row.platform,
    topic: row.topic,
    externalId: row.externalId ?? null,
    status: row.status,
    errorMessage: row.errorMessage ?? null,
    processedAt: row.processedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString()
  }));
}

export async function getGrowthAttributionSessions(storeId?: string) {
  const { db, store } = await getStoreOrThrow(storeId);
  if (!db.attributionSession) return [];
  const rows = await db.attributionSession.findMany({ where: { storeId: store.id }, include: { affiliateMember: true }, orderBy: { createdAt: "desc" }, take: 30 });
  return rows.map((row: any) => ({
    id: row.id,
    clickId: row.clickId,
    affiliateCode: row.affiliateCode ?? row.affiliateMember?.affiliateCode ?? null,
    affiliateName: row.affiliateMember ? `${row.affiliateMember.firstName} ${row.affiliateMember.lastName}` : "-",
    couponCode: row.couponCode ?? null,
    sourcePlatform: row.sourcePlatform ?? null,
    sourceUrl: row.sourceUrl ?? null,
    destinationUrl: row.destinationUrl,
    convertedAt: row.convertedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString()
  }));
}

