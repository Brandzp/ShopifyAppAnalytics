import { NextResponse } from "next/server";
import { syncInstagramPosts } from "@/lib/services/instagram-service";
import { toErrorMessage } from "@/lib/server/errors";

export async function POST() {
  try {
    const result = await syncInstagramPosts();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 400 });
  }
}
