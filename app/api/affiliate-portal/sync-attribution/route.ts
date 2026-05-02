import { NextResponse } from "next/server";
import { syncAffiliateAttributionFromOrders } from "@/lib/services/affiliate-portal-admin-service";
import { toErrorMessage } from "@/lib/server/errors";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await syncAffiliateAttributionFromOrders(body.storeId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 400 });
  }
}
