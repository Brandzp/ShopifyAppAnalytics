const fs = require('fs');
const sec = JSON.parse(fs.readFileSync('C:/Work/AgentsTeam/config/secrets.json', 'utf8'));
process.env.DATABASE_URL = sec.brands['brandzpAnalyticsProd'].databaseUrl;
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  try {
    const now = new Date('2026-07-06T23:59:59Z');
    const w0start = new Date('2026-06-29T00:00:00Z');
    const w1start = new Date('2026-06-22T00:00:00Z');
    const w1end = new Date('2026-06-29T00:00:00Z');
    const m0start = new Date('2026-06-06T00:00:00Z');
    const m1start = new Date('2026-05-07T00:00:00Z');
    const m1end = new Date('2026-06-06T00:00:00Z');

    const syncRun = await p.syncRun.findFirst({ orderBy: { startedAt: 'desc' } });
    const orders7d = await p.order.aggregate({ _count: { id: true }, _sum: { totalPrice: true, totalDiscounts: true }, where: { test: false, createdAt: { gte: w0start, lte: now } } });
    const orders7dPrior = await p.order.aggregate({ _count: { id: true }, _sum: { totalPrice: true, totalDiscounts: true }, where: { test: false, createdAt: { gte: w1start, lt: w1end } } });
    const orders30d = await p.order.aggregate({ _count: { id: true }, _sum: { totalPrice: true }, where: { test: false, createdAt: { gte: m0start, lte: now } } });
    const orders30dPrior = await p.order.aggregate({ _count: { id: true }, _sum: { totalPrice: true }, where: { test: false, createdAt: { gte: m1start, lt: m1end } } });
    const newCust7d = await p.customer.count({ where: { createdAt: { gte: w0start, lte: now } } });
    const newCust7dPrior = await p.customer.count({ where: { createdAt: { gte: w1start, lt: w1end } } });
    const refunds7d = await p.refund.aggregate({ _count: { id: true }, _sum: { refundedAmount: true }, where: { createdAt: { gte: w0start, lte: now } } });
    const allTime = await p.order.aggregate({ _count: { id: true }, _sum: { totalPrice: true }, where: { test: false } });
    const customers = await p.customer.count();
    const returning = await p.customer.count({ where: { isReturning: true } });
    const metaAds7d = await p.metaAdsCampaignInsight.aggregate({ _sum: { spend: true, impressions: true, clicks: true, purchases: true, purchaseRoas: true }, where: { dateStart: { gte: w0start, lte: now } } });
    const metaAds7dPrior = await p.metaAdsCampaignInsight.aggregate({ _sum: { spend: true, impressions: true, clicks: true, purchases: true, purchaseRoas: true }, where: { dateStart: { gte: w1start, lt: w1end } } });

    console.log(JSON.stringify({
      syncRun: { id: syncRun.id, type: syncRun.mode, status: syncRun.status, startedAt: syncRun.startedAt, completedAt: syncRun.completedAt },
      orders7d, orders7dPrior, orders30d, orders30dPrior,
      newCust7d, newCust7dPrior, refunds7d,
      allTime, customers, returning,
      metaAds7d, metaAds7dPrior
    }));
  } catch (e) {
    console.error('ERR', e.message);
  } finally {
    await p.$disconnect();
  }
})();
