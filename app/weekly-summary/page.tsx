import { ClipboardCopy, Send, Sparkles } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";
import { NarrativeBanner } from "@/components/dashboard-v2/narrative-banner";
import { PageHead, SectionHead } from "@/components/dashboard-v2/section-head";
import { InstagramCrawlEvidencePanel } from "@/components/shared/instagram-crawl-evidence-panel";
import { MetaAdsIntelligencePanel } from "@/components/shared/meta-ads-intelligence-panel";
import { ExportMetaAdsPdfButton } from "@/components/weekly-summary/export-meta-ads-pdf-button";
import type {
  MarketingPlannerDirection,
  MarketingPlannerInfluencerIntelligence
} from "@/lib/domain/marketing-planner-types";
import { describeAbsoluteRange, getReportingDateRangeSelection } from "@/lib/server/reporting-date-range";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { buildMarketingPlannerInfluencerIntelligence } from "@/lib/services/marketing-planner-influencer-service";
import { buildMarketingPlannerMetaAds } from "@/lib/services/meta-ads-service";
import { getLatestSummary } from "@/lib/services/summary-service";
import {
  buildWeeklyAgentInsights,
  type WeeklyAgentInsightsPayload
} from "@/lib/services/weekly-summary-insights-service";
import { getAppLocale, getDictionary } from "@/lib/i18n";
import { formatCurrency, formatNumber } from "@/lib/utils";

function getDirectionClasses(direction: MarketingPlannerDirection) {
  return direction === "rtl" ? "text-right" : "text-left";
}

