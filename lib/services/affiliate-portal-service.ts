import type {
  AffiliateContentPerformance,
  AffiliateConversion,
  AffiliateCoupon,
  AffiliatePayout,
  AffiliatePortalDashboardPayload,
  AffiliatePortalSettings,
  AffiliateProfile,
  AffiliateProgram
} from "@/lib/domain/affiliate-portal-types";
import { getDb } from "@/lib/server/db";
import { resolveOrCreateBaseStore } from "@/lib/services/creator-admin-service";

const program: AffiliateProgram = {
  id: "program-1",
  name: "משפיענים",
  status: "active",
  defaultCommissionRate: 10,
  affiliates: 29,
  orders: 5628,
  sales: 1018852.99,
  signUpLink: "https://portal.example.com/register",
  checklist: [
    { id: "embedded", title: "Enable app embed", done: false, group: "launch" },
    { id: "program", title: "Create a program", done: true, group: "launch" },
    { id: "brand", title: "Add brand identity", done: true, group: "launch" },
    { id: "payments", title: "Add payment method", done: false, group: "launch" },
    { id: "portal", title: "Design portal pages", done: false, group: "launch" },
    { id: "emails", title: "Review email automation", done: false, group: "launch" },
    { id: "first-affiliate", title: "Add the first affiliate", done: true, group: "test" },
    { id: "first-conversion", title: "Get the first conversion", done: true, group: "test" },
    { id: "landing", title: "Showcase landing page on your store", done: false, group: "promote" },
    { id: "reachout", title: "Reach out to potential affiliates", done: false, group: "promote" }
  ]
};

const affiliates: AffiliateProfile[] = [
  { id: "aff-adel", firstName: "Adel", lastName: "Bespalov", email: "adelbespalov9@gmail.com", programName: "משפיענים", status: "approved", dateJoined: "2026-03-18T15:15:00.000Z", lastLogin: "2026-03-24T09:18:00.000Z", source: "Signup", country: "Israel", clicks: 2482, orders: 88, sales: 74298.01, commission: 7429.8, approvedBalance: 1800, affiliateCode: "ADEL", couponCode: "ADEL40", referralLink: "https://northstargoods.com/?ref=adel&coupon=ADEL40&utm_source=affiliate", shortLink: "https://portal.nsg.co/a/adel" },
  { id: "aff-talia", firstName: "Talia", lastName: "Sol", email: "talia@example.com", programName: "משפיענים", status: "approved", dateJoined: "2026-02-24T14:41:00.000Z", lastLogin: "2026-03-24T08:46:00.000Z", source: "Signup", country: "Israel", clicks: 2132, orders: 72, sales: 52372.89, commission: 5237.29, approvedBalance: 920, affiliateCode: "TALIA", couponCode: "TALIA40", referralLink: "https://northstargoods.com/?ref=talia&coupon=TALIA40&utm_source=affiliate", shortLink: "https://portal.nsg.co/a/talia" },
  { id: "aff-lihi", firstName: "Lihi", lastName: "Grossman", email: "lihi@example.com", programName: "משפיענים", status: "approved", dateJoined: "2025-08-21T07:56:00.000Z", lastLogin: "2026-03-23T22:59:00.000Z", source: "Signup", country: "Israel", clicks: 9223, orders: 1508, sales: 117650.56, commission: 11765.05, approvedBalance: 0, affiliateCode: "LIHI", couponCode: "LIHI40", referralLink: "https://northstargoods.com/?ref=lihi&coupon=LIHI40&utm_source=affiliate", shortLink: "https://portal.nsg.co/a/lihi" },
  { id: "aff-sapir", firstName: "Sapir", lastName: "Glick", email: "sapir@example.com", programName: "משפיענים", status: "approved", dateJoined: "2025-02-11T18:01:00.000Z", lastLogin: "2026-03-21T22:04:00.000Z", source: "Signup", country: "Israel", clicks: 1644, orders: 44, sales: 21060, commission: 2106, approvedBalance: 0, affiliateCode: "SAPIR", couponCode: "SAPIR40", referralLink: "https://northstargoods.com/?ref=sapir&coupon=SAPIR40&utm_source=affiliate", shortLink: "https://portal.nsg.co/a/sapir" },
  { id: "aff-anat", firstName: "Anat", lastName: "Azulay", email: "anat@example.com", programName: "משפיענים", status: "approved", dateJoined: "2025-10-21T11:47:00.000Z", lastLogin: "2026-03-23T01:02:00.000Z", source: "Add manual", country: "Israel", clicks: 1390, orders: 31, sales: 16203.13, commission: 1620.31, approvedBalance: 0, affiliateCode: "ANAT", couponCode: "ANAT40", referralLink: "https://northstargoods.com/?ref=anat&coupon=ANAT40&utm_source=affiliate", shortLink: "https://portal.nsg.co/a/anat" },
  { id: "aff-noa", firstName: "Noa", lastName: "Zvulun", email: "noa@example.com", programName: "משפיענים", status: "pending", dateJoined: "2026-03-18T15:15:00.000Z", lastLogin: null, source: "Signup", country: "Israel", clicks: 0, orders: 0, sales: 0, commission: 0, approvedBalance: 0, affiliateCode: "NOA", couponCode: null, referralLink: "https://northstargoods.com/?ref=noa&utm_source=affiliate", shortLink: "https://portal.nsg.co/a/noa" }
];

