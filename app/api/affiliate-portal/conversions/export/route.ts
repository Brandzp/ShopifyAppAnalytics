import { exportAffiliateConversionsAsCsv } from "@/lib/services/affiliate-portal-directory-service";

export async function GET() {
  const csv = await exportAffiliateConversionsAsCsv();
  const timestamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="affiliate-conversions-${timestamp}.csv"`
    }
  });
}
