import crypto from "node:crypto";
import { getDb } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import { encryptSecret } from "@/lib/security/encryption";
import { createShopifyClient } from "@/lib/shopify/client";
import { SHOP_QUERY } from "@/lib/shopify/queries/shop";
import { mapShopMetadata } from "@/lib/shopify/mappers/shopify-mappers";

/**
 * Shopify OAuth (authorization-code grant) for multi-merchant onboarding.
 *
 * Flow:
 *   1. /api/shopify/oauth/install  -> redirect merchant to Shopify's authorize URL.
 *   2. Shopify redirects back to /api/shopify/oauth/callback with code+hmac+state+shop.
 *   3. We verify the HMAC + the state nonce, exchange the code for a permanent
 *      Admin API access token, and persist it (encrypted) on ShopifyConnection.
 *
 * Reuses existing env vars (SHOPIFY_CLIENTID / SHOPIFY_CLIENT_SECRET / APP_URL),
 * the existing encryption helpers, and the existing Store / ShopifyConnection
 * model + Shopify GraphQL client. No new dependencies, no schema changes.
 *
 * Validated against the documented Shopify Admin OAuth authorization-code grant
 * (authorize endpoint, hmac signing rules, /admin/oauth/access_token exchange),
 * which is stable across Admin API versions. The same /admin/oauth/access_token
 * host is already used by lib/shopify/client.ts for the client-credentials grant.
 */

// Default scopes for the analytics app. Override via SHOPIFY_OAUTH_SCOPES (comma-separated).
const DEFAULT_SCOPES = [
  "read_products",
  "read_orders",
  "read_customers"
];

// Strict shop-domain guard for OAuth: only `<store>.myshopify.com`. Prevents the
// authorize redirect / token exchange from being pointed at an attacker host.
const OAUTH_SHOP_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export const SHOPIFY_OAUTH_STATE_COOKIE = "shopify_oauth_state";

interface ShopifyOauthConfig {
  clientId: string;
  clientSecret: string;
  appUrl: string;
  scopes: string;
  redirectUri: string;
}

function getOauthConfig(): ShopifyOauthConfig {
  const clientId = process.env.SHOPIFY_CLIENTID?.trim();
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
  const appUrl = process.env.APP_URL?.trim();

  if (!clientId || !clientSecret || !appUrl) {
    throw new AppError(
      "Missing SHOPIFY_CLIENTID, SHOPIFY_CLIENT_SECRET, or APP_URL. Set them in .env to use Shopify OAuth.",
      500
    );
  }

  const configuredScopes = process.env.SHOPIFY_OAUTH_SCOPES?.trim();
  const scopes = configuredScopes && configuredScopes.length
    ? configuredScopes.split(",").map((scope) => scope.trim()).filter(Boolean).join(",")
    : DEFAULT_SCOPES.join(",");

  return {
    clientId,
    clientSecret,
    appUrl: appUrl.replace(/\/$/, ""),
    scopes,
    redirectUri: `${appUrl.replace(/\/$/, "")}/api/shopify/oauth/callback`
  };
}

/**
 * Validate + normalize the `shop` param Shopify hands us (or the merchant types).
 * Accepts `store.myshopify.com` or a bare `store` handle; rejects anything else.
 */
export function normalizeOauthShopDomain(input: string | null | undefined): string {
  const raw = (input ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!raw) {
    throw new AppError("A shop domain is required to start the Shopify install.", 400);
  }

  const candidate = raw.includes(".") ? raw : `${raw}.myshopify.com`;
  if (!OAUTH_SHOP_PATTERN.test(candidate)) {
    throw new AppError("Enter a valid Shopify store like example.myshopify.com.", 400);
  }

  return candidate;
}

