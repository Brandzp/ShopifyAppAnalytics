"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function AffiliateAttributionSyncButton({ label = "?????? ???? ??????" }: { label?: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSync() {
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/affiliate-portal/sync-attribution", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "?????? ???? ??????? ????");
        }
        setMessage(`??????? ?????. ${payload.syncedOrders ?? 0} ?????? ?????.`);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "?????? ???? ??????? ????");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="secondary" onClick={handleSync} disabled={isPending}>
        {isPending ? "??????..." : label}
      </Button>
      {message ? <span className="text-sm text-muted-foreground">{message}</span> : null}
    </div>
  );
}
