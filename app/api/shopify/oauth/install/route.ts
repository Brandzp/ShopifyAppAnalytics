import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { buildInstallRedirect, SHOPIFY_OAUTH_STATE_COOKIE } from "@/lib/services/shopify-oauth-service";

export const dynamic = "force-dynamic";

/**
 * OAuth install entry point for multi-merchant onboarding.
 *
 *   GET /api/shopify/oauth/install?shop=example.myshopify.com
 *
 * Redirects the merchant to Shopify's authorize screen and stores a signed,
 * short-lived state nonce in an httpOnly cookie so the callback can validate it.
 * Shopify also calls this endpoint (as the app URL) with `shop`+`hmac` when a
 * merchant opens the app, which kicks off the grant.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  try {
    const { authorizeUrl, signedState } = await buildInstallRedirect(url.searchParams.get("shop"));

    const response = NextResponse.redirect(authorizeUrl);
    response.cookies.set(SHOPIFY_OAUTH_STATE_COOKIE, signedState, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600 // 10 minutes — long enough to authorize, short enough to limit replay.
    });

    return response;
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    const message = encodeURIComponent(toErrorMessage(error));
    // Surface bad input back to the connect UI rather than dead-ending on a JSON error.
    return NextResponse.redirect(`${appUrl}/settings?shopify_error=${message}`, statusCode >= 500 ? 302 : 302);
  }
}
