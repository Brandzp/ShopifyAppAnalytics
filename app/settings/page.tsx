import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { ShopifyConnectionManager } from "@/components/settings/shopify-connection-manager";
import { getShopifyConnectionSummary } from "@/lib/services/shopify-connection-service";
import { getSyncStatus } from "@/lib/services/shopify-sync-service";
import { getAppLocale, getDictionary } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/settings/language-switcher";
import { CreatorConnectionsManager } from "@/components/settings/creator-connections-manager";

export default async function SettingsPage() {
  const locale = await getAppLocale();
  const dictionary = getDictionary(locale);
  const chrome = await getAppChromeData();
  const [connectionSummary, syncStatus] = await Promise.all([
    getShopifyConnectionSummary(chrome.store.id),
    getSyncStatus(chrome.store.id)
  ]);

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <SectionHeading
          eyebrow={dictionary.settings.eyebrow}
          title={dictionary.settings.title}
          description={dictionary.settings.description}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <ShopifyConnectionManager
            initialConnection={connectionSummary}
            initialSyncStatus={syncStatus}
            labels={dictionary.settings.shopify}
          />
          <CreatorConnectionsManager labels={dictionary.creator} />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{dictionary.settings.languageTitle}</CardTitle>
              <CardDescription>{dictionary.settings.languageDescription}</CardDescription>
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
            <CardHeader>
              <CardTitle>{dictionary.settings.reportingTitle}</CardTitle>
              <CardDescription>{dictionary.settings.reportingDescription}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                [dictionary.settings.dateRange, chrome.controls.dateRangeLabel],
                [dictionary.settings.currency, chrome.store.currency],
                [dictionary.settings.estimatedCostMode, chrome.store.estimatedCostMode],
                [dictionary.settings.defaultCostRatio, chrome.store.defaultCostRatio ? `${(chrome.store.defaultCostRatio * 100).toFixed(1)}%` : "35.0%"],
                [dictionary.settings.compareToPreviousPeriod, dictionary.settings.enabled]
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-border/70 bg-background/70 p-4">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-2 font-semibold">{value}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{dictionary.settings.futureTitle}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm leading-6 text-muted-foreground">{dictionary.settings.oauthTodo}</p>
              <p className="text-sm leading-6 text-muted-foreground">{dictionary.settings.costTodo}</p>
              <p className="text-sm leading-6 text-muted-foreground">{dictionary.settings.notificationsTodo}</p>
            </CardContent>
          </Card>
        </div>
      </section>
    </AppShell>
  );
}

