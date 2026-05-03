import { NextResponse } from "next/server";
import { importAffiliatesFromFile } from "@/lib/services/affiliate-portal-directory-service";
import { AppError, toErrorMessage } from "@/lib/server/errors";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const storeId = formData.get("storeId");

    if (!(file instanceof File)) {
      throw new AppError("Upload an Excel, CSV, or JSON file first.", 400);
    }

    const result = await importAffiliatesFromFile(file, typeof storeId === "string" ? storeId : undefined);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 400 });
  }
}
