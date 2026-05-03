import { MarketingBriefStudio } from "@/components/marketing-planner/brief-studio";
import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getGrowthAgentStoreContext } from "@/lib/services/growth-agent-service";

export const metadata = {
  title: "Marketing Planner"
};

export default async function MarketingPlannerPage() {
  const { store } = await getGrowthAgentStoreContext();
  const chrome = await getAppChromeData(store.id);

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 text-right" dir="rtl">
        <SectionHeading
          eyebrow="Marketing Planner"
          title="בריף שיווקי -> GANTT + תובנות גרות'"
          description="העלאת בריף חודשי, תרגום לגאנט שיווקי בעברית, ובדיקת תוכנית מול לוח השנה, העומסים והפערים המסחריים."
        />

        <MarketingBriefStudio storeId={store.id} />
      </div>
    </AppShell>
  );
}
