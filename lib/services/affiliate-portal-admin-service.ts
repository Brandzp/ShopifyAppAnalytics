import { getDb } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import { getStoredShopifyCredentials } from "@/lib/services/shopify-connection-service";
import { createShopifyClient } from "@/lib/shopify/client";
import { DISCOUNT_CODE_BASIC_CREATE_MUTATION } from "@/lib/shopify/queries/discounts";
import { resolveOrCreateBaseStore } from "@/lib/services/creator-admin-service";

const defaultAffiliates = [
  { affiliateCode: "ADEL", firstName: "Adel", lastName: "Bespalov", email: "adelbespalov9@gmail.com", status: "approved", source: "Signup", country: "Israel", couponCode: "ADEL40", referralLink: "https://northstargoods.com/?ref=adel&coupon=ADEL40&utm_source=affiliate", shortLink: "https://portal.nsg.co/a/adel" },
  { affiliateCode: "TALIA", firstName: "Talia", lastName: "Sol", email: "talia@example.com", status: "approved", source: "Signup", country: "Israel", couponCode: "TALIA40", referralLink: "https://northstargoods.com/?ref=talia&coupon=TALIA40&utm_source=affiliate", shortLink: "https://portal.nsg.co/a/talia" },
  { affiliateCode: "LIHI", firstName: "Lihi", lastName: "Grossman", email: "lihi@example.com", status: "approved", source: "Signup", country: "Israel", couponCode: "LIHI40", referralLink: "https://northstargoods.com/?ref=lihi&coupon=LIHI40&utm_source=affiliate", shortLink: "https://portal.nsg.co/a/lihi" }
];

async function getStoreOrThrow(storeId?: string) {
  const db = getDb();
  if (!db) throw new AppError("Database client is not available.", 500);
  const store = storeId
    ? await db.store.findUnique({ where: { id: storeId } })
    : await resolveOrCreateBaseStore();
  if (!store) throw new AppError("Store was not found.", 404);
  return { db, store };
}

export async function ensureAffiliateProgramSeed(storeId?: string) {
  const { db, store } = await getStoreOrThrow(storeId);

  if (db.affiliateProgram) {
    const program = await db.affiliateProgram.upsert({
      where: { id: `${store.id}-default-program` },
      update: { name: "ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬ÂÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â", status: "active", commissionRate: 0.1 },
      create: {
        id: `${store.id}-default-program`,
        storeId: store.id,
        name: "ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬ÂÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â",
        status: "active",
        commissionRate: 0.1,
        signUpLink: `https://${store.domain}/pages/affiliate-signup`
      }
    });

    for (const affiliate of defaultAffiliates) {
      await db.affiliateMember.upsert({
        where: { storeId_email: { storeId: store.id, email: affiliate.email } },
        update: {
          firstName: affiliate.firstName,
          lastName: affiliate.lastName,
          status: affiliate.status,
          source: affiliate.source,
          country: affiliate.country,
          affiliateCode: affiliate.affiliateCode,
          couponCode: affiliate.couponCode,
          referralLink: affiliate.referralLink,
          shortLink: affiliate.shortLink,
          programId: program.id
        },
        create: {
          storeId: store.id,
          programId: program.id,
          firstName: affiliate.firstName,
          lastName: affiliate.lastName,
          email: affiliate.email,
          status: affiliate.status,
          source: affiliate.source,
          country: affiliate.country,
          affiliateCode: affiliate.affiliateCode,
          couponCode: affiliate.couponCode,
          referralLink: affiliate.referralLink,
          shortLink: affiliate.shortLink
        }
      });
    }
  }

  return { ok: true, storeId: store.id };
}

