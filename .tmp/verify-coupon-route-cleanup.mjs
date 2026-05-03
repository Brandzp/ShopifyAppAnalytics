import { PrismaClient } from '@prisma/client';
import { getStoredShopifyCredentials } from '../lib/services/shopify-connection-service.ts';
import { createShopifyClient } from '../lib/shopify/client.ts';

const prisma = new PrismaClient();
const storeId = 'cmojkfeyn0020nb1wzpx623q9';
const code = `CODEX-ROUTE-${Date.now()}`;

try {
  const affiliate = await prisma.affiliateMember.findFirst({ where: { storeId }, orderBy: { createdAt: 'asc' } });
  if (!affiliate) {
    throw new Error('No affiliate found for route verification.');
  }

  const previousCouponCode = affiliate.couponCode;
  const response = await fetch('http://127.0.0.1:3000/api/affiliate-portal/coupons/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeId,
      affiliateId: affiliate.id,
      code,
      title: code,
      creationMode: 'create',
      discountType: 'percent',
      value: 15,
      appliesOncePerCustomer: true,
      redirectPath: '/products/parfum-10',
      assignmentMode: 'single',
      purchaseType: 'one_time',
      appliesToType: 'all',
      minimumRequirementType: 'none',
      customerEligibilityType: 'all',
      usageLimit: 1,
      combinesWith: {
        productDiscounts: false,
        orderDiscounts: false,
        shippingDiscounts: false
      }
    })
  });

  const payload = await response.json();
  let deletedDiscountId = null;

  if (response.ok && payload?.ok) {
    const coupon = await prisma.affiliateCoupon.findUnique({
      where: { storeId_code: { storeId, code } }
    });

    if (coupon?.shopifyDiscountId) {
      const credentials = await getStoredShopifyCredentials(storeId);
      const client = createShopifyClient({ ...credentials, apiVersion: '2026-01' });
      const deleteResult = await client.request(`mutation DeleteDiscountCode($id: ID!) { discountCodeDelete(id: $id) { deletedCodeDiscountId userErrors { message } } }`, {
        id: coupon.shopifyDiscountId
      });
      deletedDiscountId = deleteResult.discountCodeDelete?.deletedCodeDiscountId ?? null;
    }

    await prisma.affiliateCouponAssignment.deleteMany({ where: { storeId, couponCode: code } });
    await prisma.affiliateCoupon.deleteMany({ where: { storeId, code } });
    await prisma.affiliateMember.update({ where: { id: affiliate.id }, data: { couponCode: previousCouponCode } });
  }

  console.log(JSON.stringify({
    affiliateId: affiliate.id,
    status: response.status,
    payload,
    deletedDiscountId
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
