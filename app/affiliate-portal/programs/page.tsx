import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { AffiliatePortalNav } from "@/components/affiliate-portal/portal-nav";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAffiliatePrograms } from "@/lib/services/affiliate-portal-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export default async function AffiliateProgramsPage() {
  const [chrome, programs] = await Promise.all([getAppChromeData(), getAffiliatePrograms()]);
  const program = programs[0];

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <SectionHeading eyebrow="Affiliate Portal" title="תוכניות, השקה ו־setup" description="בדומה לזרימה ששלחת, זהו מרכז ההפעלה של התוכנית, לינק ההרשמה והצ'קליסט ליציאה לדרך." />
        <AffiliatePortalNav />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>{program.name}</CardTitle>
              <p className="mt-2 text-sm text-muted-foreground">אפליאייטים מקבלים {program.defaultCommissionRate}% עמלה על כל הזמנה מאושרת.</p>
            </div>
            <Button>יצירת תוכנית</Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">אפליאייטים</p>
                <p className="mt-2 text-2xl font-semibold">{formatNumber(program.affiliates)}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">הזמנות</p>
                <p className="mt-2 text-2xl font-semibold">{formatNumber(program.orders)}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">מכירות</p>
                <p className="mt-2 text-2xl font-semibold">{formatCurrency(program.sales, chrome.store.currency)}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
              <p className="text-sm text-muted-foreground">לינק הרשמה לאפליאייטים</p>
              <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p className="text-sm break-all">{program.signUpLink}</p>
                <Button variant="secondary">העתקה</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>בלוקים והטמעה</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
              <p className="font-semibold">Active App Blocks</p>
              <p className="mt-2 text-sm text-muted-foreground">כרגע אין blocks פעילים בחנות. זה המקום להדליק embed, דפי פורטל ווידג'טים.</p>
            </div>
            <Button variant="secondary">צפייה בפרטים</Button>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Setup guide</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {program.checklist.map((item) => (
            <div key={item.id} className="rounded-2xl border border-border/70 bg-background/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{item.group}</p>
              <p className="mt-2 font-semibold">{item.title}</p>
              <p className="mt-2 text-sm text-muted-foreground">{item.done ? "הושלם" : "ממתין"}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>פונקציות נוספות</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            ["Recruit affiliates", "גיוס משפיענים נוספים, עמוד הרשמה, marketplace ו־post-purchase widget."],
            ["Motivate affiliates", "בונוסים, קריאייטיב, מתנות וקמפיינים שמעלים תפוקה."],
            ["Other", "תמיכה ב־email, referral program, royalty ו־advanced tracking."]
          ].map(([title, description]) => (
            <div key={title} className="rounded-2xl border border-border/70 bg-background/70 p-4">
              <p className="font-semibold">{title}</p>
              <p className="mt-2 text-sm text-muted-foreground">{description}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </AppShell>
  );
}
