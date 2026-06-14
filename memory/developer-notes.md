# Developer Notes — ShopifyAppAnalytics

## Codebase layout
- No `src/` directory. The TS path alias `@/` maps to the project ROOT.
  e.g. `@/lib/server/shopify-sync-cron` → `lib/server/shopify-sync-cron.ts`.
- `instrumentation.ts` (project root) runs Next.js `register()` once per server
  process. Guarded with `if (process.env.NEXT_RUNTIME !== "nodejs") return;`.
  Note: it executes lazily after the first compile/request in `next dev`, not at
  the instant the banner prints "Ready".

## Background crons
- Three in-process crons started from instrumentation: shopify-sync (1h),
  creative-job (5s), weekly-report (5min poll, fires in a Sun/1st 09:00
  Asia/Jerusalem window).
- They intentionally SELF-FETCH their own `/api/...` routes rather than calling
  services in-process — importing the services pulls Node-only modules
  (crypto, Prisma) into Next's instrumentation compile and breaks the build.
  Keep the self-fetch boundary unless you also restructure the route logic.
- Shared helpers live in `lib/server/cron-util.ts`:
  - `isCronEnabled(prefix)`: precedence `<PREFIX>_CRON_DISABLED=1` (hard off) >
    `ENABLE_<PREFIX>_CRON` (explicit) > NODE_ENV==="production" (default).
    So crons are OFF in dev unless `ENABLE_*_CRON=1`, ON in prod.
  - `fetchWithTimeout(url, init, ms)`: AbortController-based; throws
    "request timed out after Nms" on abort.
  - `computeBackoffMs(failures, base, max)`: exponential, capped (default 15m).
- Each cron tracks `failures` + `backoffUntil` to skip ticks while backing off,
  preventing tight-loop/crash on repeated `fetch failed` / UND_ERR_HEADERS_TIMEOUT.

## Gotchas
- `npx tsc --noEmit` currently has PRE-EXISTING errors unrelated to crons:
  `lib/data/mock-store.ts`, `lib/services/affiliate-conversion-import-service.ts`,
  `lib/services/weekly-report-service.ts`. Don't attribute these to your change.
- A page render (`GET /`) logs a pre-existing Prisma error:
  `prisma.orderLineItem.findMany ... Argument 'equals' is missing` — unrelated
  to crons. **RESOLVED / STALE as of 2026-06-14 (SA-CRIT-03)** — see the
  SA-CRIT-03 entry below; this no longer reproduces.
- `.env.example` was sanitized of a leaked secret. Never reintroduce real values;
  keep all example values empty/placeholder.
- Do NOT commit `tsconfig.tsbuildinfo` (build artifact, intentional holdback).
- Background `next dev` launched via `(npm run dev &)` inside the Bash tool gets
  killed when the shell exits (cwd resets per call). Use the tool's
  `run_in_background: true` instead, and pass `PORT=NNNN` to avoid port clashes.

## `next build` on this machine (2026-06-07)
- The build is a TWO-PHASE failure surface: phase 1 `Compiled successfully`
  (~40-50s), phase 2 `Linting and checking validity of types`, phase 3
  `Collecting page data`. A "Compiled successfully" line does NOT mean a green
  build — type errors and page-data crashes come AFTER it.
- MEMORY: page-data collection fans out worker child processes
  (`jest-worker/processChild.js`). On this 16 GB box with Chrome+VSCode open
  (~3-4 GB free) those workers get OOM-killed during "Collecting page data" —
  the log just STOPS after that line with NO error and NO `.next/BUILD_ID`.
  Fix committed: `next.config.ts` → `experimental: { cpus: 1, workerThreads:
  false }`. Serial collection is slower but does not OOM. Keep it.
- FILE LOCKING: a running `next dev` server (and crashed/orphaned `next build`
  workers) hold handles on `.next/`, so `rm -rf .next` fails with "Directory
  not empty" and the next build runs against a corrupt `.next` → flaky errors
  like `ENOENT pages-manifest.json` or `PageNotFoundError: Cannot find module
  for page: /<route>`. These are NOT code bugs. Before a clean build: kill
  ShopifyAppAnalytics-scoped node procs (filter Win32_Process CommandLine for
  '*ShopifyAppAnalytics*'), then remove `.next` via PowerShell Remove-Item.
