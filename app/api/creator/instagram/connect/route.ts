import { NextResponse } from "next/server";
import { saveInstagramConnection } from "@/lib/services/instagram-service";
import { toErrorMessage } from "@/lib/server/errors";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await saveInstagramConnection(body.accessToken);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 400 });
  }
}
