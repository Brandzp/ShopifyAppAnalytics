import type { Metadata } from "next";
import "./globals.css";
import { getAppLocale, getLocaleDirection } from "@/lib/i18n";
import { CookieBanner } from "@/components/compliance/cookie-banner";
import { PlausibleScript } from "@/components/compliance/plausible-script";

export const metadata: Metadata = {
  title: "Brandzp — Founder Analytics for Shopify",
  description:
    "Founder-friendly Shopify analytics focused on profit visibility, retention insight, and weekly reporting."
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getAppLocale();
  const localeFor = locale === "he" ? "he" : "en";

  return (
    <html lang={locale} dir={getLocaleDirection(locale)}>
      <body>
        {children}
        <CookieBanner locale={localeFor} />
        <PlausibleScript />
      </body>
    </html>
  );
}
