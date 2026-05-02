"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, LayoutDashboard, LineChart, Menu, Settings2, Sparkles, Users2, Megaphone, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";
import type { AppLocale } from "@/lib/i18n";

function getNavigation(labels: { nav: Record<string, string> }, locale: AppLocale) {
  return [
    { href: "/", label: labels.nav.overview, icon: LayoutDashboard },
    { href: "/profit", label: labels.nav.profit, icon: LineChart },
    { href: "/retention", label: labels.nav.retention, icon: Users2 },
    { href: "/affiliate-portal", label: locale === "he" ? "×¤×•×¨×˜×œ ×©×•×ª×¤×™×" : "Affiliate Portal", icon: Megaphone },
    { href: "/weekly-summary", label: labels.nav.weeklySummary, icon: Sparkles },
    { href: "/growth-agent", label: "Growth Agent", icon: Bot },
    { href: "/alerts", label: labels.nav.alerts, icon: Bell },
    { href: "/settings", label: labels.nav.settings, icon: Settings2 }
  ] as const;
}

function NavContent({
  pathname,
  storeName,
  locale,
  labels
}: {
  pathname: string;
  storeName: string;
  locale: AppLocale;
  labels: {
    common: Record<string, string>;
    nav: Record<string, string>;
  };
}) {
  const navigation = useMemo(() => getNavigation(labels, locale), [labels, locale]);

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-8 pt-6">
        <div className="rounded-2xl bg-primary px-4 py-5 text-primary-foreground shadow-soft">
          <p className="text-xs uppercase tracking-[0.22em] text-primary-foreground/70">
            {labels.common.appName}
          </p>
          <h2 className="mt-2 text-xl font-semibold">{storeName}</h2>
          <p className="mt-2 text-sm leading-6 text-primary-foreground/75">
            {labels.common.shellHeroCopy}
          </p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors",
                isActive
                  ? "bg-card text-foreground shadow-soft"
                  : "text-muted-foreground hover:bg-card/80 hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-4 pb-4 pt-6">
        <div className="rounded-2xl border border-border bg-card/80 p-4">
          <p className="text-sm font-semibold">{labels.common.automationReady}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {labels.common.automationCopy}
          </p>
        </div>
      </div>
    </div>
  );
}

export function Sidebar({
  storeName,
  locale,
  labels
}: {
  storeName: string;
  locale: AppLocale;
  labels: {
    common: Record<string, string>;
    nav: Record<string, string>;
  };
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border/70 bg-background/90 px-4 py-3 backdrop-blur lg:hidden">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {labels.common.appName}
          </p>
          <p className="font-semibold">{storeName}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setOpen((value) => !value)}>
          <Menu className={cn("h-4 w-4", locale === "he" ? "ml-2" : "mr-2")} />
          {labels.common.menu}
        </Button>
      </div>
      <aside className="hidden w-80 shrink-0 border-r border-border/70 bg-muted/40 lg:block">
        <NavContent pathname={pathname} storeName={storeName} locale={locale} labels={labels} />
      </aside>
      {open ? (
        <div className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="h-full w-[82%] max-w-80 bg-background shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <NavContent pathname={pathname} storeName={storeName} locale={locale} labels={labels} />
          </div>
        </div>
      ) : null}
    </>
  );
}
