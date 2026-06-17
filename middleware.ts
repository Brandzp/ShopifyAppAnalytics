// Edge middleware — runs on every request before the page handler.
//
// Three jobs:
//   1. Refresh the Supabase Auth session (rotates JWT in cookies, keeps
//      the user signed in across server-component renders).
//   2. Gate protected routes — anything outside the public allowlist
//      requires a signed-in user. Unauthenticated users get redirected
//      to /signin with `?next=<original_url>` so they land back where
//      they started after sign in.
//   3. Lazy-provision User + default Org for first-time signed-in users
//      who haven't completed the callback handler (e.g. magic link came
//      in another browser).
//
// Public routes (no auth required):
//   - / (marketing landing; will move to /app for the dashboard later)
//   - /signin, /signup, /forgot-password, /reset-password
//   - /privacy, /terms
//   - /api/auth/callback (Supabase verification redirect)
//   - /api/webhooks/* (Shopify, BixGrow, etc — auth via signature)
//   - /api/cron/* (cron self-pings — locked behind CRON_SECRET; see
//     requireCronSecret below. When CRON_SECRET is set, these routes require
//     a matching x-cron-secret header; when unset, the check is skipped so
//     local dev keeps working.)
//   - /api/meta/data-deletion (Meta deletion callback protocol)
//
// Static assets (_next, favicon, robots, etc) bypass middleware via
// the `matcher` config below.

import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareSupabaseClient } from "@/lib/auth/supabase-server";

// Run the middleware on the Node.js runtime (not the default Edge runtime).
// Supabase SSR (@supabase/ssr → @supabase/supabase-js) touches Node-only APIs
// such as `process.version`, which the Edge runtime does not support and which
// breaks the Render production build ("A Node.js API is used (process.version)
// which is not supported in the Edge Runtime"). Node.js middleware is stable in
// Next.js 15.2+, so we pin it here. Do NOT remove without making supabase-server
// edge-compatible first.
export const runtime = "nodejs";

// Note: "/" is intentionally NOT public — that's the Command Center
// dashboard. When the marketing site lands (Phase 4) we'll either move
// the dashboard to `/app` or host the marketing site on a separate
// subdomain. Until then anonymous "/" hits get bounced to /signin.
const PUBLIC_PATHS = new Set([
  "/signin",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/privacy",
  "/terms",
  "/security",
  // Public marketing landing — pre-signup.
  "/welcome",
  // /accept-invite handles its own auth gate — it redirects to /signin
  // with the right `next` if the user isn't signed in. Treat as public.
  "/accept-invite",
  // Public marketing comparison page (Hebrew) — HEB-CONTENT-DEV-01.
  "/compare-he"
]);

const PUBLIC_PREFIXES = [
  "/api/auth/",
  "/api/webhooks/",
  "/api/cron/",
  "/api/meta/data-deletion",
  // Stripe sends webhooks server-to-server; they're authenticated by
  // signature, not session cookies. Treating this as public lets the
  // signature-verifying handler run.
  "/api/billing/webhook"
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname === prefix.replace(/\/$/, "") || pathname.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

// Cron routes are session-less (the in-process schedulers self-ping them, and
// an external scheduler may hit them too). To stop anyone on the internet from
// triggering a full sync / email blast, gate /api/cron/* behind a shared
// secret: when CRON_SECRET is set, the request MUST carry a matching
// `x-cron-secret` header. When CRON_SECRET is unset (local dev), the check is
// skipped so the dev server keeps working without the var.
//
// Returns a 401 NextResponse to short-circuit with, or null to allow through.
function requireCronSecret(req: NextRequest): NextResponse | null {
  if (!req.nextUrl.pathname.startsWith("/api/cron/")) return null;

  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return null; // not configured — skip the check (dev)

  const provided = req.headers.get("x-cron-secret")?.trim();
  if (provided && provided === expected) return null; // authorized

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function middleware(req: NextRequest) {
  // Cron lock — reject unauthorized /api/cron/* hits before doing any other
  // work. Runs ahead of the public-route short-circuit so the CRON_SECRET
  // gate is not bypassed by /api/cron/ being in PUBLIC_PREFIXES.
  const cronReject = requireCronSecret(req);
  if (cronReject) return cronReject;

  // Stamp the current pathname onto a request header so server components
  // downstream (especially AppShell's paywall gate) can read it without
  // resorting to global state hacks.
  //
  // BUT: passing `request: { headers }` to NextResponse.next() is a known
  // Next.js 15 nodejs-runtime bug — it locks the underlying request body
  // stream, which breaks any route handler that later calls
  // `request.formData()` or `request.json()` ("Response body object should
  // not be disturbed or locked"). API routes never read the x-pathname
  // header (only page RSCs do, via AppShell), so we skip the rewrite for
  // /api/* and only mutate request headers on page routes.
  const isApiRoute = req.nextUrl.pathname.startsWith("/api/");
  let res: NextResponse;
  if (isApiRoute) {
    res = NextResponse.next();
  } else {
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-pathname", req.nextUrl.pathname);
    res = NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Refresh session on every request — Supabase's helper handles the
  // token rotation. For /api/* routes pass dropSetAll: true so the
  // rotated cookie write is SKIPPED — that res.cookies.set call is
  // the third known trigger of the Next.js 15 nodejs-middleware body
  // lock, and it fires unpredictably (only when Supabase happens to
  // rotate). Page routes will refresh the cookie on the next render.
  let user: { id: string } | null = null;
  try {
    const supabase = createMiddlewareSupabaseClient(req, res, { dropSetAll: isApiRoute });
    const { data } = await supabase.auth.getUser();
    user = data?.user ? { id: data.user.id } : null;
  } catch {
    // Supabase env not configured (e.g. CI). Treat as anonymous.
    user = null;
  }

  const { pathname, search } = req.nextUrl;

  // Public routes — let everything through.
  if (isPublic(pathname)) {
    // Bonus: signed-in users hitting /signin or /signup should be sent
    // home instead of seeing the form again.
    if (user && (pathname === "/signin" || pathname === "/signup")) {
      const home = req.nextUrl.clone();
      home.pathname = "/";
      home.search = "";
      return NextResponse.redirect(home);
    }
    return res;
  }

  // Protected routes — gate behind auth.
  if (!user) {
    const signin = req.nextUrl.clone();
    signin.pathname = "/signin";
    signin.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(signin);
  }

  // Note: trial-expiry paywall enforcement lives in `lib/billing/trial-gate.ts`
  // and runs as a server-component check inside AppShell. Doing it here in
  // middleware would require importing Prisma into the edge runtime, which
  // is not supported.

  return res;
}

export const config = {
  matcher: [
    // Run on every request EXCEPT:
    //   _next/static, _next/image, /favicon.ico, /robots.txt, /sitemap.xml,
    //   files with extensions (images, fonts, etc.)
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)"
  ]
};
