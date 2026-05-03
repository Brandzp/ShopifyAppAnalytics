import { exportAffiliatesAsCsv, exportAffiliatesAsJson } from "@/lib/services/affiliate-portal-directory-service";

function buildTimestamp() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const format = new URL(request.url).searchParams.get("format")?.toLowerCase();

  if (format === "json") {
    const json = await exportAffiliatesAsJson();
    return new Response(json, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="affiliates-${buildTimestamp()}.json"`
      }
    });
  }

  const csv = await exportAffiliatesAsCsv();
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="affiliates-${buildTimestamp()}.csv"`
    }
  });
}
