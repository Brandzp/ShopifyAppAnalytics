const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Sample existing discount codes to understand format + check for NAME15/702 variants
  const [sampleCodes, allCoupons, name15Like, code702Like] = await Promise.all([
    p.discountUsage.findMany({
      select: { code: true, amount: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 20
    }),
    p.affiliateCouponAssignment.findMany({
      select: { couponCode: true, couponTitle: true, discountType: true, discountValue: true },
      take: 30
    }),
    // Case-insensitive search for NAME15 variants
    p.discountUsage.findMany({
      where: { code: { contains: "NAME", mode: 'insensitive' } },
      select: { code: true, amount: true, createdAt: true },
      take: 10
    }),
    // Search for 702 variants
    p.discountUsage.findMany({
      where: { code: { contains: "702", mode: 'insensitive' } },
      select: { code: true, amount: true, createdAt: true },
      take: 10
    })
  ]);

  console.log(JSON.stringify({
    sampleDiscountCodes: sampleCodes,
    allAffiliateCoupons: allCoupons,
    name15Variants: name15Like,
    code702Variants: code702Like
  }, null, 2));
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); }).finally(() => p.$disconnect());
