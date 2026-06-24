"use client";

// "Quick batch via Creative Agent" entry point. Opens a small inline form
// where the operator types a campaign theme; we hand it to the Creative
// agent → 5 visual prompts → 5 Higgsfield renders → 1 CreativeProject
// with 5 assets. The new project appears in the /creative list when the
// router refreshes.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/lib/i18n";

export function QuickBatchButton({ locale }: { locale: AppLocale }) {
  const isHe = locale === "he";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(isHe ? "קמפיין בושם קיץ" : "Summer perfume campaign");
  const [productName, setProductName] = useState("");
  const [count, setCount] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ projectId: string; succeeded: number; failed: number } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/creative/quick-batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          theme,
          count,
          productName: productName || undefined,
          aspectRatio: "9:16"
        })
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setResult({ projectId: body.projectId, succeeded: body.succeeded, failed: body.failed });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Sparkles className={cn("h-4 w-4", isHe ? "ml-2" : "mr-2")} />
        {isHe ? "ייצור מהיר עם סוכן הקריאייטיב" : "Quick batch via Creative Agent"}
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4" onClick={() => !submitting && setOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">
              {isHe ? "ייצור מהיר עם סוכן הקריאייטיב" : "Quick batch via Creative Agent"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isHe
                ? "ספרו לסוכן על הקמפיין; הוא יבחר רעיונות חזותיים שונים והמערכת תייצר אותם דרך Higgsfield."
                : "Describe the campaign — the agent will pick distinct visual concepts and we render each via Higgsfield."}
            </p>

            <form onSubmit={submit} className="mt-6 space-y-4 text-sm">
              <label className="block">
                <span className="font-medium">{isHe ? "נושא הקמפיין" : "Campaign theme"}</span>
                <input
                  type="text"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                  placeholder={isHe ? "לדוגמה: קמפיין בושם קיץ" : "e.g. Summer perfume campaign"}
                  required
                />
              </label>

              <label className="block">
                <span className="font-medium">
                  {isHe ? "שם מוצר (אופציונלי)" : "Product name (optional)"}
                </span>
                <input
                  type="text"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                  placeholder="e.g. Maison Margiela Replica Beach Walk"
                />
              </label>

              <label className="block">
                <span className="font-medium">{isHe ? "כמה תמונות" : "How many images"}</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={count}
                  onChange={(e) => setCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                  className="mt-1 w-24 rounded-lg border border-border bg-background px-3 py-2"
                />
                <span className="ms-2 text-xs text-muted-foreground">
                  {isHe ? `~₪${(count * 0.18).toFixed(2)} ב-Higgsfield` : `~$${(count * 0.05).toFixed(2)} on Higgsfield`}
                </span>
              </label>

              {error ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {error}
                </div>
              ) : null}

              {result ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  {isHe
                    ? `נוצר: ${result.succeeded} הצליחו, ${result.failed} נכשלו.`
                    : `Done: ${result.succeeded} succeeded, ${result.failed} failed.`}
                  <a href={`/creative/${result.projectId}`} className="ms-2 underline">
                    {isHe ? "פתח את הפרויקט" : "Open project"}
                  </a>
                </div>
              ) : null}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
                  {result ? (isHe ? "סגור" : "Close") : isHe ? "ביטול" : "Cancel"}
                </Button>
                {!result ? (
                  <Button type="submit" disabled={submitting || !theme.trim()}>
                    {submitting ? (
                      <>
                        <Loader2 className={cn("h-4 w-4 animate-spin", isHe ? "ml-2" : "mr-2")} />
                        {isHe ? "מייצר…" : "Generating…"}
                      </>
                    ) : isHe ? (
                      `ייצור ${count} תמונות`
                    ) : (
                      `Generate ${count} images`
                    )}
                  </Button>
                ) : null}
              </div>

              <p className="mt-2 text-[11px] text-muted-foreground">
                {isHe
                  ? "ייצור 5 תמונות לוקח בערך 60-120 שניות. אל תסגרו את החלון."
                  : "5-image generation takes ~60-120 seconds. Don't close this window."}
              </p>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
