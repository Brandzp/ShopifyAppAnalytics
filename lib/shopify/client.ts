import { AppError } from "@/lib/server/errors";
import type { ShopifyCredentialInput, ShopifyConnection as ShopifyGraphConnection, ShopifyGraphQLResponse, ShopifyNodeEdge } from "@/lib/shopify/types";

const DEFAULT_API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION ?? "2025-01";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ShopifyGraphQLClient {
  private shopDomain: string;
  private adminAccessToken: string;
  private apiVersion: string;

  constructor(input: ShopifyCredentialInput & { apiVersion?: string; adminAccessToken: string }) {
    this.shopDomain = input.shopDomain;
    this.adminAccessToken = input.adminAccessToken;
    this.apiVersion = input.apiVersion ?? DEFAULT_API_VERSION;
  }

  async request<T>(query: string, variables?: Record<string, unknown>, attempt = 0): Promise<T> {
    const response = await fetch(`https://${this.shopDomain}/admin/api/${this.apiVersion}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": this.adminAccessToken
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store"
    });

    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await sleep(600 * (attempt + 1));
      return this.request<T>(query, variables, attempt + 1);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new AppError(`Shopify request failed with status ${response.status}. ${text}`, response.status);
    }

    const payload = (await response.json()) as ShopifyGraphQLResponse<T>;
    if (payload.errors?.length) {
      throw new AppError(payload.errors.map((error) => error.message).join("; "), 400, payload.errors);
    }

    if (!payload.data) {
      throw new AppError("Shopify returned an empty response.", 502);
    }

    return payload.data;
  }

  async paginateConnection<TNode, TData extends Record<string, ShopifyGraphConnection<TNode>>>(
    key: keyof TData,
    query: string,
    variables: Record<string, unknown> = {}
  ): Promise<TNode[]> {
    let cursor: string | null = null;
    const results: TNode[] = [];

    do {
      const page: TData = await this.request<TData>(query, { ...variables, cursor });
      const connection: ShopifyGraphConnection<TNode> | undefined = page[key];
      if (!connection) break;
      results.push(...connection.edges.map((edge: ShopifyNodeEdge<TNode>) => edge.node));
      cursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor ?? null : null;
    } while (cursor);

    return results;
  }
}

export async function requestShopifyAccessTokenWithClientCredentials(shopDomain: string) {
  const clientId = process.env.SHOPIFY_CLIENTID?.trim();
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new AppError("Missing SHOPIFY_CLIENTID or SHOPIFY_CLIENT_SECRET. Add them to .env to use Shopify client-credentials auth.", 500);
  }

  const response = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials"
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text();
    throw new AppError(`Shopify token request failed with status ${response.status}. ${text}`, response.status);
  }

  const payload = await response.json() as { access_token?: string; scope?: string; expires_in?: number };
  if (!payload.access_token) {
    throw new AppError("Shopify did not return an access token for the client credentials grant.", 502, payload);
  }

  return {
    accessToken: payload.access_token,
    scope: payload.scope ?? "",
    expiresIn: payload.expires_in ?? null
  };
}

export async function resolveShopifyAdminAccessToken(input: ShopifyCredentialInput) {
  const explicitToken = input.adminAccessToken?.trim();
  if (explicitToken) {
    return {
      adminAccessToken: explicitToken,
      source: "manual" as const
    };
  }

  const granted = await requestShopifyAccessTokenWithClientCredentials(input.shopDomain);
  return {
    adminAccessToken: granted.accessToken,
    source: "client_credentials" as const,
    scope: granted.scope,
    expiresIn: granted.expiresIn
  };
}

export function createShopifyClient(input: ShopifyCredentialInput & { apiVersion?: string; adminAccessToken: string }) {
  return new ShopifyGraphQLClient(input);
}
