const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // DiscountUsage has 'code' (not couponCode), 'amount' (not discountRate)
  const [name15Usages, code702Usages, affiliateName15, affiliate702] = await Promise.all([
    p.discountUsage.findMany({
      where: { code: "NAME15" },
      select: {
        code: true, amount: true, createdAt: true,
        order: { select: { totalPrice: true, totalDiscounts: true, financialStatus: true } }
      },
      orderBy: { createdAt: 'desc' }
    }),
    p.discountUsage.findMany({
      where: { code: "702" },
      select: {
        code: true, amount: true, createdAt: true,
        order: { select: { totalPrice: true, totalDiscounts: true, financialStatus: true } }
      },
      orderBy: { createdAt: 'desc' }
    }),
    p.affiliateCouponAssignment.findMany({
      where: { couponCode: "NAME15" },
      select: { couponCode: true, couponTitle: true, discountType: true, discountValue: true }
    }),
    p.affiliateCouponAssignment.findMany({
      where: { couponCode: "702" },
      select: { couponCode: true, couponTitle: true, discountType: true, discountValue: true }
    })
  ]);

  const summarize = (usages) => ({
    orderCount: usages.length,
    totalRevenue: usages.reduce((s,u) => s + parseFloat(u.order?.totalPrice||0), 0).toFixed(2),
    totalDiscountsGiven: usages.reduce((s,u) => s + parseFloat(u.amount||0), 0).toFixed(2),
    avgOrderValue: usages.length ? (usages.reduce((s,u) => s + parseFloat(u.order?.totalPrice||0), 0) / usages.length).toFixed(2) : null,
    firstUsed: usages.length ? usages[usages.length-1].createdAt : null,
    lastUsed: usages.length ? usages[0].createdAt : null,
    sample: usages.slice(0,2).map(u => ({ date: u.createdAt, revenue: u.order?.totalPrice, discountAmount: u.amount }))
  });

  console.log(JSON.stringify({
    NAME15: { discountUsage: summarize(name15Usages), affiliateConfig: affiliateName15 },
    CODE702: { discountUsage: summarize(code702Usages), affiliateConfig: affiliate702 }
  }, null, 2));
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); }).finally(() => p.$disconnect());
