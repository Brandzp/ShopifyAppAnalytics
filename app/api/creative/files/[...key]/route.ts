import { NextResponse } from "next/server";
import { getStorageBackend, readObject } from "@/lib/services/creative-storage-service";

/**
 * Proxy route for the local storage backend. Resolves a storage key from the
 * URL and streams the bytes back to the browser. For S3/R2 backends this
 * route is unused — clients fetch presigned URLs directly.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ key: string[] }> }
) {
  if (getStorageBackend() !== "local") {
    return NextResponse.json({ ok: false, error: "Not available for remote storage." }, { status: 404 });
  }
  const { key } = await context.params;
  if (!key || key.length === 0) {
    return NextResponse.json({ ok: false, error: "Missing key." }, { status: 400 });
  }
  const joined = key.map((segment) => decodeURIComponent(segment)).join("/");
  try {
    const { body, contentType } = await readObject(joined);
    return new NextResponse(body as unknown as BodyInit, {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": "private, max-age=300"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    if (/ENOENT/i.test(message)) {
      return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
