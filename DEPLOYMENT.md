# Deployment Guide

End-to-end steps to deploy this app to production on **Render** with
**Supabase Postgres**, plus the external setup needed for **Shopify** and
**Meta Ads** integrations.

---

## 1. Supabase (Postgres database)

1. Create a free Supabase project at https://supabase.com/dashboard.
   Pick a region close to your users (Europe (eu-central-1) for IL traffic).
2. Wait ~2 min for the project to provision.
3. Open **Project Settings → Database → Connection string**:
   - **Connection pooling** tab → copy the **Transaction** mode URI →
     this is your `DATABASE_URL`. It ends with `:6543/postgres`. Append
     `?pgbouncer=true&connection_limit=1` if not already there.
   - **URI** tab (the one above pooling) → copy → this is your `DIRECT_URL`.
     It ends with `:5432/postgres`.
4. Apply the schema — pick one of these paths:

   **Easiest — SQL Editor (recommended):**
   - Open `prisma/supabase/init.sql` in your editor, copy all 1,368 lines
   - Supabase dashboard → **SQL Editor** → **New query** → paste → **Run**
   - Verify in **Table Editor** — all 42 tables should appear

   **Or via Prisma (if you prefer):**
   ```bash
   DIRECT_URL="postgresql://...:5432/postgres" \
   DATABASE_URL="postgresql://...:5432/postgres" \
   npx prisma db push
   ```

   Full instructions + safety notes: [prisma/supabase/README.md](prisma/supabase/README.md).

That's it. The schema is now live in Supabase.

> ⚠️ Until you set `DATABASE_URL` to your Supabase pooled URI in
> **Render**, the running app keeps writing to your local Postgres only.
> Supabase will sit empty until production traffic starts hitting it.

### 1a. (Optional) Migrate existing local data to Supabase

If you've been developing against the local DB and want to start the
deployed app with your existing data already loaded, run the one-shot
migration script:

```powershell
.\scripts\migrate-to-supabase.ps1 -SupabaseUrl "postgresql://postgres.PROJECT:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres"
```

⚠️ Use the **DIRECT** Supabase URL (port `5432`), not the pooled `6543`
one — `pg_dump`/`psql` need the direct connection. The script:

- Reads `DATABASE_URL` from your local `.env`
- **Preflight-checks** Supabase is empty (refuses to run if any `Store`
  row already exists, preventing accidental double-loads)