const coupons: AffiliateCoupon[] = affiliates.filter((affiliate) => affiliate.couponCode).map((affiliate, index) => ({ id: `coupon-${affiliate.id}`, code: affiliate.couponCode as string, affiliateId: affiliate.id, affiliateName: `${affiliate.firstName} ${affiliate.lastName}`, status: "active", template: "ALMOND & MACADAMIA", note: index % 2 === 0 ? "Push creator landing page" : null, createdAt: new Date(Date.now() - 86400000 * (index + 2)).toISOString(), discountLabel: "₪70.40 off ALMOND & MACADAMIA", applyLink: affiliate.referralLink }));

const conversions: AffiliateConversion[] = [
  { id: "conv-10103", orderNumber: "#10103", date: "2026-03-24T09:18:00.000Z", affiliateId: "aff-sara", affiliateName: "Sara Basan", total: 154.1, commission: 15.41, status: "approved", trackingBy: "Link", sourceUrl: "https://instagram.com", contentTitle: "Morning routine reel" },
  { id: "conv-10102", orderNumber: "#10102", date: "2026-03-24T08:46:00.000Z", affiliateId: "aff-talia", affiliateName: "Talia Sol", total: 219.49, commission: 21.95, status: "approved", trackingBy: "Link & coupon", sourceUrl: "https://instagram.com", contentTitle: "Bundle story set" },
  { id: "conv-10100", orderNumber: "#10100", date: "2026-03-24T08:27:00.000Z", affiliateId: "aff-talia", affiliateName: "Talia Sol", total: 219.49, commission: 21.95, status: "approved", trackingBy: "Link & coupon", sourceUrl: "https://instagram.com", contentTitle: "Offer close friends story" },
  { id: "conv-10098", orderNumber: "#10098", date: "2026-03-24T05:48:00.000Z", affiliateId: "aff-adel", affiliateName: "Adel Bespalov", total: 219.49, commission: 21.95, status: "approved", trackingBy: "Link & coupon", sourceUrl: "https://www.adel.com", contentTitle: "Recovery hoodie styling reel" },
  { id: "conv-10094", orderNumber: "#10094", date: "2026-03-23T23:34:00.000Z", affiliateId: "aff-talia", affiliateName: "Talia Sol", total: 219.49, commission: 21.95, status: "approved", trackingBy: "Link & coupon", sourceUrl: "https://facebook.com", contentTitle: "UGC try-on carousel" },
  { id: "conv-10093", orderNumber: "#10093", date: "2026-03-23T22:59:00.000Z", affiliateId: "aff-lihi", affiliateName: "Lihi Grossman", total: 219.49, commission: 21.95, status: "approved", trackingBy: "Link & coupon", sourceUrl: "https://instagram.com", contentTitle: "Founder capsule try-on" }
];

const payouts: AffiliatePayout[] = [
  { id: "pay-lihi", affiliateId: "aff-lihi", affiliateName: "Lihi Grossman", paymentMethod: "Missing info", approvedOrders: 1508, approvedBalance: 0 },
  { id: "pay-star", affiliateId: "aff-star", affiliateName: "Star Rahum", paymentMethod: "Missing info", approvedOrders: 61, approvedBalance: 0 },
  { id: "pay-sapir", affiliateId: "aff-sapir", affiliateName: "Sapir Glick", paymentMethod: "Missing info", approvedOrders: 104, approvedBalance: 0 },
  { id: "pay-sara", affiliateId: "aff-sara", affiliateName: "Sara Basan", paymentMethod: "Missing info", approvedOrders: 160, approvedBalance: 0 }
];

