// Auth pages live under (auth) — a route group so they don't inherit
// the main AppShell sidebar/topbar. They render on a clean centered
// canvas with brand color.

import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-background to-indigo-50 flex flex-col">
      <header className="px-6 py-5">
        <a href="/" className="inline-flex items-center gap-2">
          <span className="inline-block h-8 w-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600" />
          <span className="text-base font-semibold tracking-tight">Brandzp</span>
        </a>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <footer className="px-6 py-5 text-center text-xs text-muted-foreground">
        <a href="/privacy" className="underline hover:text-foreground">Privacy</a>
        <span className="mx-2">·</span>
        <a href="/terms" className="underline hover:text-foreground">Terms</a>
      </footer>
    </div>
  );
}
