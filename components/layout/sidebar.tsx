"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Building2, CalendarRange, Camera, LayoutDashboard, LineChart, Loader2, Menu, PackageCheck, Settings2, Sparkles, Users2, Megaphone, Bot, FileSpreadsheet, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";
import type { AppLocale } from "@/lib/i18n";

function getNavigation(
  labels: { nav: Record<string, string> },
  locale: AppLocale,
  showPortfolio: boolean
) {
  return [
    { href: "/", label: labels.nav.overview, icon: LayoutDashboard },
    // Portfolio view only appears when the org has 2+ brands — a portfolio
    // of one is just the Overview.
    ...(showPortfolio
      ? [
          {
            href: "/portfolio",
            label: locale === "he" ? "תיק המותגים" : "Portfolio",
            icon: Building2
          }
        ]
      : []),
    { href: "/profit", label: labels.nav.profit, icon: LineChart },
    {
      href: "/sales-summary",
      label: locale === "he" ? "מצב אופליין" : "Offline Status",
      icon: FileSpreadsheet
    },
    { href: "/retention", label: labels.nav.retention, icon: Users2 },
    {
      href: "/product-follow-ups",
      label: locale === "he" ? "מעקב מוצרים" : "Product follow-ups",
      icon: PackageCheck
    },
    { href: "/affiliate-portal", label: locale === "he" ? "פורטל שותפים" : "Affiliate Portal", icon: Megaphone },
    { href: "/creator-flow", label: labels.nav.creatorFlow, icon: Camera },
    { href: "/creative", label: locale === "he" ? "סטודיו קריאייטיב" : "Creative", icon: Sparkles },
    { href: "/weekly-summary", label: labels.nav.weeklySummary, icon: Sparkles },
    // Growth Agent — hidden from nav until the automation loop is shipped.
    // Routes still exist at /growth-agent/* for direct access if needed.
    { href: "/marketing-planner", label: locale === "he" ? "גאנט שיווקי" : "Marketing Planner", icon: CalendarRange },
    { href: "/alerts", label: labels.nav.alerts, icon: Bell },
    { href: "/settings", label: labels.nav.settings, icon: Settings2 }
  ] as const;
}

/**
 * Renders the nav item's icon, swapping it for a spinner while a click on this
 * link has a navigation in flight. `useLinkStatus` only reports `pending` for
 * the enclosing <Link>, so the user gets feedback exactly on the item they
 * clicked while the destination page does its server work.
 */
function NavLinkIcon({ Icon, isActive }: { Icon: LucideIcon; isActive: boolean }) {
  const { pending } = useLinkStatus();
  const className = cn(
    "h-4 w-4 shrink-0",
    isActive ? "text-foreground" : "text-muted-foreground group-hover/nav:text-foreground"
  );
  if (pending) {
    return <Loader2 className={cn(className, "animate-spin")} aria-label="Loading" />;
  }
  return <Icon className={className} aria-hidden />;
}

function NavContent({
  pathname,
  storeName,
  locale,
  labels,
  showPortfolio
}: {
  pathname: string;
  storeName: string;
  locale: AppLocale;
  labels: {
    common: Record<string, string>;
    nav: Record<string, string>;
  };
  showPortfolio: boolean;
}) {
  const navigation = useMemo(
    () => getNavigation(labels, locale, showPortfolio),
    [labels, locale, showPortfolio]
  );

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
      <nav className="flex-1 space-y-1 px-3" aria-label="Primary">
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
          return (
            <Link
              key={item.href}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              href={item.href as any}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "group/nav relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-card text-foreground shadow-soft"
                  : "text-muted-foreground hover:bg-card/70 hover:text-foreground"
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute inset-y-2 start-0 w-1 rounded-full transition-colors",
                  isActive ? "bg-foreground" : "bg-transparent group-hover/nav:bg-border"
                )}
              />
              <NavLinkIcon Icon={Icon} isActive={isActive} />
              <span className="truncate">{item.label}</span>
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
  labels,
  showPortfolio = false
}: {
  storeName: string;
  locale: AppLocale;
  labels: {
    common: Record<string, string>;
    nav: Record<string, string>;
  };
  // Show the Portfolio nav item — true when the org has ≥2 connected
  // brands. Defaults to false so callers that don't yet pass it stay safe.
  showPortfolio?: boolean;
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
        <NavContent
          pathname={pathname}
          storeName={storeName}
          locale={locale}
          labels={labels}
          showPortfolio={showPortfolio}
        />
      </aside>
      {open ? (
        <div className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="h-full w-[82%] max-w-80 bg-background shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <NavContent
              pathname={pathname}
              storeName={storeName}
              locale={locale}
              labels={labels}
              showPortfolio={showPortfolio}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
