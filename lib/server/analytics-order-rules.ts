const IGNORED_ANALYTICS_DISCOUNT_CODES = new Set(["custom discount"]);
const MAX_IGNORED_FULFILLED_ORDER_TOTAL = 20;

function normalizeDiscountCode(code?: string | null) {
  return String(code ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function isAnalyticsDiscountCode(code?: string | null) {
  const normalized = normalizeDiscountCode(code);
  return Boolean(normalized) && !IGNORED_ANALYTICS_DISCOUNT_CODES.has(normalized);
}

export function pickAnalyticsDiscountCode(codes: Array<string | null | undefined>) {
  const match = codes.find((code) => isAnalyticsDiscountCode(code));
  return typeof match === "string" ? match : undefined;
}

export function shouldIgnoreOrderForAnalytics(order: {
  totalPrice?: number | null;
  fulfillmentStatus?: string | null;
}) {
  const fulfillmentStatus = String(order.fulfillmentStatus ?? "").trim().toUpperCase();
  const totalPrice = Number(order.totalPrice ?? 0);

  return (
    fulfillmentStatus === "FULFILLED" &&
    Number.isFinite(totalPrice) &&
    totalPrice >= 0 &&
    totalPrice <= MAX_IGNORED_FULFILLED_ORDER_TOTAL
  );
}
