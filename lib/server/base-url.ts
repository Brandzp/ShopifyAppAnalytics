// Shared helpers for resolving the app's base URL.
//
// Two flavors with different rules:
//
//   • getInternalBaseUrl(request)
//     The URL the app should use when calling ITSELF — typically from a
//     server-side fetch, a cron tick to a worker route, or a headless
//     browser loopback (e.g. PDF rendering). Always derived from the
//     incoming request so it survives dev port shuffles ("port 3000 in
//     use, falling back to 3001"). Never read APP_URL here — that's
//     for outbound public links and can drift from the bound port.
//
//   • getPublicBaseUrl()
//     The canonical public URL of the app — what you embed in OAuth
//     callback URLs, affiliate redirects, emails. Driven by APP_URL
//     because the public hostname can differ from the local listener
//     (e.g. behind a load balancer / custom domain). Throws if APP_URL
//     is missing AND no fallback is provided, because guessing here
//     usually produces wrong OAuth registrations silently.

export function getInternalBaseUrl(request: Request): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export function getPublicBaseUrl(fallback?: string): string {
  const value = (process.env.APP_URL ?? "").trim();
  if (value) return value.replace(/\/$/, "");
  if (fallback) return fallback.replace(/\/$/, "");
  throw new Error("APP_URL is not set. Configure it in .env to generate outbound public URLs.");
}
