import { roundCurrency } from "@/lib/server/numbers";

function stripGid(gid?: string | null) {
  if (!gid) return null;
  return gid.split("/").pop() ?? gid;
}

function amount(value?: { amount?: string | null } | null) {
  return roundCurrency(Number(value?.amount ?? 0));
}

function integer(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0;
}

export function mapShopMetadata(shop: any) {
  return {
    shopifyShopId: stripGid(shop.id),
    name: shop.name,
    domain: shop.myshopifyDomain,
    currency: shop.currencyCode ?? "USD",
    timezone: shop.ianaTimezone ?? "UTC",
    planName: shop.plan?.displayName ?? null
  };
}

export function mapProductNode(product: any, storeId: string) {
  const variants = product.variants?.edges?.map((edge: any) => edge.node) ?? [];
  const primaryPrice = Number(variants[0]?.price ?? 0);

  return {
    product: {
      storeId,
      shopifyProductId: stripGid(product.id),
      title: product.title,
      handle: product.handle,
      vendor: product.vendor ?? null,
      productType: product.productType ?? null,
      status: product.status ?? null,
      collection: product.productType ?? "Uncategorized",
      price: primaryPrice,
      estimatedCost: 0,
      createdAt: new Date(product.createdAt),
      updatedAt: new Date(product.updatedAt)
    },
    variants: variants.map((variant: any) => ({
      storeId,
      shopifyVariantId: stripGid(variant.id),
      sku: variant.sku ?? null,
      title: variant.title,
      price: variant.price ? Number(variant.price) : null,
      compareAtPrice: variant.compareAtPrice ? Number(variant.compareAtPrice) : null,
      inventoryQuantity: variant.inventoryQuantity ?? null
    }))
  };
}

export function mapCustomerNode(customer: any, storeId: string) {
  const firstName = customer.firstName ?? null;
  const lastName = customer.lastName ?? null;
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const totalOrders = integer(customer.numberOfOrders);

  return {
    storeId,
    shopifyCustomerId: stripGid(customer.id),
    email: customer.email ?? null,
    firstName,
    lastName,
    name: fullName || customer.email || "Unknown customer",
    createdAt: new Date(customer.createdAt),
    updatedAt: new Date(customer.updatedAt),
    totalOrders,
    lifetimeValue: amount(customer.amountSpent),
    isReturning: totalOrders > 1
  };
}

export function mapOrderNode(order: any, storeId: string, defaultCostRatio: number) {
  const refunds = order.refunds ?? [];
  const lineItems = order.lineItems?.edges?.map((edge: any) => edge.node) ?? [];
  const refundAmount = refunds.reduce(
    (total: number, refund: any) => total + amount(refund.totalRefundedSet?.shopMoney),
    0
  );

  const mappedOrder = {
    storeId,
    shopifyOrderId: stripGid(order.id),
    orderNumber: order.name,
    displayName: order.name,
    createdAt: new Date(order.createdAt),
    processedAt: order.processedAt ? new Date(order.processedAt) : null,
    currency: order.currencyCode ?? "USD",
    subtotalPrice: amount(order.subtotalPriceSet?.shopMoney),
    totalDiscounts: amount(order.totalDiscountsSet?.shopMoney),
    totalTax: amount(order.totalTaxSet?.shopMoney),
    totalShipping: amount(order.totalShippingPriceSet?.shopMoney),
    totalRefunds: refundAmount,
    totalPrice: amount(order.totalPriceSet?.shopMoney),
    financialStatus: order.displayFinancialStatus ?? null,
    fulfillmentStatus: order.displayFulfillmentStatus ?? null,
    sourceName: order.sourceName ?? null,
    updatedAt: new Date(order.updatedAt),
    shopifyCustomerId: stripGid(order.customer?.id)
  };

  const mappedLineItems = lineItems.map((lineItem: any) => {
    const originalUnitPrice = amount(lineItem.originalUnitPriceSet?.shopMoney);
    const discountedUnitPrice = amount(lineItem.discountedUnitPriceSet?.shopMoney);
    const lineSubtotal = amount(lineItem.originalTotalSet?.shopMoney);
    const discountedTotal = amount(lineItem.discountedTotalSet?.shopMoney);
    const lineDiscountAmount = roundCurrency(lineSubtotal - discountedTotal);
    const estimatedCostAmount = roundCurrency(discountedTotal * defaultCostRatio);

    return {
      storeId,
      shopifyLineItemId: stripGid(lineItem.id),
      shopifyProductId: stripGid(lineItem.product?.id),
      shopifyVariantId: stripGid(lineItem.variant?.id),
      title: lineItem.title,
      quantity: lineItem.quantity,
      originalUnitPrice,
      discountedUnitPrice,
      lineSubtotal,
      lineDiscountAmount,
      estimatedCostAmount
    };
  });

  const mappedDiscounts = Array.from(new Set(
    order.discountApplications?.edges
      ?.map((edge: any) => edge.node)
      ?.map((discount: any) => String(discount.code ?? discount.title ?? "Untitled discount").trim())
      ?.filter(Boolean) ?? []
  )).map((code) => ({ code }));

  const mappedRefunds = refunds.map((refund: any) => ({
    shopifyRefundId: stripGid(refund.id),
    refundedAmount: amount(refund.totalRefundedSet?.shopMoney),
    refundedLineItemsAmount:
      refund.refundLineItems?.edges?.reduce(
        (total: number, edge: any) => total + amount(edge.node.subtotalSet?.shopMoney),
        0
      ) ?? 0,
    createdAt: new Date(refund.createdAt)
  }));

  return {
    order: mappedOrder,
    lineItems: mappedLineItems,
    discounts: mappedDiscounts,
    refunds: mappedRefunds
  };
}

