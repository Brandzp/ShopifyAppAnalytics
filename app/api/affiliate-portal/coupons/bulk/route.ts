import { NextResponse } from "next/server";
import { createAffiliateCouponsInBulk } from "@/lib/services/affiliate-portal-admin-service";
import { toErrorMessage } from "@/lib/server/errors";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await createAffiliateCouponsInBulk({
      storeId: body.storeId,
      affiliateIds: Array.isArray(body.affiliateIds) ? body.affiliateIds : [],
      title: body.title,
      codePrefix: body.codePrefix,
      codeSuffix: body.codeSuffix,
      discountType: body.discountType,
      value: Number(body.value),
      appliesOncePerCustomer: body.appliesOncePerCustomer,
      redirectPath: body.redirectPath,
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