const contentPerformance: AffiliateContentPerformance[] = [
  { id: "content-1", affiliateId: "aff-adel", affiliateName: "Adel Bespalov", platform: "Instagram", title: "Recovery hoodie styling reel", contentType: "Reel", postedAt: "2026-03-21T10:00:00.000Z", views: 18400, likes: 1260, comments: 84, clicks: 438, orders: 19, sales: 2140 },
  { id: "content-2", affiliateId: "aff-talia", affiliateName: "Talia Sol", platform: "Instagram", title: "Bundle story set", contentType: "Story", postedAt: "2026-03-22T18:00:00.000Z", views: 12100, likes: 980, comments: 52, clicks: 372, orders: 14, sales: 1580 },
  { id: "content-3", affiliateId: "aff-lihi", affiliateName: "Lihi Grossman", platform: "Instagram", title: "Founder capsule try-on", contentType: "Carousel", postedAt: "2026-03-18T12:00:00.000Z", views: 9400, likes: 720, comments: 37, clicks: 210, orders: 9, sales: 970 },
  { id: "content-4", affiliateId: "aff-sapir", affiliateName: "Sapir Glick", platform: "Instagram", title: "Electrolyte morning routine", contentType: "Reel", postedAt: "2026-03-17T07:30:00.000Z", views: 8700, likes: 605, comments: 28, clicks: 188, orders: 6, sales: 660 },
  { id: "content-5", affiliateId: "aff-anat", affiliateName: "Anat Azulay", platform: "Instagram", title: "Customer testimonial story", contentType: "Story", postedAt: "2026-03-14T16:10:00.000Z", views: 4300, likes: 120, comments: 9, clicks: 44, orders: 1, sales: 154.1 }
];

const trend = [
  { date: "20 בפבר'", sales: 4600, clicks: 220, orders: 14 },
  { date: "24 בפבר'", sales: 5200, clicks: 260, orders: 18 },
  { date: "28 בפבר'", sales: 4300, clicks: 205, orders: 12 },
  { date: "4 במרץ", sales: 3900, clicks: 198, orders: 11 },
  { date: "8 במרץ", sales: 6100, clicks: 310, orders: 20 },
  { date: "12 במרץ", sales: 15800, clicks: 660, orders: 52 },
  { date: "16 במרץ", sales: 40120, clicks: 1420, orders: 131 },
  { date: "18 במרץ", sales: 42800, clicks: 1630, orders: 146 },
  { date: "22 במרץ", sales: 12640, clicks: 550, orders: 45 },
  { date: "24 במרץ", sales: 7400, clicks: 312, orders: 24 }
];

const settings: AffiliatePortalSettings = {
  portalLanguage: "עברית / English",
  brandingName: "After Shower",
  storeDomain: "4k7qk0-0j.myshopify.com",
  senderName: "Northstar Creator Team",
  senderEmail: "no-reply@northstargoods.com",
  inviteAutomationEnabled: true,
  referralOrderEmailEnabled: true,
  couponAssignmentEnabled: true,
  advanced: { collectTaxForms: false, trackPendingOrders: true, webhookReady: true }
};

async function getAffiliateStore() {
  try {
    return await resolveOrCreateBaseStore();
  } catch {
    return null;
  }
}

async function loadAffiliatesFromDb() {
  const db = getDb();
  const store = await getAffiliateStore();
  if (!db || !store || !db.affiliateMember) return null;
  try {
    const rows = await db.affiliateMember.findMany({ include: { program: true }, where: { storeId: store.id }, orderBy: { salesTotal: "desc" } });
    if (!rows.length) return null;
    return rows.map((row: any) => ({
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      programName: row.program?.name ?? "משפיענים",
      status: row.status,
      dateJoined: row.joinedAt.toISOString(),
      lastLogin: row.lastLoginAt?.toISOString() ?? null,
      source: row.source ?? "Signup",
      country: row.country ?? "Israel",
      clicks: row.clicksTotal ?? 0,
      orders: row.ordersTotal ?? 0,
      sales: Number(row.salesTotal ?? 0),
      commission: Number(row.commissionTotal ?? 0),
      approvedBalance: Number(row.approvedBalance ?? 0),
      affiliateCode: row.affiliateCode,
      couponCode: row.couponCode ?? null,
      referralLink: row.referralLink ?? `https://${store.domain}/?ref=${row.affiliateCode}`,
      shortLink: row.shortLink ?? `https://portal.${store.domain}/a/${row.affiliateCode.toLowerCase()}`
    })) as AffiliateProfile[];
  } catch {
    return null;
  }
}

