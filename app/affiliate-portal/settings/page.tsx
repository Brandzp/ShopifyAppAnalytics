import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { AffiliatePortalNav } from "@/components/affiliate-portal/portal-nav";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAffiliatePortalSettings } from "@/lib/services/affiliate-portal-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AffiliatePortalSettingsPage() {
  const [chrome, settings] = await Promise.all([getAppChromeData(), getAffiliatePortalSettings()]);

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <SectionHeading eyebrow="Affiliate Portal" title="הגדרות פורטל, מיתוג והתראות" description="שילבתי כאן את הזרימות מהצילומים: Branding, Affiliate Portal, Notification ו-Advanced במסך אחד מסודר." />
        <AffiliatePortalNav />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Affiliate portal</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4"><p className="text-muted-foreground">שם פורטל</p><p className="mt-2 font-semibold">{settings.brandingName}</p></div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4"><p className="text-muted-foreground">שפה</p><p className="mt-2 font-semibold">{settings.portalLanguage}</p></div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4"><p className="text-muted-foreground">דומיין חנות</p><p className="mt-2 font-semibold">{settings.storeDomain}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Branding</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">לוגו, favicon, social links ודפי פורטל ממותגים - מוכן לחיבור ל-storage ול-upload אמיתי.</div>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Notifications</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4"><p className="text-muted-foreground">Sender</p><p className="mt-2 font-semibold">{settings.senderName} · {settings.senderEmail}</p></div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">Invite automation: {settings.inviteAutomationEnabled ? "פעיל" : "כבוי"}</div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">Referral order email: {settings.referralOrderEmailEnabled ? "פעיל" : "כבוי"}</div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">Coupon assignment notifications: {settings.couponAssignmentEnabled ? "פעיל" : "כבוי"}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Advanced</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">W-9 / tax forms: {settings.advanced.collectTaxForms ? "פעיל" : "כבוי"}</div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">Track pending referral orders: {settings.advanced.trackPendingOrders ? "פעיל" : "כבוי"}</div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">Webhooks ready: {settings.advanced.webhookReady ? "מוכן" : "לא מוכן"}</div>
            </CardContent>
          </Card>
        </div>
      </section>
    </AppShell>
  );
}
