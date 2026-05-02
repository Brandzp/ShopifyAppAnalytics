import { NextResponse } from "next/server";
import { createAffiliateCouponInShopify } from "@/lib/services/affiliate-portal-admin-service";
import { toErrorMessage } from "@/lib/server/errors";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await createAffiliateCouponInShopify({
      storeId: body.storeId,
      affiliateId: body.affiliateId,
      code: body.code,
      title: body.title,
      discountType: body.discountType,
      value: Number(body.value),
      appliesOncePerCustomer: body.appliesOncePerCustomer,
      redirectPath: body.redirectPath
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 400 });
  }
}
