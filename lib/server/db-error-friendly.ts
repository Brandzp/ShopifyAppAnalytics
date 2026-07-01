// Detect known "DB not caught up with the code" errors and turn them
// into a clear operator-facing message. Every gantt/* route wraps its
// catch block with this so the client sees "Run the migration" instead
// of "char '{' is not expected" (which is what happens when Cloudflare
// returns its HTML error page after our route 500s).

import { AppError } from "@/lib/server/errors";

const MIGRATION_HINT_PATTERNS: Array<{ pattern: RegExp; hint: string }> = [
  {
    pattern: /column\s+"?[\w".]+"?\s+does not exist/i,
    hint:
      "A required column is missing in Supabase. Run the pending migration " +
      "(prisma/supabase/alter-2026-06-29-gantt-models.sql) in the Supabase " +
      "SQL Editor. It is idempotent — safe to re-run."
  },
  {
    pattern: /relation\s+"?[\w".]+"?\s+does not exist/i,
    hint:
      "A required table is missing in Supabase. Run the pending migration " +
      "(prisma/supabase/alter-2026-06-29-gantt-models.sql) — it creates " +
      "GanttSheet + GanttRow."
  },
  {
    pattern: /P2022/i,
    hint: "Prisma reports a column not found. Run the pending Gantt migration in Supabase."
  }
];

// Wrap an unknown error into an AppError with an actionable hint when we
// recognize the shape. Otherwise passes the original through so genuine
// bugs aren't masked.
export function friendlyDbError(error: unknown): unknown {
  if (error instanceof AppError) return error;
  const message = error instanceof Error ? error.message : String(error);
  for (const { pattern, hint } of MIGRATION_HINT_PATTERNS) {
    if (pattern.test(message)) {
      return new AppError(
        `Database schema is out of date. ${hint}\n\nOriginal error: ${message.slice(0, 300)}`,
        503
      );
    }
  }
  return error;
}
