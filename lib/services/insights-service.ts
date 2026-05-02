import { getOverviewPayload } from "@/lib/services/analytics-service";

export async function getActionableInsights() {
  const overview = await getOverviewPayload();
  return {
    actionPanel: overview.actionPanel,
    insightBlocks: overview.insights
  };
}
