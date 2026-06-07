import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PageHead } from "@/components/dashboard-v2/section-head";
import { ImageEditor } from "@/components/creative/image-editor";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAppLocale } from "@/lib/i18n";
import { getDb } from "@/lib/server/db";
import { getReadableUrl } from "@/lib/services/creative-storage-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import type { CanvasOverlay } from "@/lib/domain/creative-types";

export const dynamic = "force-dynamic";

export default async function EditAssetPage({
  params
}: {
  params: Promise<{ projectId: string; assetId: string }>;
}) {
  const { projectId, assetId } = await params;
  const [chrome, locale, storeId] = await Promise.all([
    getAppChromeData(),
    getAppLocale(),
    resolveActiveStoreId()
  ]);
  if (!storeId) return notFound();

  const db = getDb();
  const asset = await db.creativeAsset.findFirst({
    where: { id: assetId, projectId, project: { storeId } },
    include: { project: { select: { id: true, name: true } } }
  });
  if (!asset || (!asset.storageKey && !asset.rawStorageKey)) return notFound();

  // The editor always renders the raw (unedited) image so the user can
  // re-arrange overlays freely. Final composited version is updated on save.
  const editableKey = asset.rawStorageKey ?? asset.storageKey!;
  const imageUrl = await getReadableUrl(editableKey);

  const heading =
    locale === "he"
      ? {
          eyebrow: "סטודיו קריאייטיב",
          title: `עריכת נכס — ${asset.project?.name ?? ""}`,
          description: "הוסיפו כותרת או טקסט לקריאה לפעולה. הסידור הזה ייצרב על התמונה כשתשמרו."
        }
      : {
          eyebrow: "Creative Studio",
          title: `Edit asset — ${asset.project?.name ?? ""}`,
          description: "Add a headline or CTA. Your layout is burned into the saved image on Save."
        };

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 sm:space-y-8">
        <PageHead eyebrow={heading.eyebrow} title={heading.title} description={heading.description} />
        <ImageEditor
          projectId={projectId}
          assetId={assetId}
          imageUrl={imageUrl}
          initialOverlays={(asset.overlaysJson as CanvasOverlay[] | null) ?? []}
          locale={locale}
        />
      </div>
    </AppShell>
  );
}