export async function createAffiliateCouponInShopify(input: {
  storeId?: string;
  affiliateId: string;
  code: string;
  title: string;
  discountType: "percent" | "fixed";
  value: number;
  appliesOncePerCustomer?: boolean;
  redirectPath?: string;
}) {
  const { db, store } = await getStoreOrThrow(input.storeId);
  await ensureAffiliateProgramSeed(store.id);

  if (!db.affiliateMember) {
    throw new AppError("Affiliate tables are not ready. Run Prisma generate and db push first.", 500);
  }

  const affiliate = await db.affiliateMember.findUnique({ where: { id: input.affiliateId } });
  if (!affiliate) throw new AppError("Affiliate was not found.", 404);

  const credentials = await getStoredShopifyCredentials(store.id);
  const client = createShopifyClient(credentials);

  const valuePayload = input.discountType === "percent"
    ? { percentage: Math.max(0.01, Math.min(1, input.value / 100)) }
    : { discountAmount: { amount: input.value, appliesOnEachItem: false } };

  const result = await client.request<{
    discountCodeBasicCreate: {
      codeDiscountNode?: {
        id: string;
        codeDiscount?: {
          title?: string;
          status?: string;
          shareableUrls?: { url: string }[];
          codes?: { nodes?: { code: string }[] };
        };
      };
      userErrors: { message: string }[];
    };
  }>(DISCOUNT_CODE_BASIC_CREATE_MUTATION, {
    basicCodeDiscount: {
      title: input.title,
      code: input.code,
      startsAt: new Date().toISOString(),
      appliesOncePerCustomer: input.appliesOncePerCustomer ?? true,
      customerGets: {
        items: { all: true },
        value: valuePayload
      },
      context: { all: true }
    }
  });

  const userErrors = result.discountCodeBasicCreate.userErrors ?? [];
  if (userErrors.length) {
    throw new AppError(userErrors.map((item) => item.message).join("; "), 400);
  }

  const discountNode = result.discountCodeBasicCreate.codeDiscountNode;
  const createdCode = discountNode?.codeDiscount?.codes?.nodes?.[0]?.code ?? input.code;
  const shareableUrl = discountNode?.codeDiscount?.shareableUrls?.[0]?.url ?? `https://${store.domain}/discount/${createdCode}?redirect=${encodeURIComponent(input.redirectPath ?? "/")}`;
  const applyLink = `${shareableUrl}${shareableUrl.includes("?") ? "&" : "?"}ref=${affiliate.affiliateCode}`;

  if (db.affiliateCoupon) {
    await db.affiliateCoupon.upsert({
      where: { storeId_code: { storeId: store.id, code: createdCode } },
      update: {
        affiliateMemberId: affiliate.id,
        shopifyDiscountId: discountNode?.id ?? null,
        title: input.title,
        discountType: input.discountType,
        discountValue: input.value,
        appliesOncePerCustomer: input.appliesOncePerCustomer ?? true,
        applyLink,
        status: "active"
      },
      create: {
        storeId: store.id,
        affiliateMemberId: affiliate.id,
        shopifyDiscountId: discountNode?.id ?? null,
        title: input.title,
        code: createdCode,
        discountType: input.discountType,
        discountValue: input.value,
        appliesOncePerCustomer: input.appliesOncePerCustomer ?? true,
        applyLink,
        status: "active"
      }
    });

    await db.affiliateMember.update({
      where: { id: affiliate.id },
      data: { couponCode: createdCode }
    });
  }

  return {
    ok: true,
    affiliateId: affiliate.id,
    code: createdCode,
    applyLink,
    shopifyDiscountId: discountNode?.id ?? null
  };
}

export async function syncAffiliateAttributionFromOrders(storeId?: string) {
  const { db, store } = await getStoreOrThrow(storeId);
  await ensureAffiliateProgramSeed(store.id);

  if (!db.affiliateMember || !db.order || !db.affiliateAttribution) {
    throw new AppError("Affiliate tables are not ready. Run Prisma generate and db push first.", 500);
  }

  const [members, coupons, orders] = await Promise.all([
    db.affiliateMember.findMany({ where: { storeId: store.id } }),
    db.affiliateCoupon.findMany({ where: { storeId: store.id } }).catch(() => []),
    db.order.findMany({ where: { storeId: store.id }, include: { discountUsages: true }, orderBy: { createdAt: "desc" } })
  ]);

  let synced = 0;

  for (const order of orders) {
    const orderCodes = (order.discountUsages ?? []).map((item: any) => item.code?.toUpperCase()).filter(Boolean);
    const matchedMember = members.find((member: any) => {
      const memberCode = member.couponCode?.toUpperCase();
      const affiliateCode = member.affiliateCode?.toUpperCase();
      const couponMatch = memberCode && orderCodes.includes(memberCode);
      const couponTableMatch = coupons.some((coupon: any) => coupon.affiliateMemberId === member.id && orderCodes.includes(String(coupon.code).toUpperCase()));
      const affiliateCodeMatch = affiliateCode && orderCodes.some((code: string) => code.includes(affiliateCode));
      return couponMatch || couponTableMatch || affiliateCodeMatch;
    });

    if (!matchedMember) continue;

    const commissionAmount = Number(order.totalPrice) * 0.1;

    await db.affiliateAttribution.upsert({
      where: { affiliateMemberId_orderId: { affiliateMemberId: matchedMember.id, orderId: order.id } },
      update: {
        sourceType: orderCodes.length ? "coupon" : "link",
        trackingMethod: orderCodes.length ? "link_and_coupon" : "link",
        salesAmount: order.totalPrice,
        commissionAmount,
        ordersCount: 1,
        occurredAt: order.createdAt
      },
      create: {
        storeId: store.id,
        affiliateMemberId: matchedMember.id,
        orderId: order.id,
        sourceType: orderCodes.length ? "coupon" : "link",
        trackingMethod: orderCodes.length ? "link_and_coupon" : "link",
        salesAmount: order.totalPrice,
        commissionAmount,
        ordersCount: 1,
        occurredAt: order.createdAt
      }
    });

    synced += 1;
  }

  const attributionRows = await db.affiliateAttribution.findMany({ where: { storeId: store.id } });

  for (const member of members) {
    const memberRows = attributionRows.filter((row: any) => row.affiliateMemberId === member.id);
    const salesTotal = memberRows.reduce((sum: number, row: any) => sum + Number(row.salesAmount ?? 0), 0);
    const commissionTotal = memberRows.reduce((sum: number, row: any) => sum + Number(row.commissionAmount ?? 0), 0);
    const ordersTotal = memberRows.reduce((sum: number, row: any) => sum + Number(row.ordersCount ?? 0), 0);

    await db.affiliateMember.update({
      where: { id: member.id },
      data: {
        salesTotal,
        commissionTotal,
        approvedBalance: commissionTotal,
        ordersTotal
      }
    });
  }

  return {
    ok: true,
    syncedOrders: synced,
    affiliatesMatched: new Set(attributionRows.map((row: any) => row.affiliateMemberId)).size
  };
}