- MULTI-AGENT: more than one agent builds in this dir at once. To avoid
  fighting over `.next`, build into an isolated dir:
  `NEXT_DIST_DIR=.next_devcheck npx next build` (config supports
  `distDir: process.env.NEXT_DIST_DIR`). Verify BUILD_ID at
  `<distDir>/BUILD_ID`. Note another agent's build can DELETE your `.next`
  mid-run, so a default-`.next` BUILD_ID is not durable evidence here.
- Real build blocker fixed (commit d9aae67): `weekly-report-service.ts`
  `WeeklyReportBundle.instagram.affiliates[].status` was `string`; consumer
  `generateInstagramInsights` needs the `InstagramAffiliateSummary["status"]`
  union. Re-use that union type for the bundle field.

## Project scope (see docs/SCOPE.md)
- Primary purpose = founder-facing Shopify analytics/reporting (Overview,
  Profit, Retention, Weekly Summary, Alerts, Settings) + Shopify ingestion.
  Those + their lib/services are **core**.
- Creative AI, affiliate-portal, growth-agent, marketing-planner, meta-ads/
  instagram are real but **experimental** (built, not headline value).
- Primary nav lives in `components/layout/sidebar.tsx` (getNavigation()).
  `app/creator-flow` has ZERO href/nav refs anywhere — orphaned page; pairs
  with `creator-analytics-service` but not linked. Labeled experimental w/
  uncertainty in SCOPE.md.
- `app/print/*` = printable/PDF export targets (weekly/offline export buttons,
  pdf-renderer.ts), not a sidebar feature.
- Root stray files: creative-new.html, edit.html, tmp-test-file.txt,
  dev-server.log exist (deprecated). build_out.log does NOT exist.

## Project scope (2026-06-07)
- `docs/SCOPE.md` is the agreed scope map. **core** = README analytics path
  (Overview/`page.tsx`, profit, retention, weekly-summary, sales-summary,
  alerts, settings + shopify ingestion/sync). **experimental** = creative
  (packshot/AI), creator-flow, affiliate-portal, growth-agent,
  marketing-planner, product-follow-ups, print, and meta-ads (API-only).
- `app/creator-flow` has ZERO nav/href references anywhere in app/ or
  components/ (not in `components/layout/sidebar.tsx`) — likely orphaned.
- KNOWN GAP: `AttributionSession` table is EMPTY (0 rows). Conversion/funnel
  metrics are unavailable; only order-based metrics (from synced Shopify
  orders) work. Affiliate session-conversion figures read zero until session
  ingestion is wired.
- SCOPE.md is edited by multiple agents concurrently — use targeted `Edit` on
  unique anchors and `git add docs/SCOPE.md` (never `git add -A`).

## `next dev` RELAUNCHER (2026-06-07)
- The `next dev` server that keeps stealing `.next` mid-build is RESPAWNED by a
  detached `cmd.exe /c npm run dev > %TEMP%\dev-server.log 2>&1` launcher. Just
  killing the `next dev`/`start-server` node procs is NOT enough — npm's parent
  forks a fresh one within seconds. To get a clean default-`.next` build, also
  kill that launcher cmd.exe (walk the parent chain of the dev node proc with
  Win32_Process ParentProcessId). After killing the launcher, a plain
  `npm run build` into `.next` completes and produces a durable `.next/BUILD_ID`.
- Confirmed green on 2026-06-07: `prisma generate` + `next build` both succeed;
  71/71 static pages generated, build traces collected, `.next/BUILD_ID` written.
  The `/affiliate-portal/affiliates/[affiliateId]` route (only dynamic segment
  under app/) builds fine — earlier PageNotFoundError on it was purely the
  dev-server race, not a code defect.

## Prisma migration baseline (2026-06-07)
- The project previously had NO `prisma/migrations` folder (only `schema.prisma`
  + `seed.ts`); the live DB `shopify_profit_ops` was schema-pushed, not migrated.
- Established a baseline NON-destructively (DB must not be reset):
  1. `mkdir prisma/migrations/0_baseline`
  2. `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_baseline/migration.sql`
  3. `npx prisma migrate resolve --applied 0_baseline`  (records it in
     `_prisma_migrations` as already-applied — touches no table data)
