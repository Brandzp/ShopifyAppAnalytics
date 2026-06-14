# Shopify / Store Conventions — ShopifyAppAnalytics

Append-only. Store-specific conventions and gotchas learned while working this repo.

## Affiliate attribution (SA-CRIT-06, 2026-06-14)
- Redirect endpoint: `app/api/affiliate-portal/redirect/route.ts` (GET).
  Query params: `affiliate`/`ref`/`bg_ref` (code), `coupon`, `destination`
  (path), `product`/`productId`, `sourcePlatform`, `sourceUrl`, `utm_*`.
- The write path was ALREADY wired before this task: the route calls
  `createAffiliateRedirectSession()` in
  `lib/services/affiliate-link-tracking-service.ts`, which creates an
  `AttributionSession` row (guarded by `if (db.attributionSession)`). The
  "0 rows" gap is because no real clicks have flowed through the endpoint
  (experimental feature), not because the create was missing.
- Conversion matching is keyed on `clickId`, NOT primarily on a cookie:
  redirect appends `agent_click_id=<clickId>` to the storefront URL →
  `public/shopify/affiliate-ref-tracking.js` stores it in localStorage and
  writes it into the Shopify cart `note_attributes` → on the order webhook,
  `lib/services/shopify-webhook-service.ts` finds the session by `clickId`
  and sets `convertedAt`.
- SA-CRIT-06 additions: (1) first-party `aff_click_id` cookie
  (HttpOnly/Secure/SameSite=Lax/Path=/, 30d) set on the redirect response as a
  server-side fallback for conversion matching when the storefront snippet
  never runs; (2) `productId` captured from `?product=` and persisted on
  `AttributionSession` (new nullable column).
- NOTE for follow-up: nothing READS the `aff_click_id` cookie yet. The webhook
  match still relies on `agent_click_id` in the cart note. A future task should
  make conversion matching also read this cookie (server-side) to close the gap
  when merchants haven't installed the storefront snippet.

## DB / Prisma conventions
- `getDb()` (`lib/server/db.ts`) returns `prisma as any` — so Prisma `create`
  data objects are NOT type-checked. After a schema change you still MUST run
  `npx prisma generate` for the runtime client to know the new column.
- Postgres table names are PascalCase quoted identifiers (e.g.
  `"AttributionSession"`, `"AffiliateAttribution"`).
- Production schema changes are applied via idempotent SQL files in
  `prisma/supabase/alter-YYYY-MM-DD-*.sql` (`ADD COLUMN IF NOT EXISTS`),
  in addition to a `prisma/migrations/<ts>_*/migration.sql`. The live DB
  (`shopify_profit_ops`) is schema-pushed with a `0_baseline` migration
  resolved as applied — do NOT run `prisma migrate` against prod.
- `npx tsc --noEmit` is the clean baseline (exit 0, zero output as of
  2026-06-14 P0 hardening). Keep it clean.