/** Cryptographically random nonce used as the OAuth `state`. */
export function generateOauthState(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Build the Shopify authorize URL and the signed state cookie value.
 * The cookie binds the nonce to the shop and is signed with the client secret so
 * the callback can validate state without any server-side session store.
 */
export function buildInstallRedirect(shopInput: string | null | undefined): {
  authorizeUrl: string;
  shopDomain: string;
  state: string;
  signedState: string;
} {
  const { clientId, clientSecret, scopes, redirectUri } = getOauthConfig();
  const shopDomain = normalizeOauthShopDomain(shopInput);
  const state = generateOauthState();

  const params = new URLSearchParams({
    client_id: clientId,
    scope: scopes,
    redirect_uri: redirectUri,
    state
  });

  const authorizeUrl = `https://${shopDomain}/admin/oauth/authorize?${params.toString()}`;
  const signedState = signState(shopDomain, state, clientSecret);

  return { authorizeUrl, shopDomain, state, signedState };
}

function signState(shopDomain: string, state: string, clientSecret: string): string {
  const signature = crypto
    .createHmac("sha256", clientSecret)
    .update(`${shopDomain}:${state}`)
    .digest("hex");
  // cookie value = "<state>.<signature>"
  return `${state}.${signature}`;
}

/** Constant-time check that the returned state matches the signed cookie. */
export function verifyOauthState(input: {
  shopDomain: string;
  returnedState: string | null;
  signedStateCookie: string | null;
}): boolean {
  const { clientSecret } = getOauthConfig();
  const returnedState = input.returnedState?.trim();
  const cookie = input.signedStateCookie?.trim();
  if (!returnedState || !cookie) return false;

  const [cookieState] = cookie.split(".");
  if (!cookieState) return false;

  // The state echoed back by Shopify must equal the one we put in the cookie...
  if (!timingSafeEqualStrings(returnedState, cookieState)) return false;

  // ...and the cookie itself must carry our signature for this shop+state.
  const expected = signState(input.shopDomain, cookieState, clientSecret);
  return timingSafeEqualStrings(cookie, expected);
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

/**
 * Verify the HMAC Shopify appends to the OAuth callback query string.
 * Spec: remove `hmac` and `signature`, sort the remaining params, join as
 * `key=value` pairs with `&`, HMAC-SHA256 with the app's client secret, hex.
 */
export function verifyOauthHmac(searchParams: URLSearchParams): boolean {
  const { clientSecret } = getOauthConfig();
  const providedHmac = searchParams.get("hmac");
  if (!providedHmac) return false;

  const pairs: string[] = [];
  for (const [key, value] of searchParams.entries()) {
    if (key === "hmac" || key === "signature") continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const message = pairs.join("&");

  const digest = crypto.createHmac("sha256", clientSecret).update(message).digest("hex");
  return timingSafeEqualStrings(digest, providedHmac);
}

interface TokenExchangeResult {
  accessToken: string;
  scope: string;
}

/**
 * Exchange the temporary authorization code for a permanent Admin API access token.
 * POST https://{shop}/admin/oauth/access_token  { client_id, client_secret, code }
 */
export async function exchangeShopifyCode(shopDomain: string, code: string): Promise<TokenExchangeResult> {
  const { clientId, clientSecret } = getOauthConfig();
  const cleanCode = code.trim();
  if (!cleanCode) {
    throw new AppError("Shopify did not return an authorization code.", 400);
  }

  const response = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code: cleanCode
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text();
    throw new AppError(`Shopify OAuth token exchange failed with status ${response.status}. ${text}`, response.status);
  }

  const payload = (await response.json()) as { access_token?: string; scope?: string };
  if (!payload.access_token) {
    throw new AppError("Shopify OAuth exchange did not return an access token.", 502, payload);
  }

  return {
    accessToken: payload.access_token,
    scope: payload.scope ?? ""
  };
}

/**
 * Persist a freshly granted OAuth token: fetch shop metadata with the new token,
 * then upsert Store + ShopifyConnection (token encrypted at rest). Mirrors
 * saveShopifyCredentials but keyed off an OAuth-granted token instead of a
 * manually pasted one.
 */
export async function persistOauthConnection(input: {
  shopDomain: string;
  accessToken: string;
  scope: string;
}): Promise<{ storeId: string; shopDomain: string }> {
  const db = getDb();
  if (!db) {
    throw new AppError("Database client is not available. Generate the Prisma client and try again.", 500);
  }

  const client = createShopifyClient({ shopDomain: input.shopDomain, adminAccessToken: input.accessToken });
  const data = await client.request<{ shop: any }>(SHOP_QUERY);
  const meta = mapShopMetadata(data.shop);

  const encryptedToken = encryptSecret(input.accessToken);
  const tokenLastFour = input.accessToken.slice(-4);

  const store = await db.store.upsert({
    where: { domain: input.shopDomain },
    update: {
      name: meta.name,
      shopifyShopId: meta.shopifyShopId,
      currency: meta.currency,
      timezone: meta.timezone,
      planName: meta.planName,
      connected: true
    },
    create: {
      domain: input.shopDomain,
      name: meta.name,
      shopifyShopId: meta.shopifyShopId,
      currency: meta.currency,
      timezone: meta.timezone,
      planName: meta.planName,
      connected: true
    }
  });

  await db.shopifyConnection.upsert({
    where: { storeId: store.id },
    update: {
      shopDomain: input.shopDomain,
      adminAccessTokenEnc: encryptedToken,
      tokenLastFour,
      syncStatus: "idle",
      lastSyncError: null
    },
    create: {
      storeId: store.id,
      shopDomain: input.shopDomain,
      adminAccessTokenEnc: encryptedToken,
      tokenLastFour
    }
  });

  return { storeId: store.id, shopDomain: input.shopDomain };
}