- After this, `npx prisma migrate status` reports "Database schema is up to date!"
  with 1 migration found. Future schema changes should use `migrate dev`/`deploy`.
- Baseline SQL = 1368 lines, 42 tables, committed locally (no push).

## P0 hardening pass (2026-06-14)
- `npx tsc --noEmit` is now FULLY CLEAN (exit 0, zero output). The pre-existing
  errors noted under "Gotchas" (mock-store.ts, affiliate-conversion-import-service.ts,
  weekly-report-service.ts) have since been resolved — that Gotcha note is stale.
- `lib/auth/supabase-server.ts` ALREADY EXISTS and exports the three factories
  incl. `createMiddlewareSupabaseClient`. (A task claimed it was missing; it isn't.)
  It resolves SUPABASE_URL || NEXT_PUBLIC_SUPABASE_URL (and same for anon key).
- `lib/prisma.ts` now imports `PrismaClient` strictly (no more try/catch null
  fallback). Safe because `node_modules/.prisma/client` is generated and
  `postinstall: prisma generate` keeps it generated after `npm install`.
  No caller relied on the old null return (grepped: no `if (!prisma)` / `prisma?.`).
- ENCODING TRAP: the two corrupted-Hebrew files could NOT be fixed with Edit —
  the on-disk mojibake bytes don't reconcile with the Edit match layer. Fix by
  full-file Write (clean UTF-8). alert-service.ts was recoverable mojibake
  (UTF-8-as-Latin1); affiliate-link-builder.tsx was lossy `?????` (reconstructed
  Hebrew from adjacent English context).
- CRON LOCK (SA-CRIT-07): middleware.ts `requireCronSecret()` 401s `/api/cron/*`
  when `CRON_SECRET` is set and `x-cron-secret` header is absent/wrong; skips when
  unset (dev). CRITICAL: the in-process self-fetch crons (data-refresh, shopify-sync,
  outcome-measurement) ping `/api/cron/*` and would 401 themselves in prod — they
  now attach the header via `cronSecretHeaders()` in lib/server/cron-util.ts.
  weekly-report cron pings `/api/weekly-summary/cron/run` (NOT under /api/cron/),
  so it's unaffected.
- Boot env validation: `lib/server/startup-check.ts` (`assertRequiredEnv()`) is
  called from `instrumentation.ts register()` inside the Node-runtime guard;
  fails fast at boot if Supabase URL/key or SHOPIFY_CREDENTIALS_ENCRYPTION_KEY missing.
- tsx behavioral smoke tests: `import('./x.ts')` via `npx tsx -e` does NOT resolve
  named exports reliably (returns "is not a function"). Use a temp `.ts` harness
  file run with `npx tsx file.ts` instead, then delete it. NextRequest from
  next/server constructs fine under tsx for middleware tests.
- tsx + ESM namespace exports are READ-ONLY getters: you CANNOT monkeypatch a
  collaborator by assigning `(import * as svc).fn = stub` — it throws "Cannot set
  property of #<Object> which has only a getter". To smoke-test a render/pure
  function in isolation, EXPORT the pure builder and call it directly with a fake
  input, rather than trying to stub its DB/network deps.

## Email / notifications (SA-HIGH-04, 2026-06-14)
- There are THREE Resend layers, do not duplicate them:
  1. `lib/email/email-client.ts` → `sendTransactionalEmail({to,subject,html})`:
     lazy singleton, SOFT-FAIL (logs warning + returns false, never throws) when
     RESEND_API_KEY is unset. Use this for any new transactional send.
  2. `lib/server/weekly-report-mailer.ts` → `sendWeeklyReportEmail(...)`: the
     PDF-attached full report (Hebrew-only body). Separate from the digest.
  3. `lib/services/notification-service.ts` → `sendEmailDigest(summaryId)`: NEW.
     Short bilingual (he→RTL+bilingual, en→LTR English-only) inbox teaser built
     from a persisted WeeklyReport. Loads bundle via `getWeeklyReport(id)`,
     resolves recipients from `WeeklyReportRecipient` (active rows by storeId),
     sends via `sendTransactionalEmail`. Slack/WhatsApp remain stubs.
- The app has NO single top-level "revenue/orders". Weekly metrics live nested:
  `bundle.metaAds.totals.{spend,purchases}` (paid funnel) + brand kpis
  `brands[0].kpis.purchaseRoas`, and `bundle.instagram.{affiliates[].attributed*,
  topCreators}` (organic funnel). The digest surfaces BOTH; don't invent a
  combined revenue figure.
- Locale source for emails = `bundle.locale` ("he" | "en"), set when the bundle
  is built (org/store default). Org/User both have a `locale` column ("he" default).
- Optional-but-feature-degrading env vars warn (don't throw) at boot via
  `warnOptionalEnv()` in `lib/server/startup-check.ts`, wired into instrumentation
  AFTER `assertRequiredEnv()`. RESEND_API_KEY / REPORT_FROM_EMAIL live there — the
  weekly-report cron must run without them, only its email delivery no-ops.
- `WeeklyReportRecipient` (active=true, by storeId) is the recipient list for both
  the PDF mailer and the digest. `WeeklyReport.id` is the `summaryId`.

## Nav / sidebar wiring (2026-06-14, SA-HIGH-06)
- The sidebar nav array lives in `components/layout/sidebar.tsx` -> `getNavigation()`.
  Each item is `{ href, label, icon }`. Labels are either `labels.nav.X` (i18n
  dictionary key) or an inline `locale === "he" ? "..." : "..."` ternary. Icons are
  lucide-react components imported at the top of the file.
- `app/creator-flow/page.tsx` was a fully-built feature (uses `creator-analytics-service`,
  `dictionary.creator.*`, charts, data table) but had NO nav entry — unreachable from UI.
  The i18n dictionary already had `nav.creatorFlow` ("Creator Commerce" / "יוצרים ומכירות")
  provisioned in BOTH locales, so the page was always intended to be navigable; only the
  sidebar item was missing. Added `{ href: "/creator-flow", label: labels.nav.creatorFlow,
  icon: Camera }` next to the affiliate/creative experimental items.
- Pattern lesson: before adding a hardcoded nav label, grep `lib/i18n.ts` for an existing
  `nav.*` key — several were pre-provisioned for pages that aren't yet linked.

## Multi-tenant store resolution (SA-HIGH-08, 2026-06-14)
- `resolveOrCreateBaseStore()` (lib/services/creator-admin-service.ts) returns the
  most-recently-updated CONNECTED store (fallback: most-recent store). It is the
  "current/base store" resolver — it does NOT read cookies/session, but in a
  multi-tenant context it always collapses to ONE store. Any service that calls it
  is single-tenant by construction; a multi-tenant caller (the refresh-all cron
  fan-out) must pass an explicit `storeId` instead.
- Instagram sync now has both shapes: `syncInstagramPosts(storeId?)` (optional arg,
  defaults to base-store for the manual single-tenant sync route) and the explicit
  `syncInstagramPostsForStore(storeId)` used by the cron loop. `InstagramConnection.storeId`
  is `@unique`, so `findUnique({ where: { storeId } })` is the right per-store lookup and
  `creatorPost` upserts key on the composite `storeId_externalPostId`.
- Pattern: when you see `resolveOrCreateBaseStore()` inside a service that a per-store
  cron iterates, that's the multi-tenant "only one store syncs" smell — thread `storeId`
  through rather than relying on base-store resolution.

## SA-CRIT-03 — orderLineItem "Argument 'equals' is missing" is STALE (2026-06-14)
- The `GET /` Prisma error noted under Gotchas (`prisma.orderLineItem.findMany ...
  Argument 'equals' is missing`) NO LONGER REPRODUCES. Investigated and behaviorally
  verified, not just typechecked.
- Static audit: ALL 13 `orderLineItem.{findMany,aggregate,groupBy}` call sites
  (grep `orderLineItem\.(findMany|aggregate|groupBy)`) use well-formed Prisma
  filter operators (`gte/lte/lt/gt/not/in`, scalar shorthand, nested relation
  `order: {...}`). There is NO `{ equals: undefined }`, no bare empty filter
  object, and no `mode:"insensitive"` without an operator on OrderLineItem. The
  ONLY `equals` in the whole repo is `prisma-analytics-repository.ts:714`
  (`status: { equals: "ACTIVE", mode: "insensitive" }` on `db.product`, valid).
- Behavioral verification against the LIVE DB (store incenseparfums, real data):
  ran all 7 orderLineItem query shapes the landing page triggers, AND invoked the
  4 real exported services it calls (`getShopifySalesSummaryForWindow`,
  `buildContributionMargin`, `buildStockoutImminentReport`,
  `buildRestockHeroAlerts`) end-to-end. All returned valid payloads; zero
  "Argument 'equals'" error. (Temp tsx harness, run then deleted.)
- Note: commit 5b5c449 ("postinstall prisma generate, strict client typing")
  touched ONLY `lib/prisma.ts` + `package.json` — it did NOT edit any query, so
  it is not what "fixed" this. The likeliest original cause was the OLD null-client
  fallback in lib/prisma.ts (a `db` that wasn't a real PrismaClient → malformed
  query) or a since-refactored query; either way the current tree is clean.
- ACTION for future readers: do not chase this error; if it recurs, it will be a
  NEW data/code condition — re-run the harness pattern above (resolve a connected
  store, call the 4 services) to localize it.

## Stripe billing layer (SA-HIGH-09, 2026-06-14)
- Master switch: `lib/billing/billing-flag.ts` `billingEnabled()` reads
  `BILLING_ENABLED` (truthy 1/true/yes/on, default OFF). While OFF the whole
  Stripe surface is inert: `getSubscriptionStatus()` returns plan="agency"
  status="paid" for every org, checkout/portal 503, and the webhook returns
  200 `{billingDisabled:true}` WITHOUT verifying the signature. So no Stripe
  config is needed to run the app; flip the flag LAST (see docs/BILLING_CHECKLIST.md).
- NOTE on a comment drift: billing-flag.ts header says OFF returns "paid"
  plan — the code actually returns plan="agency" (highest tier so plan-limit
  checks pass). plan-limits.ts comment is the correct one. Behavior is fine.
- Webhook `app/api/billing/webhook/route.ts` handles: checkout.session.completed,
  customer.subscription.{created,updated,deleted}, invoice.payment_failed. It
  matches the org by `stripeCustomerId` via `updateMany` — that id is set
  EARLIER by the checkout route (`stripe.customers.create` → `Organization.update`)
  before any charge, so by webhook time the org already carries it. A Stripe
  customer with no matching org → updateMany updates 0 rows silently (by design).
- `priceIdToPlan()` reverse-maps an incoming Stripe price id → plan by scanning
  12 env vars `STRIPE_PRICE_<STARTER|GROWTH|AGENCY>_<ILS|USD>_<MONTHLY|ANNUAL>`.
  Same vars are read by `plans.ts` envPrice(). No price ids in code.
- SA-HIGH-09 fix: `customer.subscription.created` was previously unhandled
  (fell to default no-op). Merged into the `customer.subscription.updated` case
  (identical plan-sync). `created` sends NO email (avoids duplicate with the
  checkout-completed started-email); only checkout.session.completed and
  ...deleted send owner emails + audit events (billing.subscription_started /
  _canceled). Signature verify uses raw `request.text()` + constructEvent — correct.
- Route auth: `/api/billing/webhook` is in middleware.ts PUBLIC_PREFIXES and is
  NOT under `/api/cron/*`, so it is NOT gated by CRON_SECRET — authenticated
  ONLY by the Stripe signature. Don't expect CRON_SECRET to protect it.
- `.env.example` does NOT document any STRIPE_*/BILLING_ENABLED vars yet — the
  full env list lives in docs/BILLING_CHECKLIST.md §2. Add placeholders there
  if you touch it, never real keys (file was previously sanitized of a leak).

## LLM summary pipeline (SA-HIGH-05, 2026-06-14)
- The OpenAI insights pattern in this repo is CONSISTENT across services — copy it,
  don't reinvent: gpt-4o-mini via raw `fetch` to
  `https://api.openai.com/v1/chat/completions`, `response_format:{type:"json_object"}`,
  system prompt with the LANGUAGE DIRECTIVE AT THE TOP (the model mirrors the English
  data dump and ignores a trailing Hebrew hint otherwise), defensive JSON parse, and a
  deterministic fallback when `OPENAI_API_KEY` is missing or the call fails (never throw).
  Reference impls: `meta-ads-report-insights-service.ts`, `instagram-report-insights-service.ts`.
- `regenerateSummary()` (lib/services/summary-service.ts) no longer just delegates to the
  template builder. It now: builds the deterministic `Summary` (sections back the print/UI
  layout — keep them), repairs the headline from Order-table deltas, then calls
  `generateSummaryHeadline()` (lib/services/summary-insights-service.ts) to REPLACE only the
  `headline` with a 3-5 sentence founder paragraph. `generateSummaryHeadline` returns
  `string | null` — null means "no key / call failed", caller keeps the template headline.
- Revenue/profit deltas for the prompt prefer `computeHeadlineDeltasFromOrders()` (raw Order
  aggregate, most reliable) over `overview.comparisonMetrics` (DailyMetric pipeline, often
  empty in dev). Same source-of-truth ordering the headline-repair path already uses.
- `OPENAI_API_KEY` is in `.env` (project-scoped `sk-proj-...`), but `npx tsx` does NOT
  auto-load `.env` — a bare tsx harness sees no key and hits the fallback. To behaviorally
  test the LIVE LLM path from a tsx harness, inject the key into `$env:OPENAI_API_KEY` for
  that one run (read it out of `.env`, never echo/commit the value). Verified live: HE+EN
  both produce correct locale-specific 3-4 sentence summaries citing the real numbers.

## Playwright on Render + Instagram crawler graceful fallback (SA-FIX2, 2026-06-14)
- TWO Playwright consumers in this repo: `lib/server/pdf-renderer.ts` (PDF export)
  and `lib/services/instagram-public-crawler-service.ts` (IG public crawler). Both
  drive the SAME Chromium binary installed by the render.yaml buildCommand
  (`npx playwright install --with-deps chromium chromium-headless-shell`).
- The IG crawler launches with `channel: "chromium"` (full binary, not the new
  chromium-headless-shell) — note both are installed in the buildCommand.
- render.yaml now sets `PLAYWRIGHT_BROWSERS_PATH=/opt/render/.cache/ms-playwright`
  (value:, not sync:false — it's a fixed non-secret constant). This pins the
  build-time install dir AND the runtime lookup dir to the same path. Symptom of
  the missing pin: build installs chromium but runtime throws "Executable doesn't
  exist at /opt/render/.cache/ms-playwright/chromium-1223/...". Requires a Render
  REDEPLOY to take effect (env + buildCommand changes only apply on next build).
- `launchCrawlerBrowser()` now returns `Browser | null` and SKIPS GRACEFULLY (logs
  `[instagram-crawler] Chromium not available — skipping Instagram sync`, returns
  null) when Playwright can't import OR the binary is missing (regex on the launch
  error). Other launch errors still throw AppError. `crawlPublicInstagramProfiles`
  returns a valid EMPTY result + a "skipped" failed SyncRun when browser is null.
- IMPORTANT: the `refresh-all` cron does NOT use the Playwright crawler — it calls
  `syncInstagramPostsForStore` (instagram-service.ts, API-based, no browser). The
  Playwright crawler is only called from: app/api/reporting/refresh (Promise.allSettled),
  marketing-planner-readiness-service.ts:323 (.catch), and the manual endpoint
  app/api/creator/instagram/public-crawl (try/catch). All already isolate failures.

## Hydration / SSR date rendering (SA-BUG-001, 2026-06-14)
- React #418 ("server HTML didn't match client") on the dashboard (/) was caused
  by `components/command-center/command-center-alert-card.tsx` (a "use client"
  component) rendering `new Date(alert.createdAt).toLocaleString(..., {hour, minute})`.
  toLocaleString formats in the server's UTC zone during SSR and the browser's
  LOCAL zone on hydration → the hour:minute string diverges → #418. Fix: added
  `suppressHydrationWarning` to that one `<p>` only (commit b6e8fa4). The client
  (local-time) value is the intended display, so suppress > defer-to-useEffect here.
- RULE OF THUMB for this repo: a server component (no "use client", incl. async
  pages like app/page.tsx and Topbar) renders dates ONCE on the server — no
  hydration mismatch, no guard needed. The #418 risk lives ONLY in "use client"
  components that render TIME-OF-DAY (hour/minute/second) or relative time.
  Date-only renders built from an ISO `YYYY-MM-DD` string + {month,day,year} are
  TZ-stable and safe (see reporting-picker.tsx formatDate). Audit only client
  components when chasing a date-mismatch hydration error.
- Other client components rendering toLocaleString with time-of-day that are NOT
  on the dashboard tree but would hit the same #418 if surfaced SSR'd: growth-agent/
  findings-list, connections-panel, amazon-supplier-order-manager; settings/
  shopify-connection-manager, meta-ads-connection-manager; creative/creative-project-detail.
  Apply the same suppressHydrationWarning fix if #418 is reported on those pages.

## Google Search Console data source (DATA-01, 2026-06-14)
- GSC is wired as a GENERIC connector, not a bespoke one: PlatformConnection row
  with `platform = "googleSearchConsole"`. The OAuth refresh token is stored
  ENCRYPTED in `PlatformConnection.config.refreshTokenEnc` (JSON column), via the
  same `encryptSecret`/`decryptSecret` AES-256-GCM helpers Shopify uses
  (lib/security/encryption.ts, keyed off SHOPIFY_CREDENTIALS_ENCRYPTION_KEY).
  We persist ONLY the refresh token; access tokens are short-lived and re-minted
  by the OAuth2 client on each sync.
- Service: `lib/services/gsc-service.ts`. Exports getGscOAuthUrl(storeId),
  handleGscOAuthCallback(code, storeId), syncGscData(storeId, siteUrl), plus
  decodeGscOAuthState (used by the callback route). The OAuth `state` param is
  base64url(JSON({storeId})) — that's how the callback recovers which store to
  attach to (there is no server-side session store for the OAuth nonce here).
- googleapis TYPE TRAP: there are TWO copies of `google-auth-library` in the tree
  (top-level 10.7.0 + a nested copy under googleapis-common). Importing
  `OAuth2Client`/`Credentials` straight from `google-auth-library` makes tsc fail
  with "Types have separate declarations of a private property 'redirectUri'".
  FIX: derive the types off the googleapis graph itself —
  `type X = InstanceType<typeof google.auth.OAuth2>` and
  `Parameters<X["setCredentials"]>[0]` for Credentials. Don't import the auth
  types directly. (Note: `Awaited<ReturnType<X["getToken"]>>` does NOT work — TS
  resolves getToken to its void callback overload.)
- GSC Search Analytics client = `google.searchconsole({ version: "v1", auth })`,
  paginated via `searchanalytics.query` with startRow/rowLimit (max 25k). Sync
  window = last 90d ending 2d ago (GSC data lags ~2 days). Grouped by
  [date, page, query]; page/query rollups are derived in the same pass with an
  IMPRESSION-WEIGHTED avgPosition. Metric upsert keys on the
  (storeId, date, url, query) unique constraint so re-syncing is idempotent.
- Routes: app/api/gsc/oauth/{start,callback}/route.ts. Both re-check the Supabase
  session in-route (createRouteHandlerSupabaseClient().auth.getUser()) for defence
  in depth, but the GLOBAL middleware already gates /api/gsc/* — it is NOT in
  middleware.ts PUBLIC_PREFIXES, so any path outside the allowlist requires auth
  by default. New API routes here are auth-gated automatically unless added to
  PUBLIC_PREFIXES.
- Env: GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET (render.yaml, sync:false).
  Authorized redirect URI in Google Cloud Console must be
  <APP_URL>/api/gsc/oauth/callback. Migration SQL (NOT applied) lives at
  prisma/supabase/alter-2026-06-14-gsc-models.sql — owner runs it against the
  Supabase DIRECT endpoint, or `npx prisma db push` creates the 3 tables.
- Three new models: SearchConsoleMetric (raw per-day rows), SearchConsolePage
  + SearchConsoleQuery (rollups). All storeId-scoped, ON DELETE CASCADE.
