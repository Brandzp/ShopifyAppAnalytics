import { Globe, Settings2, Wrench } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";
import { NarrativeBanner } from "@/components/dashboard-v2/narrative-banner";
import { PageHead, SectionHead } from "@/components/dashboard-v2/section-head";
import { ShopifyConnectionManager } from "@/components/settings/shopify-connection-manager";
import { LanguageSwitcher } from "@/components/settings/language-switcher";
import { CreatorConnectionsManager } from "@/components/settings/creator-connections-manager";
import { MetaAdsConnectionManager } from "@/components/settings/meta-ads-connection-manager";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getShopifyConnectionSummary } from "@/lib/services/shopify-connection-service";
import { getSyncStatus } from "@/lib/services/shopify-sync-service";
import { getMetaAdsConnectionSummary } from "@/lib/services/meta-ads-service";
import { getAppLocale, getDictionary } from "@/lib/i18n";

export default async function SettingsPage() {
  const locale = await getAppLocale();
  const dictionary = getDictionary(locale);
  const chrome = await getAppChromeData();
  const [connectionSummary, syncStatus, metaAdsConnection] = await Promise.all([
    getShopifyConnectionSummary(chrome.store.id),
    getSyncStatus(chrome.store.id),
    getMetaAdsConnectionSummary(chrome.store.id).catch(() => null)
  ]);

  const isConnected = chrome.store.connected;
  const tone = isConnected ? "up" : "neutral";
  const headline = isConnected
    ? `Shopify connected — pulling data for ${chrome.store.domain}.`
    : `Connect your Shopify store to start surfacing real data.`;

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 sm:space-y-8">
        <PageHead
          eyebrow={dictionary.settings.eyebrow}
          title={dictionary.settings.title}
          description={dictionary.settings.description}
        />

        <NarrativeBanner
          eyebrow="Setup status"
          headline={headline}
          body="The Shopify connection on the left feeds every other page. The reporting block on the right shapes how profit and comparisons are calculated."
          tone={tone}
          toneLabel={isConnected ? "Connected" : "Action needed"}
        />

        <section className="space-y-3">
          <SectionHead
            eyebrow="Step 1"
            title="Connect your data sources"
            hint="The store connection is required. Creator accounts are optional — they unlock Creator Commerce."
          />
          <div className="grid items-start gap-4 xl:grid-cols-[1.4fr_1fr]">
            <div className="space-y-4">
              <ShopifyConnectionManager
                initialConnection={connectionSummary}
                initialSyncStatus={syncStatus}
                labels={dictionary.settings.shopify}
              />
              <MetaAdsConnectionManager storeId={chrome.store.id} initialConnection={metaAdsConnection} />
              <CreatorConnectionsManager labels={dictionary.creator} />
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600">
                      <Globe className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <CardTitle className="text-base">{dictionary.settings.languageTitle}</CardTitle>
                  </div>
                  <p className="text-sm text-muted-foreground">{dictionary.settings.languageDescription}</p>
                </CardHeader>
                <CardContent>
                  <LanguageSwitcher
                    locale={locale}
                    labels={{
                      english: dictionary.settings.english,
                      hebrew: dictionary.settings.hebrew
                    }}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600">
                      <Settings2 className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <CardTitle className="text-base">{dictionary.settings.reportingTitle}</CardTitle>
                  </div>
                  <p className="text-sm text-muted-foreground">{dictionary.settings.reportingDescription}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    [dictionary.settings.dateRange, chrome.controls.dateRangeLabel],
                    [dictionary.settings.currency, chrome.store.currency],
                    [dictionary.settings.estimatedCostMode, chrome.store.estimatedCostMode],
                    [
                      dictionary.settings.defaultCostRatio,
                      chrome.store.defaultCostRatio
                        ? `${(chrome.store.defaultCostRatio * 100).toFixed(1)}%`
                        : "35.0%"
                    ],
                    [dictionary.settings.compareToPreviousPeriod, dictionary.settings.enabled]
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between rounded-xl border border-border bg-background/70 px-4 py-3"
                    >
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
                      <p className="text-sm font-semibold tabular-nums">{value}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600">
                      <Wrench className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <CardTitle className="text-base">{dictionary.settings.futureTitle}</CardTitle>
                    <HelpTip>What we'll wire up next. Honest about what's not built yet.</HelpTip>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm leading-6 text-muted-foreground">{dictionary.settings.oauthTodo}</p>
                  <p className="text-sm leading-6 text-muted-foreground">{dictionary.settings.costTodo}</p>
                  <p className="text-sm leading-6 text-muted-foreground">{dictionary.settings.notificationsTodo}</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
