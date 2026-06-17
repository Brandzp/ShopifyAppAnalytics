import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { runOneJob } from "@/lib/server/creative-job-runner";
import { toErrorMessage } from "@/lib/server/errors";

// POST /api/creative/jobs/kick
//
// Manually trigger ONE worker tick. Same code path as the in-process cron
// (lib/server/creative-job-cron.ts → /api/creative/jobs/worker) but
// bypasses the cron's exponential-backoff state — useful when the cron is
// stuck in long backoff after a stretch of ECONNRESET / upstream errors
// and the founder doesn't want to wait the ~15 min backoff cap.
//
// Auth: requires a signed-in user (any role) instead of the worker secret.
// Rationale: this is a SAFETY VALVE for the operator UI, not part of the
// machine-to-machine cron, so the user's session is the right gate.
//
// Same one-tick-per-call semantics as the worker — it claims at most one
// job. Call multiple times if you want to drain the queue.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  try {
    const auth = await getAuthContext();
    if (!auth.userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }
    const result = await runOneJob();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: toErrorMessage(error) },
      { status: 500 }
    );
  }
}
