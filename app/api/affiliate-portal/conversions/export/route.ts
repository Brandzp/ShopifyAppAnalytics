import { exportAffiliateConversionsAsCsv } from "@/lib/services/affiliate-portal-directory-service";
import { getAuthContext } from "@/lib/auth/session";
import { NextResponse } from "next/server";

export async function GET() {
  const auth = await getAuthContext();
  if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  const csv = await exportAffiliateConversionsAsCsv();
  const timestamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="affiliate-conversions-${timestamp}.csv"`
    }
  });
}