function InfluencerWeeklyEvidence({
  influencer,
  direction,
  currency
}: {
  influencer: MarketingPlannerInfluencerIntelligence | null;
  direction: MarketingPlannerDirection;
  currency: string;
}) {
  return (
    <Card dir={direction} className={getDirectionClasses(direction)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Influencer performance evidence</CardTitle>
        <p className="text-sm text-muted-foreground">
          Affiliate sales, clicks, and creator content filtered to the current weekly-summary date window.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {influencer ? (
          <>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">Period</p>
                <p className="mt-1 font-semibold">{influencer.periodLabel}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">Active creators</p>
                <p className="mt-1 font-semibold">{formatNumber(influencer.activeCreators)} / {formatNumber(influencer.totalCreators)}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">Sales</p>
                <p className="mt-1 font-semibold">{formatCurrency(influencer.totalSales, currency)}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">Orders</p>
                <p className="mt-1 font-semibold">{formatNumber(influencer.totalOrders)}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">Clicks</p>
                <p className="mt-1 font-semibold">{formatNumber(influencer.totalClicks)}</p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm font-semibold text-foreground">Creators to scale</p>
                {influencer.topCreators.length ? (
                  <div className="mt-3 space-y-3">
                    {influencer.topCreators.slice(0, 4).map((creator) => (
                      <div key={`weekly-scale-${creator.id}`} className="rounded-xl border border-border/60 bg-background p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{creator.name}</p>
                          <Badge>{creator.role}</Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {formatCurrency(creator.sales, currency)} - {formatNumber(creator.orders)} orders - code {creator.couponCode ?? creator.affiliateCode}
                        </p>
                        <p className="mt-2 leading-6 text-muted-foreground">{creator.reason}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">No creator has attributed sales in this date window yet.</p>
                )}
              </div>

              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm font-semibold text-foreground">Creators to check / pause</p>
                {influencer.watchCreators.length ? (
                  <div className="mt-3 space-y-3">
                    {influencer.watchCreators.slice(0, 4).map((creator) => (
                      <div key={`weekly-watch-${creator.id}`} className="rounded-xl border border-border/60 bg-background p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{creator.name}</p>
                          <Badge className="border-amber-200 bg-amber-50 text-amber-700">{creator.role}</Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {formatCurrency(creator.sales, currency)} - {formatNumber(creator.orders)} orders - {formatNumber(creator.clicks)} clicks
                        </p>
                        <p className="mt-2 leading-6 text-muted-foreground">{creator.reason}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">No creator needs a warning flag in this date window.</p>
                )}
              </div>
            </div>

            {influencer.suggestedActions.length ? (
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm font-semibold text-foreground">Actions to carry into planning</p>
                <div className="mt-3 grid gap-3 xl:grid-cols-2">
                  {influencer.suggestedActions.map((action, index) => (
                    <div key={`weekly-influencer-action-${index}`} className="rounded-xl border border-border/60 bg-background p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge>{action.impact}</Badge>
                        <p className="font-medium">{action.action}</p>
                      </div>
                      <p className="mt-2 leading-6 text-muted-foreground">{action.why}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        <strong className="text-foreground">Where:</strong> {action.ganttPlacement}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {influencer.dataWarnings.length ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <p className="font-semibold">Influencer data warnings</p>
                <ul className="mt-2 space-y-2 leading-6">
                  {influencer.dataWarnings.map((warning, index) => (
                    <li key={`weekly-influencer-warning-${index}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Influencer data is not available for this store yet. Add affiliates, Instagram handles, and run the crawler/sync to populate this proof layer.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function WeeklyAgentInsightsPanel({
  payload,
  direction
}: {
  payload: WeeklyAgentInsightsPayload;
  direction: MarketingPlannerDirection;
}) {
  const channelLabel = {
    meta_ads: "Meta Ads",
    instagram: "Instagram",
    history: "History"
  } satisfies Record<string, string>;

  const severityClass = {
    info: "border-sky-200 bg-sky-50 text-sky-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    critical: "border-red-200 bg-red-50 text-red-800"
  } satisfies Record<string, string>;

  return (
    <section className="space-y-3">
      <SectionHead
        eyebrow="Agent thinking"
        title="What the agent thinks about Meta Ads and Instagram"
        hint={`Generated from this date window plus prior Growth Agent memory: ${payload.dateRangeLabel}.`}
      />
      <Card dir={direction} className={getDirectionClasses(direction)}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Weekly growth insights</CardTitle>
          <p className="text-sm text-muted-foreground">
            These are not just raw metrics. The agent compares current Meta/Instagram signals with historical findings and stores this week's conclusions for the next readout.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 xl:grid-cols-2">
            {payload.insights.map((insight) => (
              <div key={insight.id} className={`rounded-2xl border p-4 text-sm ${severityClass[insight.severity]}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{insight.title}</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge className="bg-white/70 text-current">{channelLabel[insight.channel]}</Badge>
                    <Badge className="bg-white/70 text-current">{Math.round(insight.confidenceScore * 100)}% confidence</Badge>
                  </div>
                </div>
                <p className="mt-3 leading-6">{insight.whatAgentThinks}</p>
                <div className="mt-3 rounded-xl border border-white/70 bg-white/60 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider opacity-80">Evidence</p>
                  <p className="mt-1 leading-6">{insight.evidence}</p>
                </div>
                <div className="mt-3 rounded-xl border border-white/70 bg-white/60 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider opacity-80">Recommended action</p>
                  <p className="mt-1 leading-6">{insight.recommendation}</p>
                </div>
                {insight.learnedFromHistory ? (
                  <p className="mt-3 text-xs font-medium opacity-85">
                    Learned from history: {insight.learnedFromHistory}
                  </p>
                ) : null}
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-border/70 bg-background/70 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-foreground">History used by the agent</p>
              <Badge>{payload.memorySaved ? "Saved to memory" : "Memory save skipped"}</Badge>
            </div>
            <ul className="mt-2 space-y-1 leading-6 text-muted-foreground">
              {payload.historySignals.map((signal, index) => (
                <li key={`history-signal-${index}`}>{signal}</li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

export default async function WeeklySummaryPage() {
  const locale = await getAppLocale();
  const dictionary = getDictionary(locale);
  const [summary, chrome, range] = await Promise.all([
    getLatestSummary(),
    getAppChromeData(),
    getReportingDateRangeSelection(locale)
  ]);
  const direction: MarketingPlannerDirection = locale === "he" ? "rtl" : "ltr";
  const dateRangeLabel = describeAbsoluteRange(range.start, range.end, locale);
  const storeScope = {
    storeId: chrome.store.id,
    storeName: chrome.store.name,
    storeDomain: chrome.store.domain,
    connected: Boolean(chrome.store.id)
  };
  const [influencerIntelligence, metaAds] = await Promise.all([
    buildMarketingPlannerInfluencerIntelligence(storeScope, range.end, {
      start: range.start,
      end: range.end,
      periodLabel: dateRangeLabel
    }).catch(() => null),
    buildMarketingPlannerMetaAds(storeScope, {
      start: range.start,
      end: range.end
    }).catch(() => null)
  ]);
  const weeklyAgentInsights = await buildWeeklyAgentInsights({
    storeScope,
    metaAds,
    influencer: influencerIntelligence,
    dateRangeLabel,
    rangeKey: `${range.startInput}-${range.endInput}`,
    currency: chrome.store.currency
  });

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 sm:space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <PageHead
            eyebrow={dictionary.weeklySummary.eyebrow}
            title={dictionary.weeklySummary.title}
            description={dictionary.weeklySummary.description}
          />
          <div className="flex flex-wrap gap-2">
            {/* Regenerate intentionally omitted until the summary-generation
                pipeline is wired — having it here as a no-op was misleading. */}
            <Button variant="secondary" className="inline-flex items-center gap-1.5">
              <ClipboardCopy className="h-3.5 w-3.5" /> {dictionary.weeklySummary.copy}
            </Button>
            <ExportMetaAdsPdfButton
              from={range.startInput}
              to={range.endInput}
              storeId={chrome.store.id}
              labelDownload={locale === "he" ? "ייצוא PDF" : "Export PDF"}
              labelGenerating={locale === "he" ? "מייצר…" : "Generating…"}
            />
            <Button className="inline-flex items-center gap-1.5">
              <Send className="h-3.5 w-3.5" /> {dictionary.weeklySummary.share}
            </Button>
          </div>
        </div>

        <NarrativeBanner
          eyebrow="Weekly readout"
          headline={summary.headline}
          body={`Generated ${new Date(summary.generatedAt).toLocaleString()} — share this with your team or copy it into Slack.`}
          tone="up"
          toneLabel="Ready to share"
        />

        <WeeklyAgentInsightsPanel payload={weeklyAgentInsights} direction={direction} />

        <section className="space-y-3">
          <SectionHead
            eyebrow="Live data proof"
            title="Instagram, influencers, and Meta Ads"
            hint={`These evidence blocks read stored data only inside ${dateRangeLabel}, so the weekly summary matches the selected dates.`}
          />
          {influencerIntelligence?.instagramCrawl ? (
            <InstagramCrawlEvidencePanel
              instagram={influencerIntelligence.instagramCrawl}
              direction={direction}
              dateRangeLabel={dateRangeLabel}
              description="Static proof layer for the brand page and affiliate Instagram handles. Recent posts below follow the weekly-summary date range."
            />
          ) : (
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">
                Instagram crawl evidence is not available yet for this store. Add affiliate Instagram handles and run the public crawler to populate this section.
              </CardContent>
            </Card>
          )}
          <InfluencerWeeklyEvidence
            influencer={influencerIntelligence}
            direction={direction}
            currency={chrome.store.currency}
          />
          <MetaAdsIntelligencePanel
            metaAds={metaAds}
            direction={direction}
            dateRangeLabel={dateRangeLabel}
          />
        </section>

        <section className="space-y-3">
          <SectionHead
            eyebrow="Step 1"
            title="The week's narrative"
            hint="Each block is a self-contained section you can copy into your weekly stand-up."
          />
          <div className="grid gap-4 lg:grid-cols-2">
            {summary.sections.map((section) => (
              <Card key={section.title}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600">
                      <Sparkles className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <CardTitle className="text-base">{section.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {section.items.map((item) => (
                    <p key={item} className="text-sm leading-7 text-muted-foreground">
                      • {item}
                    </p>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <SectionHead
            eyebrow="Roadmap"
            title="What's next for weekly summaries"
            hint="What this surface will do once these dependencies are wired up. Nothing here is built yet — it's transparency about the plan."
          />
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-base">{dictionary.weeklySummary.generationTitle}</CardTitle>
                  <HelpTip>AI-generated summary using real reporting deltas, profit context, and retention insights.</HelpTip>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-muted-foreground">{dictionary.weeklySummary.generationTodo}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-base">{dictionary.weeklySummary.deliveryTitle}</CardTitle>
                  <HelpTip>Email, WhatsApp, and Slack adapters for scheduled founder digests.</HelpTip>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-muted-foreground">{dictionary.weeklySummary.deliveryTodo}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-base">{dictionary.weeklySummary.dependenciesTitle}</CardTitle>
                  <HelpTip>Shopify OAuth and Admin API ingestion so summaries operate on fresh store data.</HelpTip>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-muted-foreground">{dictionary.weeklySummary.dependenciesTodo}</p>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
