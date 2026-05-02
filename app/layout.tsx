import type { Metadata } from "next";
import "./globals.css";
import { getAppLocale, getLocaleDirection } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Shopify Profit Ops System",
  description: "Founder-friendly Shopify analytics focused on profit visibility, retention insight, and weekly reporting."
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getAppLocale();

  return (
    <html lang={locale} dir={getLocaleDirection(locale)}>
      <body>{children}</body>
    </html>
  );
}
