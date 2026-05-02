import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { approveAmazonSupplierOrderDraft } from "@/lib/services/amazon-supplier-order-service";

export async function POST(_request: Request, context: { params: Promise<{ draftId: string }> }) {
  try {
    const { draftId } = await context.params;
    const result = await approveAmazonSupplierOrderDraft(draftId);
    return NextResponse.json(result);
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}