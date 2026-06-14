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
  to crons.
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