- Dumps data only (no schema — that's already there from step 4 above)
- Restores in a single transaction (rolls back cleanly on any error)
- Reports row counts per table at the end so you can sanity-check

Pass `-DryRun` to generate the dump file without applying it (useful if
you want to inspect what would be loaded first).

Pass `-SkipPreflight` only if you've intentionally truncated Supabase
tables and want to re-migrate.

After migration completes, spot-check a few rows in the Supabase **Table
Editor** before pointing Render at the new URL.

---

## 2. Render (web service)

1. Push this repo to GitHub (or your existing remote).
2. https://dashboard.render.com → **New** → **Blueprint** → select the repo.
3. Render detects `render.yaml` and proposes one web service:
   `shopify-analytics`. Approve.
4. On the service settings page, fill in the secret env vars marked
   `sync: false` in the YAML — these can't be committed:
   - `DATABASE_URL` (Supabase pooled URI from step 1.3)
   - `DIRECT_URL` (Supabase direct URI from step 1.3)
   - `APP_URL` (will be `https://<service-name>.onrender.com` — paste this
     AFTER first deploy when you know the URL)
   - `SHOPIFY_WEBHOOK_SECRET`, `SHOPIFY_CLIENTID`, `SHOPIFY_CLIENT_SECRET` (step 3)
   - `META_ADS_CLIENT_ID`, `META_ADS_CLIENT_SECRET` (step 4)
   - `RESEND_API_KEY`, `REPORT_FROM_EMAIL`, `OPENAI_API_KEY`
   - Any of the optional creative-studio AI keys you actually use
5. Trigger the first deploy. Watch logs.
6. When the service shows as live, copy the URL and set `APP_URL` to it.
   Re-deploy to pick up the new value.

**Cost:** Render Starter plan = $7/mo. Supabase free tier = $0 for the
first ~500MB. Total: ~$7/mo to start.

---

## 3. Shopify Partner Dashboard (OAuth app)

You need a registered Shopify app to use OAuth (instead of paste-token).

1. https://partners.shopify.com → **Apps** → **Create app** → **Custom app
   distribution** (cheapest path; switch to Public if you list on the
   Shopify App Store later).
2. App name: "Shopify Analytics by [your brand]". Save.
3. App URL → `${APP_URL}` (e.g. `https://shopify-analytics.onrender.com`)
4. Allowed redirection URL → `${APP_URL}/api/shopify/oauth/callback`
5. Configuration → **API access scopes** → grant at least:
   - `read_products`, `read_orders`, `read_customers`
   - `read_inventory`
   - `read_customer_journey` ← required for UTM/referrer attribution
6. Copy the **Client ID** and **Client secret** into Render as
   `SHOPIFY_CLIENTID` and `SHOPIFY_CLIENT_SECRET`.
7. (Optional) Set up an HMAC webhook secret in the app config and copy it
   to `SHOPIFY_WEBHOOK_SECRET`. This is used to verify webhook callbacks.

After redeploy, opening `${APP_URL}/api/shopify/oauth/install?shop=YOUR_SHOP.myshopify.com`
will start the OAuth flow.

---

## 4. Meta for Developers (OAuth app for Meta Ads + Instagram)

1. https://developers.facebook.com → **My Apps** → **Create app** →
   pick **"Other"** → **Business** type.
2. App name + email. Create.
3. In the app dashboard, add **Facebook Login** product + **Marketing API** product.
4. Settings → Basic → copy **App ID** and **App secret** into Render as
   `META_ADS_CLIENT_ID` and `META_ADS_CLIENT_SECRET`.
5. Facebook Login → Settings → Valid OAuth Redirect URIs → add:
   - `${APP_URL}/api/creator/instagram/oauth/callback` (Instagram crawler auth)
6. **App Review** → request the `ads_read` permission with a clear
   description of how you use it (analytics reporting for the merchant who
   installed your app). Meta reviews typically take 5-10 business days.
   While in review, only your test users (added under **Roles → Testers**)
   can connect.

---

## 5. Resend (transactional email)

1. https://resend.com → sign up free.
2. **Add Domain** → verify with DNS records.
3. **API Keys** → create a key with `Sending access` for your domain.
4. Set in Render:
   - `RESEND_API_KEY` = the new key
   - `REPORT_FROM_EMAIL` = `"Weekly Report <reports@yourverifieddomain.com>"`

The weekly cron uses these to mail the PDF every Sunday 09:00 IL.

---

## 6. OpenAI (AI insights)

1. https://platform.openai.com/api-keys → create a key.
2. Set `OPENAI_API_KEY` in Render.

Used for the Hebrew AI insights in the weekly PDF + the monthly synthesis.
Costs ~$0.01-0.02 per report.

---

## 7. Creative storage (R2 or S3)

The "local" backend won't survive a Render container restart. For prod:

1. Pick R2 (Cloudflare, cheaper egress) or S3 (AWS).
2. Create a bucket. Generate access keys.
3. Set in Render:
   - `CREATIVE_STORAGE_BACKEND` = `s3`
   - `CREATIVE_BUCKET` = bucket name
   - `CREATIVE_S3_ENDPOINT` = for R2: `https://<account_id>.r2.cloudflarestorage.com`
   - `CREATIVE_S3_REGION` = `auto` (R2) or e.g. `us-east-1` (S3)
   - `CREATIVE_S3_ACCESS_KEY_ID` + `CREATIVE_S3_SECRET_ACCESS_KEY`

---

## Smoke test after first deploy

- Open `${APP_URL}/` → Command Center loads, "Data confidence" badge visible
- Open `${APP_URL}/settings` → connection managers visible
- Trigger a manual sync from the Shopify card → sync runs and recent
  orders appear on the Command Center
- (When ready) open `${APP_URL}/api/shopify/oauth/install?shop=...` → OAuth
  redirect flow completes and the store row gets an updated token

If anything 500s, **check Render → Logs** tab — every error includes the
file + line.

---

## Things to do AFTER first successful deploy

- Set up a custom domain in Render → Custom Domains
- Map a Resend "from" email on the custom domain
- Test the weekly cron by forcing `ENABLE_WEEKLY_REPORT_CRON=1` + setting
  `WEEKLY_REPORT_CRON_MS=60000` temporarily to fire faster
- Confirm Supabase nightly backups are enabled (Free tier: 7 days retention)
