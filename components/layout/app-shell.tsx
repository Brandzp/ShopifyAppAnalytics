import { Sidebar } from "@/components/layout/sidebar";
import { Topbar, type TopbarControls } from "@/components/layout/topbar";
import type { Store } from "@/lib/domain/types";
import { getAppLocale, getDictionary, type AppLocale } from "@/lib/i18n";

export async function AppShell({
  children,
  store,
  controls,
  localeOverride
}: {
  children: React.ReactNode;
  store: Store;
  controls?: TopbarControls;
  localeOverride?: AppLocale;
}) {
  const locale = localeOverride ?? (await getAppLocale());
  const dictionary = getDictionary(locale);

  return (
    <div className="min-h-screen lg:flex">
      <Sidebar storeName={store.name} locale={locale} labels={dictionary} />
      <main className="flex-1">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:gap-8 sm:px-6 sm:py-6 lg:px-10 lg:py-8">
          <Topbar store={store} controls={controls} locale={locale} labels={dictionary} />
          {children}
        </div>
      </main>
    </div>
  );
}
