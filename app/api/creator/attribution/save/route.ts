import { NextResponse } from "next/server";
import { saveCreatorAttributionSettings } from "@/lib/services/creator-attribution-service";
import { toErrorMessage } from "@/lib/server/errors";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await saveCreatorAttributionSettings({
      portalDomain: body.portalDomain,
      apiKey: body.apiKey
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 400 });
  }
}

