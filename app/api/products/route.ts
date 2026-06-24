// GET /api/products?q=<search>&limit=<n>
//
// Lists products for the active store, enriched with Shopify featured-
// image URLs + description. Used by the ProductPicker component (Sprint
// launcher, Quick Batch, /creative/new).
//
// Why on-demand image fetch:
// We don't store imageUrl in the Product table — adding it would mean
// a migration + backfill + keeping it fresh through sync. The picker is
// low-traffic (operator opens it a handful of times per day), so one
// extra Shopify GraphQL call per picker-load is cheap. If this becomes
// hot, we'll add a column.
//
// Image lookup uses `nodes(ids: ...)` so we get all N images in ONE
// GraphQL request, not N requests.

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
  price: string; // store-formatted decimal as string ("10.00")
  imageUrl: string | null;
  description: string | null;
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

function gidForProduct(shopifyProductId: string): string {
  // Shopify global IDs look like "gid://shopify/Product/1234567890".
  // The DB column stores either the numeric id or the gid; normalize.
  if (shopifyProductId.startsWith("gid://")) return shopifyProductId;
  return `gid://shopify/Product/${shopifyProductId.replace(/\D+/g, "")}`;
}

export async function GET(request: Request) {
  try {
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);
    await assertStoreInActiveOrg(storeId);

    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const limitParam = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(50, limitParam) : 20;

    const db = getDb();
    // Filter by title or vendor — keep query simple, the picker UI will
    // also do client-side filtering on the returned set.
    const products = await db.product.findMany({
      where: {
        storeId,
        status: "active",
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" as const } },
                { vendor: { contains: q, mode: "insensitive" as const } },
                { handle: { contains: q, mode: "insensitive" as const } }
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

    // Fetch images + description from Shopify in ONE GraphQL call. If
    // anything fails (no token, Shopify down) we still return the products
    // — just without image/description.
    const imageByGid = new Map<string, { imageUrl: string | null; description: string | null }>();
    if (products.length > 0) {
      try {
        const connection = await db.shopifyConnection.findUnique({ where: { storeId } });
        if (connection?.adminAccessTokenEnc) {
          const client = new ShopifyGraphQLClient({
            shopDomain: connection.shopDomain,
            adminAccessToken: decryptSecret(connection.adminAccessTokenEnc),
            apiVersion: connection.apiVersion
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const gids = products.map((p: any) => gidForProduct(p.shopifyProductId));
          const result = await client.request<{
            nodes: Array<{ id: string; featuredImage?: { url?: string } | null; description?: string | null } | null>;
          }>(NODES_QUERY, { ids: gids });
          for (const node of result.nodes ?? []) {
            if (!node) continue;
            imageByGid.set(node.id, {
              imageUrl: node.featuredImage?.url ?? null,
              description: node.description ?? null
            });
          }
        }
      } catch (err) {
        console.warn("[api/products] failed to fetch images from Shopify:", err);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: ProductPickerRow[] = products.map((p: any) => {
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
        description: enrichment?.description ?? null
      };
    });

    return NextResponse.json({ ok: true, products: rows });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
