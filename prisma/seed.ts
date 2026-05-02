import { PrismaClient } from "@prisma/client";
import { alerts, customers, orders, products, store, summaries } from "@/lib/data/mock-store";

const prisma = new PrismaClient();

async function main() {
  // TODO: Replace mock fixture seeding with normalized Shopify fixture exports for local integration testing.
  const createdStore = await prisma.store.upsert({
    where: { domain: store.domain },
    update: {
      name: store.name,
      currency: store.currency,
      timezone: store.timezone,
      connected: store.connected,
      dateRangePreset: store.dateRangePreset,
      estimatedCostMode: store.estimatedCostMode
    },
    create: {
      id: store.id,
      name: store.name,
      domain: store.domain,
      currency: store.currency,
      timezone: store.timezone,
      connected: store.connected,
      dateRangePreset: store.dateRangePreset,
      estimatedCostMode: store.estimatedCostMode
    }
  });

  for (const product of products) {
    const createdProduct = await prisma.product.upsert({
      where: {
        storeId_shopifyProductId: {
          storeId: createdStore.id,
          shopifyProductId: `mock-product-${product.id}`
        }
      },
      update: {
        title: product.title,
        handle: product.handle,
        vendor: "Mock vendor",
        productType: product.collection,
        status: "ACTIVE",
        collection: product.collection,
        price: product.price,
        estimatedCost: product.estimatedCost,
        marginProfile: product.marginProfile,
        updatedAt: new Date()
      },
      create: {
        storeId: createdStore.id,
        shopifyProductId: `mock-product-${product.id}`,
        title: product.title,
        handle: product.handle,
        vendor: "Mock vendor",
        productType: product.collection,
        status: "ACTIVE",
        collection: product.collection,
        price: product.price,
        estimatedCost: product.estimatedCost,
        marginProfile: product.marginProfile,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date()
      }
    });

    await prisma.productVariant.upsert({
      where: {
        storeId_shopifyVariantId: {
          storeId: createdStore.id,
          shopifyVariantId: `mock-variant-${product.id}`
        }
      },
      update: {
        productId: createdProduct.id,
        sku: `SKU-${product.id.toUpperCase()}`,
        title: `${product.title} Default`,
        price: product.price,
        compareAtPrice: product.price + 8
      },
      create: {
        storeId: createdStore.id,
        productId: createdProduct.id,
        shopifyVariantId: `mock-variant-${product.id}`,
        sku: `SKU-${product.id.toUpperCase()}`,
        title: `${product.title} Default`,
        price: product.price,
        compareAtPrice: product.price + 8
      }
    });
  }

  for (const customer of customers) {
    await prisma.customer.upsert({
      where: {
        storeId_shopifyCustomerId: {
          storeId: createdStore.id,
          shopifyCustomerId: `mock-customer-${customer.id}`
        }
      },
      update: {
        email: customer.email,
        firstName: customer.name.split(" ")[0],
        lastName: customer.name.split(" ").slice(1).join(" ") || null,
        name: customer.name,
        createdAt: new Date(customer.firstOrderDate),
        updatedAt: new Date(),
        firstOrderDate: new Date(customer.firstOrderDate),
        totalOrders: customer.totalOrders,
        lifetimeValue: customer.lifetimeValue,
        isReturning: customer.isReturning
      },
      create: {
        id: customer.id,
        storeId: createdStore.id,
        shopifyCustomerId: `mock-customer-${customer.id}`,
        email: customer.email,
        firstName: customer.name.split(" ")[0],
        lastName: customer.name.split(" ").slice(1).join(" ") || null,
        name: customer.name,
        createdAt: new Date(customer.firstOrderDate),
        updatedAt: new Date(),
        firstOrderDate: new Date(customer.firstOrderDate),
        totalOrders: customer.totalOrders,
        lifetimeValue: customer.lifetimeValue,
        isReturning: customer.isReturning
      }
    });
  }

  for (const order of orders) {
    const customer = await prisma.customer.findUnique({
      where: {
        storeId_shopifyCustomerId: {
          storeId: createdStore.id,
          shopifyCustomerId: `mock-customer-${order.customerId}`
        }
      }
    });

    const subtotalPrice = order.lineItems.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
    const totalDiscounts = order.lineItems.reduce((total, item) => total + item.discountAmount, 0);

    const createdOrder = await prisma.order.upsert({
      where: {
        storeId_shopifyOrderId: {
          storeId: createdStore.id,
          shopifyOrderId: `mock-order-${order.id}`
        }
      },
      update: {
        customerId: customer?.id ?? null,
        orderNumber: order.orderNumber,
        displayName: order.orderNumber,
        createdAt: new Date(order.createdAt),
        processedAt: new Date(order.createdAt),
        currency: createdStore.currency,
        subtotalPrice,
        totalDiscounts,
        totalTax: 0,
        totalShipping: 0,
        totalRefunds: order.refundAmount,
        totalPrice: subtotalPrice,
        financialStatus: "PAID",
        fulfillmentStatus: "FULFILLED",
        sourceName: "seed",
        updatedAt: new Date(order.createdAt)
      },
      create: {
        id: order.id,
        storeId: createdStore.id,
        customerId: customer?.id ?? null,
        shopifyOrderId: `mock-order-${order.id}`,
        orderNumber: order.orderNumber,
        displayName: order.orderNumber,
        createdAt: new Date(order.createdAt),
        processedAt: new Date(order.createdAt),
        currency: createdStore.currency,
        subtotalPrice,
        totalDiscounts,
        totalTax: 0,
        totalShipping: 0,
        totalRefunds: order.refundAmount,
        totalPrice: subtotalPrice,
        financialStatus: "PAID",
        fulfillmentStatus: "FULFILLED",
        sourceName: "seed",
        updatedAt: new Date(order.createdAt)
      }
    });

    await prisma.orderLineItem.deleteMany({ where: { orderId: createdOrder.id } });
    await prisma.discountUsage.deleteMany({ where: { orderId: createdOrder.id } });
    await prisma.refund.deleteMany({ where: { orderId: createdOrder.id } });

    for (const item of order.lineItems) {
      const product = await prisma.product.findUnique({
        where: {
          storeId_shopifyProductId: {
            storeId: createdStore.id,
            shopifyProductId: `mock-product-${item.productId}`
          }
        }
      });
      const variant = await prisma.productVariant.findUnique({
        where: {
          storeId_shopifyVariantId: {
            storeId: createdStore.id,
            shopifyVariantId: `mock-variant-${item.productId}`
          }
        }
      });

      await prisma.orderLineItem.create({
        data: {
          storeId: createdStore.id,
          orderId: createdOrder.id,
          productId: product?.id ?? null,
          variantId: variant?.id ?? null,
          shopifyLineItemId: `mock-line-${createdOrder.id}-${item.productId}`,
          title: product?.title ?? item.productId,
          quantity: item.quantity,
          originalUnitPrice: item.unitPrice,
          discountedUnitPrice: item.unitPrice - item.discountAmount / Math.max(item.quantity, 1),
          lineSubtotal: item.unitPrice * item.quantity,
          lineDiscountAmount: item.discountAmount,
          estimatedCostAmount: item.estimatedCost
        }
      });
    }

    if (order.discountCode) {
      await prisma.discountUsage.create({
        data: {
          storeId: createdStore.id,
          orderId: createdOrder.id,
          code: order.discountCode,
          amount: totalDiscounts
        }
      });
    }

    if (order.refundAmount > 0) {
      await prisma.refund.create({
        data: {
          storeId: createdStore.id,
          orderId: createdOrder.id,
          shopifyRefundId: `mock-refund-${order.id}`,
          refundedAmount: order.refundAmount,
          refundedLineItemsAmount: order.refundAmount,
          createdAt: new Date(order.createdAt)
        }
      });
    }
  }

  for (const summary of summaries) {
    await prisma.summary.upsert({
      where: { id: summary.id },
      update: {
        headline: summary.headline,
        contentJson: summary.sections,
        generatedAt: new Date(summary.generatedAt)
      },
      create: {
        id: summary.id,
        storeId: createdStore.id,
        headline: summary.headline,
        contentJson: summary.sections,
        generatedAt: new Date(summary.generatedAt)
      }
    });
  }


  const growthDb = prisma as any;
  if (growthDb.agentSettings) {
    await growthDb.agentSettings.upsert({
      where: { storeId: createdStore.id },
      update: {},
      create: {
        storeId: createdStore.id,
        enabled: true,
        mode: "approval_required",
        checkFrequencyMinutes: 60,
        thresholds: {
          sessionsDropPercent: 20,
          ordersDropPercent: 15,
          conversionRateDropPercent: 12,
          aovDropPercent: 10,
          returningCustomerDropPercent: 10,
          trafficSourceDropPercent: 25
        },
        comparisonWindows: {
          compareToYesterday: true,
          compareToLast7Days: true,
          compareToSameWeekdayLastWeek: true
        },
        channels: {
          shopify: true,
          metaAds: false,
          instagram: true,
          facebook: false,
          tiktok: false,
          googleAnalytics: false
        },
        notifications: {
          email: true,
          inApp: true,
          slack: false,
          webhook: false
        },
        guardrails: {
          maxDailyAdBudget: 250,
          maxSingleActionBudget: 80,
          minConfidenceScore: 0.72,
          requireInventoryAvailable: true,
          minimumInventoryThreshold: 8,
          blockIfTrackingConfidenceLow: true,
          cooldownMinutesBetweenActions: 180
        },
        allowedActions: {
          sendAlert: true,
          createRecommendation: true,
          createCreativeBrief: true,
          draftOrganicPost: true,
          publishOrganicPost: false,
          createAdCampaignDraft: true,
          launchAdCampaign: false,
          scaleExistingCampaign: false,
          pauseCampaign: true
        },
        approvalRules: {
          requireApprovalAboveBudget: 40,
          requireApprovalForCampaignLaunch: true,
          requireApprovalForScaling: true,
          requireApprovalForPublishingPost: true
        },
        productResearch: {
          enabled: false,
          sourceUrls: "",
          nicheKeywords: "",
          maxRecommendations: 6
        }
      }
    });

    const platforms = [
      ["shopify", "connected", "Shopify ingestion available"],
      ["instagram", "stub", "Instagram signal connector scaffolded"],
      ["metaAds", "stub", "Meta Ads connector scaffolded"],
      ["facebook", "stub", "Facebook connector scaffolded"],
      ["tiktok", "stub", "TikTok Ads connector scaffolded"],
      ["googleAnalytics", "stub", "Analytics source abstraction scaffolded"]
    ];

    for (const [platform, status, healthMessage] of platforms) {
      await growthDb.platformConnection.upsert({
        where: { storeId_platform: { storeId: createdStore.id, platform } },
        update: { status, healthMessage },
        create: {
          storeId: createdStore.id,
          platform,
          status,
          healthMessage,
          config: {}
        }
      });
    }

    await growthDb.metricSnapshot.create({
      data: {
        storeId: createdStore.id,
        source: "seed",
        bucketedAt: new Date(),
        metrics: {
          current: {
            sessions: 9120,
            orders: 146,
            conversionRate: 0.016,
            averageOrderValue: 219,
            revenue: 31974,
            returningCustomers: 34.5,
            trackingConfidence: 0.68,
            trafficByChannel: [
              { channel: "Organic", sessions: 4820, revenue: 18240, delta: -6.2, confidence: 0.88, status: "normal" },
              { channel: "Paid Social", sessions: 2130, revenue: 6240, delta: -41.1, confidence: 0.79, status: "critical" },
              { channel: "Email", sessions: 1220, revenue: 5940, delta: 8.4, confidence: 0.92, status: "normal" }
            ],
            topProducts: [
              { productId: "hoodie", title: "Recovery Hoodie", estimatedInventory: 4, collection: "Recovery" }
            ],
            inventoryHighlights: [
              { productId: "hoodie", title: "Recovery Hoodie", estimatedInventory: 4, collection: "Recovery" }
            ]
          },
          yesterday: {
            sessions: 10440,
            orders: 158,
            conversionRate: 0.0151,
            averageOrderValue: 224,
            revenue: 35392,
            returningCustomers: 36.1
          },
          last7Days: {
            sessions: 13420,
            orders: 172,
            conversionRate: 0.0172,
            averageOrderValue: 228,
            revenue: 39280,
            returningCustomers: 38.4
          },
          sameWeekdayLastWeek: {
            sessions: 12980,
            orders: 168,
            conversionRate: 0.0169,
            averageOrderValue: 226,
            revenue: 37940,
            returningCustomers: 37.1
          }
        },
        confidenceScore: 0.68
      }
    });
  }
  for (const alert of alerts) {
    await prisma.alert.upsert({
      where: { id: alert.id },
      update: {
        severity: alert.severity,
        title: alert.title,
        explanation: alert.explanation,
        suggestedAction: alert.suggestedAction,
        periodLabel: alert.periodLabel,
        timestamp: new Date(alert.timestamp)
      },
      create: {
        id: alert.id,
        storeId: createdStore.id,
        severity: alert.severity,
        title: alert.title,
        explanation: alert.explanation,
        suggestedAction: alert.suggestedAction,
        periodLabel: alert.periodLabel,
        timestamp: new Date(alert.timestamp)
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });



