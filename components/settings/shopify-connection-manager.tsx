"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ShopifyConnectionSummary, SyncRunSummary } from "@/lib/domain/types";

interface SyncStatusPayload {
  connection: {
    storeId: string;
    shopDomain: string;
    connected: boolean;
    syncStatus: string;
    lastSyncAt?: string | null;
    lastSyncError?: string | null;
  } | null;
  recentRuns: SyncRunSummary[];
}

interface ShopifyLabels {
  title: string;
  description: string;
  shopDomain: string;
  shopDomainPlaceholder: string;
  token: string;
  tokenHelp?: string;
  tokenPlaceholder: string;
  testConnection: string;
  testing: string;
  saveCredentials: string;
  saving: string;
  testSuccess: string;
  saveSuccess: string;
  connectionFailed: string;
  saveFailed: string;
  unexpectedError: string;
  notConnected: string;
  syncRunning: string;
  connected: string;
  connectionState: string;
  lastSync: string;
  noSyncYet: string;
  syncControlsTitle: string;
  syncControlsDescription: string;
  runInitialSync: string;
  runningInitialSync: string;
  runIncrementalSync: string;
  runningIncrementalSync: string;
  initialSyncDone: string;
  incrementalSyncDone: string;
  initialSyncFailed: string;
  incrementalSyncFailed: string;
  noSyncRuns: string;
  created: string;
  updated: string;
  failed: string;
  syncModes: { initial: string; incremental: string };
  syncStatuses: { idle: string; running: string; success: string; error: string };
}

