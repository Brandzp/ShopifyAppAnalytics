"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/affiliate-portal", label: "דשבורד" },
  { href: "/affiliate-portal/programs", label: "תוכניות" },
  { href: "/affiliate-portal/affiliates", label: "אפליאייטים" },
  { href: "/affiliate-portal/coupons", label: "קופונים" },
  { href: "/affiliate-portal/conversions", label: "המרות" },
  { href: "/affiliate-portal/payouts", label: "תשלומים" },
  { href: "/affiliate-portal/content", label: "ביצועי תוכן" },
  { href: "/affiliate-portal/settings", label: "הגדרות פורטל" }
];

export function AffiliatePortalNav() {
  const pathname = usePathname();

  return (
    <div className="overflow-x-auto pb-2">
      <nav className="flex min-w-max gap-2">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href as any}
              className={cn(
                "rounded-xl border px-4 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

