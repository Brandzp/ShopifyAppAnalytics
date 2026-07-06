import { NextResponse } from "next/server";
import { updateAffiliateInstagramProfile } from "@/lib/services/affiliate-portal-directory-service";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getAuthContext } from "@/lib/auth/session";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ affiliateId: string }> }
) {
  try {
    const auth = await getAuthContext();
    if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
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