async function loadCouponsFromDb() {
  const db = getDb();
  const store = await getAffiliateStore();
  if (!db || !store || !db.affiliateCoupon) return null;
  try {
    const rows = await db.affiliateCoupon.findMany({ where: { storeId: store.id }, include: { affiliateMember: true }, orderBy: { createdAt: "desc" } });
    if (!rows.length) return null;
    return rows.map((row: any) => ({
      id: row.id,
      code: row.code,
      affiliateId: row.affiliateMemberId ?? "",
      affiliateName: row.affiliateMember ? `${row.affiliateMember.firstName} ${row.affiliateMember.lastName}` : "-",
      status: row.status,
      template: row.title,
      note: null,
      createdAt: row.createdAt.toISOString(),
      discountLabel: row.discountType === "percent" ? `${Number(row.discountValue)}% off` : `₪${Number(row.discountValue)} off`,
      applyLink: row.applyLink ?? `https://${store.domain}/discount/${row.code}?redirect=%2F`
    })) as AffiliateCoupon[];
  } catch {
    return null;
  }
}

async function loadConversionsFromDb() {
  const db = getDb();
  const store = await getAffiliateStore();
  if (!db || !store || !db.affiliateAttribution) return null;
  try {
    const rows = await db.affiliateAttribution.findMany({ where: { storeId: store.id }, include: { affiliateMember: true, order: true }, orderBy: { occurredAt: "desc" } });
    if (!rows.length) return null;
    return rows.map((row: any) => ({
      id: row.id,
      orderNumber: row.order?.orderNumber ?? row.orderId ?? "-",
      date: row.occurredAt.toISOString(),
      affiliateId: row.affiliateMemberId,
      affiliateName: `${row.affiliateMember.firstName} ${row.affiliateMember.lastName}`,
      total: Number(row.salesAmount ?? 0),
      commission: Number(row.commissionAmount ?? 0),
      status: "approved",
      trackingBy: row.trackingMethod ?? "Link & coupon",
      sourceUrl: row.sourceUrl ?? "-",
      contentTitle: row.contentTitle ?? null
    })) as AffiliateConversion[];
  } catch {
    return null;
  }
}

async function loadContentFromDb() {
  const db = getDb();
  const store = await getAffiliateStore();
  if (!db || !store || !db.creatorPost) return null;
  try {
    const rows = await db.creatorPost.findMany({ where: { storeId: store.id }, include: { creatorProfile: true }, orderBy: { postedAt: "desc" }, take: 20 });
    if (!rows.length) return null;
    return rows.map((row: any) => ({
      id: row.id,
      affiliateId: row.creatorProfileId ?? row.id,
      affiliateName: row.creatorProfile?.displayName ?? row.creatorProfile?.username ?? "Affiliate creator",
      platform: "Instagram",
      title: row.caption ?? "Untitled content",
      contentType: row.mediaType ?? "Media",
      postedAt: row.postedAt.toISOString(),
      views: row.viewCount ?? 0,
      likes: row.likeCount ?? 0,
      comments: row.commentsCount ?? 0,
      clicks: 0,
      orders: row.attributedOrders ?? 0,
      sales: Number(row.attributedSales ?? 0)
    })) as AffiliateContentPerformance[];
  } catch {
    return null;
  }
}

async function loadProgramFromDb() {
  const db = getDb();
  const store = await getAffiliateStore();
  if (!db || !store || !db.affiliateProgram) return null;
  try {
    const row = await db.affiliateProgram.findFirst({ where: { storeId: store.id }, include: { members: true } });
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      defaultCommissionRate: Number(row.commissionRate ?? 0) * 100,
      affiliates: row.members.length,
      orders: row.members.reduce((sum: number, member: any) => sum + Number(member.ordersTotal ?? 0), 0),
      sales: row.members.reduce((sum: number, member: any) => sum + Number(member.salesTotal ?? 0), 0),
      signUpLink: row.signUpLink ?? `https://${store.domain}/pages/affiliate-signup`,
      checklist: program.checklist
    } as AffiliateProgram;
  } catch {
    return null;
  }
}

