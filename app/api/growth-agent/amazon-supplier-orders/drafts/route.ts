import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { createAmazonSupplierOrderDraft } from "@/lib/services/amazon-supplier-order-service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await createAmazonSupplierOrderDraft(body, body?.storeId);
    return NextResponse.json(result);
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
