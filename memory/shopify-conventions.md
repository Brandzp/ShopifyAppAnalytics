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

## Webhook registration after OAuth (SA-HIGH-01, 2026-06-14)
- `persistOauthConnection()` in `lib/services/shopify-oauth-service.ts` now
  registers order webhooks AFTER the ShopifyConnection upsert. New exported
  helper `registerOrderWebhooks({shopDomain, accessToken})` POSTs to the REST
  Webhooks API `POST https://{shop}/admin/api/{version}/webhooks.json` with
  body `{webhook:{topic, address, format:"json"}}`.
  - Topics: `orders/create`, `orders/updated`, `orders/cancelled`.
  - `address` = `${APP_URL}/api/webhooks/shopify/orders` (the existing handler;
    verified in `app/api/webhooks/shopify/orders/route.ts`).
  - API version: `SHOPIFY_ADMIN_API_VERSION` env (same var the GraphQL client
    reads) || default `"2024-10"`. NOTE: the GraphQL client default is `2025-01`;
    the webhook helper defaults to `2024-10` per the task spec — they read the
    SAME env var, so setting it aligns both.
- DESIGN: registration is BEST-EFFORT and NEVER fails the OAuth flow — polling/
  sync is the fallback. `registerOrderWebhooks` swallows all errors (logs via
  console.error/warn) and returns `{webhookIds, registered, failed}`. HTTP 201 =
  new sub (capture `webhook.id`); HTTP 422 = identical sub already exists
  (idempotent re-install) → counted as `registered`, no id learned. The
  persist step in `persistOauthConnection` is additionally try/catch-wrapped.
- The Shopify REST webhook payload shape was validated against shopify.dev docs
  (admin-rest .../resources/webhook): body key is `webhook` (singular), missing
  topic/address → 422, response is `{webhook:{id,...}}` 201.
- `startShopifyOAuthPlaceholder(storeDomain)` in
  `lib/services/shopify-ingestion-service.ts` is no longer a `not_implemented`
  stub — it resolves the store by domain, pulls creds via
  `getStoredShopifyCredentials(storeId)` (which handles decrypt + the
  client-credentials sentinel), and (re)registers webhooks on demand. Returns
  `{status: ok|partial|store_not_found|not_connected|db_unavailable, ...}`.
- Schema: `ShopifyConnection` gained `webhookIds String[] @default([])` and
  `webhooksRegisteredAt DateTime?`. Applied via idempotent SQL (NOT
  `prisma migrate`/db:push against prod): `ADD COLUMN IF NOT EXISTS "webhookIds"
  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]` + `"webhooksRegisteredAt" TIMESTAMP(3)`
  in both `prisma/migrations/20260614_shopify_connection_webhook_ids/migration.sql`
  and `prisma/supabase/alter-2026-06-14-shopify-connection-webhook-ids.sql`.
- RE-CHECK after deploy: the alter SQL must be applied to the live DB
  (`shopify_profit_ops`) before the next OAuth install writes webhookIds, or the
  `shopifyConnection.update({data:{webhookIds...}})` will fail at runtime (column
  missing). The update is try/catch-guarded so it won't break OAuth, but the IDs
  won't persist until the column exists.

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

## Offline vs. expiring Shopify token (SA-FIX1, 2026-06-14)
- Background sync MUST use the OFFLINE (permanent) Shopify token. The error
  `Error validating access token: Session has expired ...` means an EXPIRING
  token was used.
- Token flow: every sync/cron service (`shopify-sync-service`,
  `shopify-ingestion-service`, `marketing-planner-shopify-service`,
  `affiliate-portal-admin-service`, `growth-agent-product-crawler-service`,
  `creative-shopify-publish-service`) resolves creds via
  `getStoredShopifyCredentials(storeId)` →
  `ShopifyConnection.adminAccessTokenEnc` (decrypted). NONE use a session/cookie
  token. There is NO online-session token machinery in this app.
- The OAuth code grant is OFFLINE-by-default: `buildInstallRedirect`
  (`shopify-oauth-service.ts`) deliberately OMITS `grant_options[]` from the
  authorize URL, so Shopify issues a permanent offline token. NEVER add
  `grant_options[]=per-user` (that requests an ONLINE token that expires ~24h).
  `persistOauthConnection` stores the real `access_token` in `adminAccessTokenEnc`.
- THE BUG: `saveShopifyCredentials` (the "paste credentials / test connection"
  path) stores the literal sentinel `"client_credentials"` when no token is
  pasted. On sync, `getStoredShopifyCredentials` saw the sentinel and minted a
  token via Shopify's CLIENT-CREDENTIALS grant
  (`requestShopifyAccessTokenWithClientCredentials`), which returns a SHORT-LIVED
  token (`expires_in` ~24h). After it lapsed, every background sync threw
  "Session has expired". The permanent OAuth offline token was ignored.
- SA-FIX1: `getStoredShopifyCredentials` now (1) uses a real stored token
  directly when present (offline OAuth token or manual Admin token — both
  durable), and (2) on the sentinel path logs a LOUD warning + returns
  `tokenSource:"client_credentials"` so the expiry is visible and the owner is
  told to re-OAuth. Client-credentials still works as a degraded fallback.
- OWNER ACTION when a store hits this: re-connect via OAuth
  (Settings → Shopify connection → Connect) to overwrite the sentinel with a
  permanent offline token. No schema change is needed — `adminAccessTokenEnc`
  already holds the offline token after OAuth.
