import { NextResponse } from "next/server";
import { updateAffiliateInstagramProfile } from "@/lib/services/affiliate-portal-directory-service";
import { AppError, toErrorMessage } from "@/lib/server/errors";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ affiliateId: string }> }
) {
  try {
    const [{ affiliateId }, body] = await Promise.all([params, request.json().catch(() => ({}))]);
    const result = await updateAffiliateInstagramProfile({
      storeId: typeof body.storeId === "string" ? body.storeId : null,
      affiliateId,
      instagramProfileUrl: typeof body.instagramProfileUrl === "string" ? body.instagramProfileUrl : ""
    });

    return NextResponse.json(result);
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
