import { NextResponse } from "next/server";
import { createAffiliateCouponInShopify } from "@/lib/services/affiliate-portal-admin-service";
import { toErrorMessage } from "@/lib/server/errors";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body.storeId) await assertStoreInActiveOrg(body.storeId);
    const result = await createAffiliateCouponInShopify({
      storeId: body.storeId,
      affiliateId: body.affiliateId,
      code: body.code,
      title: body.title,
      creationMode: body.creationMode,
      discountType: body.discountType,
      value: Number(body.value),
      appliesOncePerCustomer: body.appliesOncePerCustomer,
      redirectPath: body.redirectPath,
      assignmentMode: body.assignmentMode,
      purchaseType: body.purchaseType,
      appliesToType: body.appliesToType,
      appliesToProductIds: Array.isArray(body.appliesToProductIds) ? body.appliesToProductIds : [],
      appliesToCollectionIds: Array.isArray(body.appliesToCollectionIds) ? body.appliesToCollectionIds : [],
      minimumRequirementType: body.minimumRequirementType,
      minimumSubtotal: body.minimumSubtotal == null ? null : Number(body.minimumSubtotal),
      minimumQuantity: body.minimumQuantity == null ? null : Number(body.minimumQuantity),
      customerEligibilityType: body.customerEligibilityType,
      customerSegmentIds: Array.isArray(body.customerSegmentIds) ? body.customerSegmentIds : [],
      usageLimit: body.usageLimit == null || body.usageLimit === "" ? null : Number(body.usageLimit),
      combinesWith: body.combinesWith
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 400 });
  }
}
