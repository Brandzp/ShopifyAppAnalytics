// GET /api/products?q=<search>&limit=<n>
//
// Lists products for the active store. Resolution order:
//   1. Local DB (Product table) — fast, no extra Shopify call
//   2. If DB returns 0 rows AND we have Shopify creds, fall back to a
//      live Shopify GraphQL search — catches the "Shopify connected but
//      sync hasn't populated DB yet" case + stale-DB issues
//
// Image URLs are always fetched live from Shopify (we don't store them
// in the Product table). One GraphQL call per picker-load covers all N
// products via the `nodes(ids:)` bulk lookup.
//
// Search fields: title, vendor, handle, AND variant SKU (so operators
// can type a SKU like "702" and find the product).

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { getDb } from "@/lib/server/db";
import { decryptSecret } from "@/lib/security/encryption";
import { ShopifyGraphQLClient } from "@/lib/shopify/client";

export const dynamic = "force-dynamic";

export interface ProductPickerRow {
  id: string;
  shopifyProductId: string;
  title: string;
  handle: string;
  vendor: string | null;
  productType: string | null;
  price: string;
  imageUrl: string | null;
  description: string | null;
  // Where this row came from. Useful for the picker UI to show "live
  // from Shopify" vs "from local cache" if we want to differentiate.
  source: "db" | "shopify";
}

const NODES_QUERY = /* GraphQL */ `
  query GetProductImages($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        featuredImage { url }
        description
      }
    }
  }
`;

// Live Shopify search — used when the local DB doesn't have what the
// operator is looking for. Returns Shopify's native product results
// matching the query string.
const LIVE_SEARCH_QUERY = /* GraphQL */ `
  query LiveSearchProducts($query: String!, $first: Int!) {
    products(first: $first, query: $query) {
      edges {
        node {
          id
          title
          handle
          vendor
          productType
          description
          featuredImage { url }
          priceRangeV2 { minVariantPrice { amount } }
          variants(first: 3) { edges { node { sku } } }
        }
      }
    }
  }
`;

function gidForProduct(shopifyProductId: string): string {
  if (shopifyProductId.startsWith("gid://")) return shopifyProductId;
  return `gid://shopify/Product/${shopifyProductId.replace(/\D+/g, "")}`;
}

function numericIdFromGid(gid: string): string {
  return gid.replace(/^gid:\/\/shopify\/Product\//, "");
}

export async function GET(request: Request) {
  try {
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);
    await assertStoreInActiveOrg(storeId);

    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const qLower = q.toLowerCase();
    const limitParam = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(50, limitParam) : 20;

    const db = getDb();

    // ── DB query ──────────────────────────────────────────────────────
    // No status filter — different stores set product.status differently
    // (some sync sets it null, others "active", others use Shopify's
    // string). Filtering by status was hiding genuine products. We exclude
    // explicitly-archived ones only.
    const products = await db.product.findMany({
      where: {
        storeId,
        NOT: { status: "archived" },
        ...(qLower
          ? {
              OR: [
                { title: { contains: qLower, mode: "insensitive" as const } },
                { vendor: { contains: qLower, mode: "insensitive" as const } },
                { handle: { contains: qLower, mode: "insensitive" as const } },
                // SKU search via the variants relation — catches operators
                // typing internal SKUs like "702" or barcode fragments.
                { variants: { some: { sku: { contains: qLower, mode: "insensitive" as const } } } },
                { variants: { some: { barcode: { contains: qLower, mode: "insensitive" as const } } } }
              ]
            }
          : {})
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        id: true,
        shopifyProductId: true,
        title: true,
        handle: true,
        vendor: true,
        productType: true,
        price: true
      }
    });
    console.log(`[api/products] storeId=${storeId} query="${q}" dbCount=${products.length}`);

    const connection = await db.shopifyConnection.findUnique({ where: { storeId } });
    const hasShopify = Boolean(connection?.adminAccessTokenEnc);
    const shopifyClient = hasShopify
      ? new ShopifyGraphQLClient({
          shopDomain: connection!.shopDomain,
          adminAccessToken: decryptSecret(connection!.adminAccessTokenEnc),
          apiVersion: connection!.apiVersion
        })
      : null;

    let rows: ProductPickerRow[] = [];

    if (products.length > 0) {
      // Enrich with images + descriptions in one GraphQL call.
      const imageByGid = new Map<string, { imageUrl: string | null; description: string | null }>();
      if (shopifyClient) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const gids = products.map((p: any) => gidForProduct(p.shopifyProductId));
          const result = await shopifyClient.request<{
            nodes: Array<{ id: string; featuredImage?: { url?: string } | null; description?: string | null } | null>;
          }>(NODES_QUERY, { ids: gids });
          for (const node of result.nodes ?? []) {
            if (!node) continue;
            imageByGid.set(node.id, {
              imageUrl: node.featuredImage?.url ?? null,
              description: node.description ?? null
            });
          }
        } catch (err) {
          console.warn("[api/products] failed to fetch images from Shopify:", err);
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rows = products.map((p: any) => {
        const enrichment = imageByGid.get(gidForProduct(p.shopifyProductId));
        return {
          id: p.id,
          shopifyProductId: p.shopifyProductId,
          title: p.title,
          handle: p.handle,
          vendor: p.vendor,
          productType: p.productType,
          price: p.price.toString(),
          imageUrl: enrichment?.imageUrl ?? null,
          description: enrichment?.description ?? null,
          source: "db" as const
        };
      });
    }

    // ── Live Shopify fallback ─────────────────────────────────────────
    // Fires whenever local DB has fewer than `limit` rows — covers both:
    //   (a) empty DB (Shopify sync hasn't populated Product table yet)
    //   (b) sparse DB (operator searches for something not synced)
    // When no query is given we just fetch recent products from Shopify;
    // this means the picker always has SOMETHING to show even on a fresh
    // install.
    if (rows.length < limit && shopifyClient) {
      try {
        // Shopify search syntax — when q is empty, just sort by updated.
        // When q is given, search title/vendor/SKU/handle in OR.
        const shopifyQuery = q
          ? `title:*${q}* OR vendor:*${q}* OR sku:*${q}* OR handle:*${q}*`
          : "status:active";
        const result = await shopifyClient.request<{
          products?: {
            edges?: Array<{
              node: {
                id: string;
                title: string;
                handle: string;
                vendor?: string | null;
                productType?: string | null;
                description?: string | null;
                featuredImage?: { url?: string } | null;
                priceRangeV2?: { minVariantPrice?: { amount?: string } };
                variants?: { edges?: Array<{ node: { sku?: string | null } }> };
              };
            }>;
          };
        }>(LIVE_SEARCH_QUERY, { query: shopifyQuery, first: limit });

        const existingGids = new Set(rows.map((r) => gidForProduct(r.shopifyProductId)));
        for (const edge of result.products?.edges ?? []) {
          const n = edge.node;
          if (existingGids.has(n.id)) continue; // already in DB results
          rows.push({
            id: numericIdFromGid(n.id), // synthetic id (we don't have a local row)
            shopifyProductId: numericIdFromGid(n.id),
            title: n.title,
            handle: n.handle,
            vendor: n.vendor ?? null,
            productType: n.productType ?? null,
            price: n.priceRangeV2?.minVariantPrice?.amount ?? "0",
            imageUrl: n.featuredImage?.url ?? null,
            description: n.description ?? null,
            source: "shopify"
          });
          if (rows.length >= limit) break;
        }
        console.log(`[api/products] Shopify fallback added ${rows.length - products.length} rows`);
      } catch (err) {
        console.warn("[api/products] live Shopify search failed:", err);
      }
    }

    return NextResponse.json({
      ok: true,
      products: rows,
      diagnostics: { dbCount: products.length, totalReturned: rows.length, hasShopifyConnection: hasShopify }
    });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