export async function getAffiliatePortalDashboard(): Promise<AffiliatePortalDashboardPayload> {
  const [programFromDb, affiliatesFromDb, conversionsFromDb, contentFromDb] = await Promise.all([
    loadProgramFromDb(),
    loadAffiliatesFromDb(),
    loadConversionsFromDb(),
    loadContentFromDb()
  ]);
  const affiliateRows = affiliatesFromDb ?? affiliates;
  const conversionRows = conversionsFromDb ?? conversions;
  const contentRows = contentFromDb ?? contentPerformance;
  const store = await getAffiliateStore();
  const activeProgram = {
    ...(programFromDb ?? program),
    signUpLink: (programFromDb ?? program).signUpLink.includes("example.com") && store ? `https://${store.domain}/pages/affiliate-signup` : (programFromDb ?? program).signUpLink
  };

  return {
    program: activeProgram,
    totals: {
      totalSales: affiliateRows.reduce((sum, item) => sum + item.sales, 0),
      totalOrders: affiliateRows.reduce((sum, item) => sum + item.orders, 0),
      totalClicks: affiliateRows.reduce((sum, item) => sum + item.clicks, 0),
      totalAffiliates: affiliateRows.length,
      totalCommission: affiliateRows.reduce((sum, item) => sum + item.commission, 0)
    },
    trend,
    topAffiliatesBySales: [...affiliateRows].sort((a, b) => b.sales - a.sales).slice(0, 5),
    topAffiliatesByClicks: [...affiliateRows].sort((a, b) => b.clicks - a.clicks).slice(0, 5),
    topProducts: [
      { name: "ALMOND & MACADAMIA", sales: 135615 },
      { name: "PURE SILK", sales: 34312 },
      { name: "RECOVERY HOODIE", sales: 29780 },
      { name: "NIGHT ROUTINE KIT", sales: 24860 }
    ],
    topReferralSources: [
      { label: "instagram.com", clicks: 12108 },
      { label: "www.adel.com", clicks: 920 },
      { label: "facebook.com", clicks: 727 },
      { label: "after-shower.com", clicks: 429 },
      { label: "tiktok.com", clicks: 381 }
    ],
    contentHighlights: [...contentRows].sort((a, b) => b.sales - a.sales).slice(0, 4)
  };
}

export async function getAffiliatePrograms() {
  return [await loadProgramFromDb() ?? program];
}

export async function getAffiliates() {
  return (await loadAffiliatesFromDb()) ?? affiliates;
}

export async function getAffiliateById(affiliateId: string) {
  const [affiliateRows, couponRows, conversionRows, contentRows] = await Promise.all([
    getAffiliates(),
    getAffiliateCoupons(),
    getAffiliateConversions(),
    getAffiliateContentPerformance()
  ]);
  const affiliate = affiliateRows.find((item) => item.id === affiliateId) ?? null;
  if (!affiliate) return null;

  return {
    affiliate,
    coupons: couponRows.filter((item) => item.affiliateId === affiliateId),
    conversions: conversionRows.filter((item) => item.affiliateId === affiliateId),
    content: contentRows.filter((item) => item.affiliateId === affiliateId)
  };
}

export async function getAffiliateCoupons() {
  return (await loadCouponsFromDb()) ?? coupons;
}

export async function getAffiliateConversions() {
  return (await loadConversionsFromDb()) ?? conversions;
}

export async function getAffiliatePayouts() {
  const affiliateRows = await getAffiliates();
  const realRows = affiliateRows.filter((item) => item.approvedBalance >= 0).map((item) => ({
    id: `pay-${item.id}`,
    affiliateId: item.id,
    affiliateName: `${item.firstName} ${item.lastName}`,
    paymentMethod: item.approvedBalance > 0 ? "Ready for payout" : "Missing info",
    approvedOrders: item.orders,
    approvedBalance: item.approvedBalance
  }));
  return realRows.length ? realRows : payouts;
}

export async function getAffiliateContentPerformance() {
  return (await loadContentFromDb()) ?? contentPerformance;
}

export async function getAffiliatePortalSettings() {
  const store = await getAffiliateStore();
  if (!store) return settings;
  return {
    ...settings,
    storeDomain: store.domain,
    brandingName: store.name
  };
}

export async function getCouponTemplates() {
  return [
    { id: "tpl-almond", name: "ALMOND & MACADAMIA", discountType: "fixed", value: 70.4 },
    { id: "tpl-welcome", name: "WELCOME15", discountType: "percent", value: 15 },
    { id: "tpl-founder", name: "FOUNDER20", discountType: "percent", value: 20 }
  ];
}
