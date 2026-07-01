import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { GanttStudio } from "@/components/gantt/gantt-studio";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { getDb } from "@/lib/server/db";

export const metadata = {
  title: "Gantt — Marketing"
};

export const dynamic = "force-dynamic";

export default async function MarketingGanttPage() {
  const chrome = await getAppChromeData();
  const storeId = await resolveActiveStoreId();
  const db = getDb();

  const sheets = storeId
    ? await db.ganttSheet.findMany({
        where: { storeId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          title: true,
          originalName: true,
          rangeStart: true,
          rangeEnd: true,
          rowCount: true,
          rolesJson: true,
          categoriesJson: true,
          insightsGeneratedAt: true,
          createdAt: true
        }
      })
    : [];

  // Serialize Date objects + JSON arrays for the client component. The
  // DB returns Date objects for rangeStart/End and unknown for the JSON
  // arrays; the client wants ISO strings + typed arrays.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initialSheets = sheets.map((s: any) => ({
    id: s.id,
    title: s.title,
    originalName: s.originalName,
    rangeStart: s.rangeStart?.toISOString() ?? null,
    rangeEnd: s.rangeEnd?.toISOString() ?? null,
    rowCount: s.rowCount,
    rolesJson: Array.isArray(s.rolesJson) ? (s.rolesJson as string[]) : [],
    categoriesJson: Array.isArray(s.categoriesJson) ? (s.categoriesJson as string[]) : [],
    insightsGeneratedAt: s.insightsGeneratedAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString()
  }));

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 text-right" dir="rtl">
        <SectionHeading
          eyebrow="Marketing Planner · Gantt"
          title="גאנט שיווקי אינטראקטיבי"
          description="העלאת גאנט חודשי, ניתוח אוטומטי ע״י סוכן BI, בריף PDF לכל תפקיד, ולחיצה על יום בלוח לראות את המשימות ולפתוח אותן בכלי המתאים (קופון, סטודיו קריאייטיב, ועוד)."
        />
        <GanttStudio initialSheets={initialSheets} />
      </div>
    </AppShell>
  );
}
