import type { CreatorAnalyticsPayload } from "@/lib/domain/creator-types";
import { getDb } from "@/lib/server/db";
import { resolveOrCreateBaseStore } from "@/lib/services/creator-admin-service";

const mockPosts = [
  {
    id: "mock-post-1",
    caption: "Recovery hoodie styling reel",
    permalink: "#",
    mediaType: "VIDEO",
    postedAt: new Date().toISOString(),
    likes: 1260,
    comments: 84,
    views: 18400,
    attributedSales: 2140,
    attributedOrders: 19
  },
  {
    id: "mock-post-2",
    caption: "Daily electrolyte routine",
    permalink: "#",
    mediaType: "IMAGE",
    postedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    likes: 980,
    comments: 52,
    views: 12100,
    attributedSales: 1580,
    attributedOrders: 14
  },
  {
    id: "mock-post-3",
    caption: "Night routine bundle breakdown",
    permalink: "#",
    mediaType: "CAROUSEL_ALBUM",
    postedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    likes: 720,
    comments: 37,
    views: 9400,
    attributedSales: 970,
    attributedOrders: 9
  }
];

export async function getCreatorAnalyticsPayload(): Promise<CreatorAnalyticsPayload> {
  const db = getDb();
  if (!db) {
    return buildPayload(mockPosts);
  }

  const store = await resolveOrCreateBaseStore();
  if (!store) return buildPayload(mockPosts);

  const posts = await db.creatorPost.findMany({
    where: { storeId: store.id },
    orderBy: { postedAt: "desc" },
    take: 12
  });

  if (!posts.length) {
    return buildPayload(mockPosts);
  }

  const normalized = posts.map((post: any) => ({
    id: post.id,
    caption: post.caption ?? "Untitled post",
    permalink: post.permalink ?? null,
    mediaType: post.mediaType ?? "MEDIA",
    postedAt: post.postedAt.toISOString(),
    likes: post.likeCount ?? 0,
    comments: post.commentsCount ?? 0,
    views: post.viewCount ?? 0,
    attributedSales: Number(post.attributedSales ?? 0),
    attributedOrders: post.attributedOrders ?? 0
  }));

  return buildPayload(normalized);
}

function buildPayload(posts: CreatorAnalyticsPayload["postPerformance"]): CreatorAnalyticsPayload {
  const totalPosts = posts.length;
  const totalLikes = posts.reduce((sum, post) => sum + post.likes, 0);
  const totalComments = posts.reduce((sum, post) => sum + post.comments, 0);
  const totalViews = posts.reduce((sum, post) => sum + post.views, 0);
  const attributedSales = posts.reduce((sum, post) => sum + post.attributedSales, 0);
  const attributedOrders = posts.reduce((sum, post) => sum + post.attributedOrders, 0);
  const engagementRate = totalViews ? ((totalLikes + totalComments) / totalViews) * 100 : 0;

  return {
    totalPosts,
    totalLikes,
    totalComments,
    totalViews,
    attributedSales,
    attributedOrders,
    engagementRate,
    topPosts: [...posts].sort((a, b) => b.attributedSales - a.attributedSales).slice(0, 5),
    postPerformance: posts
  };
}
