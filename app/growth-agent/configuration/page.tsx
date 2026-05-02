import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getGrowthAgentSettings } from "@/lib/services/growth-agent-service";
import { GrowthAgentNav } from "@/components/growth-agent/agent-nav";
import { GrowthAgentConfigurationManager } from "@/components/growth-agent/configuration-manager";

export default async function GrowthAgentConfigurationPage() {
  const [chrome, settings] = await Promise.all([getAppChromeData(), getGrowthAgentSettings()]);

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <SectionHeading
          eyebrow="Growth Agent"
          title="Configuration"
          description="Merchant-controlled thresholds, notifications, automation permissions, budgets, confidence gates, approval rules, and product crawler sources."
        />
        <GrowthAgentNav />
      </section>

      <GrowthAgentConfigurationManager initialSettings={settings} />
    </AppShell>
  );
}

