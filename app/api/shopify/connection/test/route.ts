import { NextResponse } from "next/server";
import { testShopifyConnection } from "@/lib/services/shopify-connection-service";
import { AppError, toErrorMessage } from "@/lib/server/errors";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await testShopifyConnection({
      shopDomain: body.shopDomain,
      adminAccessToken: body.adminAccessToken
    });

    return NextResponse.json(result);
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