export function ShopifyConnectionManager({
  initialConnection,
  initialSyncStatus,
  labels
}: {
  initialConnection: ShopifyConnectionSummary | null;
  initialSyncStatus: SyncStatusPayload;
  labels: ShopifyLabels;
}) {
  const [shopDomain, setShopDomain] = useState(initialConnection?.shopDomain ?? "");
  const [adminAccessToken, setAdminAccessToken] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState(initialSyncStatus);

  const storeId = syncStatus.connection?.storeId;

  async function refreshStatus() {
    const response = await fetch(`/api/shopify/sync/status${storeId ? `?storeId=${storeId}` : ""}`, {
      method: "GET"
    });
    const payload = await response.json();
    if (response.ok) {
      setSyncStatus({
        connection: payload.connection,
        recentRuns: payload.recentRuns ?? []
      });
    }
  }

  async function runAction<T>(action: string, handler: () => Promise<T>) {
    setLoadingAction(action);
    setError(null);
    setMessage(null);

    if ((action === "initial" || action === "incremental") && syncStatus.connection) {
      setSyncStatus((current) => ({
        ...current,
        connection: current.connection
          ? {
              ...current.connection,
              syncStatus: "running",
              lastSyncError: null
            }
          : current.connection
      }));
    }

    try {
      await handler();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : labels.unexpectedError);
    } finally {
      await refreshStatus().catch(() => null);
      setLoadingAction(null);
    }
  }

  const connectionStateLabel = useMemo(() => {
    if (!syncStatus.connection) return labels.notConnected;
    if (syncStatus.connection.syncStatus === "running") return labels.syncRunning;
    if (syncStatus.connection.connected) return labels.connected;
    return labels.notConnected;
  }, [labels.connected, labels.notConnected, labels.syncRunning, syncStatus.connection]);

  // Surfaces the last persisted sync failure — this covers manual syncs AND
  // the hourly background cron (both write connection.syncStatus/lastSyncError).
  const syncError =
    syncStatus.connection?.syncStatus === "error"
      ? syncStatus.connection?.lastSyncError ?? null
      : null;
  // The credential/encryption-key failure is the one that needs a specific
  // remediation rather than just showing the raw GCM error string.
  const isCredentialError =
    !!syncError &&
    /unable to authenticate data|unsupported state|SHOPIFY_CREDENTIALS_ENCRYPTION_KEY|malformed Shopify credential|decrypt/i.test(
      syncError
    );

  useEffect(() => {
    if (syncStatus.connection?.syncStatus !== "running") {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshStatus();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [syncStatus.connection?.storeId, syncStatus.connection?.syncStatus]);

  const syncControlsDisabled = !storeId || loadingAction !== null || syncStatus.connection?.syncStatus === "running";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{labels.title}</CardTitle>
          <CardDescription>{labels.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">{labels.shopDomain}</span>
              <input
                className="w-full rounded-xl border border-border bg-background px-4 py-3 outline-none ring-0"
                value={shopDomain}
                onChange={(event) => setShopDomain(event.target.value)}
                placeholder={labels.shopDomainPlaceholder}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">{labels.token}</span>
              <input
                type="password"
                className="w-full rounded-xl border border-border bg-background px-4 py-3 outline-none ring-0"
                value={adminAccessToken}
                onChange={(event) => setAdminAccessToken(event.target.value)}
                placeholder={labels.tokenPlaceholder}
              />
            </label>
          </div>

          {labels.tokenHelp ? <p className="text-sm text-muted-foreground">{labels.tokenHelp}</p> : null}

          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              disabled={loadingAction !== null}
              onClick={() =>
                runAction("test", async () => {
                  const response = await fetch("/api/shopify/connection/test", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ shopDomain, adminAccessToken })
                  });
                  const payload = await response.json();
                  if (!response.ok) throw new Error(payload.error ?? labels.connectionFailed);
                  setMessage(`${labels.testSuccess} ${payload.storePreview.name}.`);
                })
              }
            >
              {loadingAction === "test" ? labels.testing : labels.testConnection}
            </Button>
            <Button
              disabled={loadingAction !== null}
              onClick={() =>
                runAction("save", async () => {
                  const response = await fetch("/api/shopify/connection/save", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ shopDomain, adminAccessToken })
                  });
                  const payload = await response.json();
                  if (!response.ok) throw new Error(payload.error ?? labels.saveFailed);
                  setMessage(labels.saveSuccess);
                  setAdminAccessToken("");
                })
              }
            >
              {loadingAction === "save" ? labels.saving : labels.saveCredentials}
            </Button>
          </div>

          {syncError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-5">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500 text-white">
                  <AlertTriangle className="h-5 w-5" aria-hidden />
                </span>
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-rose-900">
                    {isCredentialError
                      ? "Shopify sync is blocked — credentials can’t be decrypted"
                      : "Last Shopify sync failed"}
                  </p>
                  {isCredentialError ? (
                    <p className="text-sm text-rose-800">
                      Your saved Shopify Admin API token can’t be decrypted, so every
                      sync (including the hourly background job) is failing. This
                      happens when <code className="font-mono text-xs">SHOPIFY_CREDENTIALS_ENCRYPTION_KEY</code>{" "}
                      changed since the token was saved. Fix it by either re-entering
                      and saving the access token above, or restoring the original
                      encryption key — then run a sync again.
                    </p>
                  ) : (
                    <p className="text-sm text-rose-800">
                      The most recent sync didn’t complete. The hourly background
                      sync will retry automatically.
                    </p>
                  )}
                  <p className="rounded-lg bg-rose-100/70 px-3 py-1.5 font-mono text-xs text-rose-900">
                    {syncError}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-border/70 bg-background/70 p-4 text-sm">
            <p className="font-semibold">{labels.connectionState}: {connectionStateLabel}</p>
            <p className="mt-2 text-muted-foreground">
              {syncStatus.connection?.lastSyncAt
                ? `${labels.lastSync}: ${new Date(syncStatus.connection.lastSyncAt).toLocaleString()}`
                : labels.noSyncYet}
            </p>
          </div>

          {message ? <p className="text-sm text-success">{message}</p> : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{labels.syncControlsTitle}</CardTitle>
          <CardDescription>{labels.syncControlsDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              disabled={syncControlsDisabled}
              onClick={() =>
                runAction("initial", async () => {
                  const response = await fetch("/api/shopify/sync/initial", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ storeId })
                  });
                  const payload = await response.json();
                  if (!response.ok) throw new Error(payload.error ?? labels.initialSyncFailed);
                  setMessage(labels.initialSyncDone);
                })
              }
            >
              {loadingAction === "initial" ? labels.runningInitialSync : labels.runInitialSync}
            </Button>
            <Button
              disabled={syncControlsDisabled}
              onClick={() =>
                runAction("incremental", async () => {
                  const response = await fetch("/api/shopify/sync/incremental", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ storeId })
                  });
                  const payload = await response.json();
                  if (!response.ok) throw new Error(payload.error ?? labels.incrementalSyncFailed);
                  setMessage(labels.incrementalSyncDone);
                })
              }
            >
              {loadingAction === "incremental" ? labels.runningIncrementalSync : labels.runIncrementalSync}
            </Button>
          </div>

          <div className="space-y-3">
            {syncStatus.recentRuns.length ? (
              syncStatus.recentRuns.map((run) => (
                <div key={run.id} className="rounded-2xl border border-border/70 bg-background/70 p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">
                      {labels.syncModes[run.mode]} · {labels.syncStatuses[run.status]}
                    </p>
                    <p className="text-muted-foreground">{new Date(run.startedAt).toLocaleString()}</p>
                  </div>
                  <p className="mt-2 text-muted-foreground">
                    {labels.created}: {run.recordsCreated} · {labels.updated}: {run.recordsUpdated} · {labels.failed}: {run.recordsFailed}
                  </p>
                  {run.errorMessage ? <p className="mt-2 text-danger">{run.errorMessage}</p> : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">{labels.noSyncRuns}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
