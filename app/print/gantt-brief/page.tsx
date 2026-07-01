// Print-only Gantt brief.
// URL: /print/gantt-brief?sheetId=X&role=designer&locale=he
//
// Rendered server-side, captured by Playwright for the per-role PDF
// export. Filters the sheet to just the requested role's tasks, then
// groups by category and by date for easy reading.

import { notFound } from "next/navigation";
import { getDb } from "@/lib/server/db";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";

export const dynamic = "force-dynamic";

interface SearchParams {
  sheetId?: string;
  role?: string;
  locale?: string;
}

function fmtDate(date: Date | null): string {
  if (!date) return "—";
  // DD/MM/YYYY — operator-friendly, matches the Israeli convention used
  // in the source Gantt.
  const d = String(date.getUTCDate()).padStart(2, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const y = date.getUTCFullYear();
  return `${d}/${m}/${y}`;
}

function fmtDow(date: Date | null, locale: "he" | "en"): string {
  if (!date) return "";
  if (locale === "he") {
    const days = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "שבת"];
    return days[date.getUTCDay()];
  }
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getUTCDay()];
}

const ACTION_LABELS: Record<string, { en: string; he: string }> = {
  discount_code: { en: "Discount code", he: "קופון/הנחה" },
  creative_image: { en: "Image creative", he: "תמונה" },
  creative_banner: { en: "Banner", he: "באנר" },
  creative_video: { en: "Video", he: "סרטון" },
  social_post: { en: "Social post", he: "פוסט/סטורי" },
  email_campaign: { en: "Email/Newsletter", he: "אימייל/ניוזלטר" },
  sms_campaign: { en: "SMS", he: "סמס" },
  web_update: { en: "Website update", he: "אתר" },
  blog_post: { en: "Blog post", he: "מאמר/בלוג" }
};

export default async function GanttBriefPrintPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const sheetId = params.sheetId;
  const role = (params.role ?? "").trim() || null;
  const locale: "he" | "en" = params.locale === "en" ? "en" : "he";
  const isHe = locale === "he";
  if (!sheetId) return notFound();

  const storeId = await resolveActiveStoreId();
  if (!storeId) return notFound();

  const db = getDb();
  // Virtual role: "customer_service" isn't a real role in the parsed
  // rows — it's a synthesized view that shows every discount / promo
  // task so the CS team can answer "does coupon X work?" questions
  // without needing to check the calendar themselves.
  const isCustomerServiceView = role === "customer_service";

  const sheet = await db.ganttSheet.findFirst({
    where: { id: sheetId, storeId },
    include: {
      rows: {
        where: isCustomerServiceView
          ? {
              // CS sees everything the customer might mention:
              // active discounts, launches, promotions, coupon codes.
              OR: [
                { actionType: "discount_code" },
                { task: { contains: "קופון", mode: "insensitive" } },
                { task: { contains: "מבצע", mode: "insensitive" } },
                { task: { contains: "הנחה", mode: "insensitive" } },
                { task: { contains: "coupon", mode: "insensitive" } },
                { task: { contains: "discount", mode: "insensitive" } },
                { task: { contains: "promo", mode: "insensitive" } },
                { task: { contains: "השקה", mode: "insensitive" } }
              ]
            }
          : role
            ? { role }
            : undefined,
        orderBy: [{ startDate: "asc" }, { category: "asc" }, { rowIndex: "asc" }]
      }
    }
  });
  if (!sheet) return notFound();

  // Group by category, then by date (matches the source spreadsheet
  // layout — operator scans by channel first).
  const byCategory = new Map<
    string,
    Array<{
      date: Date | null;
      task: string;
      action: string | null;
      status: string | null;
    }>
  >();
  for (const r of sheet.rows) {
    const cat = r.category ?? (isHe ? "ללא קטגוריה" : "Uncategorized");
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push({
      date: r.startDate,
      task: r.task,
      action: r.actionType,
      status: r.status
    });
  }

  const ROLE_LABEL_HE: Record<string, string> = {
    web: "צוות אתר",
    social: "צוות סושיאל",
    graphic: "צוות גרפיקה",
    affiliates: "צוות אפיליאייטים / משפיענים",
    email: "צוות אימייל ו-SMS",
    marketing: "צוות שיווק / מבצעים",
    customer_service: "שירות לקוחות — מבצעים והשקות"
  };
  const ROLE_LABEL_EN: Record<string, string> = {
    web: "Web team",
    social: "Social team",
    graphic: "Graphic / creative team",
    affiliates: "Affiliates / influencers",
    email: "Email & SMS team",
    marketing: "Marketing / promotions",
    customer_service: "Customer service — promos & launches"
  };
  const roleLabel = role
    ? (isHe ? ROLE_LABEL_HE[role] ?? role : ROLE_LABEL_EN[role] ?? role)
    : null;
  const heading = roleLabel
    ? isHe
      ? `סיכום משימות — ${roleLabel}`
      : `Task brief — ${roleLabel}`
    : isHe
      ? "סיכום משימות — כל הצוותים"
      : "Task brief — all teams";

  return (
    <html lang={locale} dir={isHe ? "rtl" : "ltr"}>
      <head>
        <title>{`Gantt brief — ${sheet.title}`}</title>
        <style>{`
          * { box-sizing: border-box; }
          body { font-family: -apple-system, system-ui, "Segoe UI", "Heebo", sans-serif; margin: 0; padding: 0; color: #0f172a; }
          .page { max-width: 880px; margin: 0 auto; padding: 32px 40px; }
          h1 { font-size: 22px; margin: 0 0 4px; }
          .meta { color: #475569; font-size: 12px; }
          .sub { color: #64748b; font-size: 11px; margin-top: 2px; }
          .category { margin-top: 28px; }
          .category h2 {
            margin: 0 0 10px;
            padding: 8px 12px;
            font-size: 14px;
            background: #0f172a;
            color: #fff;
            border-radius: 6px;
          }
          .task {
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 10px 14px;
            margin-bottom: 8px;
            page-break-inside: avoid;
            display: grid;
            grid-template-columns: 90px 1fr auto;
            gap: 12px;
            align-items: start;
          }
          .task .date {
            font-weight: 600;
            font-size: 12px;
            color: #0f172a;
          }
          .task .dow {
            font-size: 11px;
            color: #94a3b8;
            font-weight: 400;
            margin-top: 1px;
          }
          .task .body {
            font-size: 13px;
            line-height: 1.55;
            white-space: pre-wrap;
            word-break: break-word;
          }
          .chip {
            display: inline-block;
            font-size: 10px;
            padding: 2px 8px;
            border-radius: 9999px;
            background: #eef2ff;
            color: #3730a3;
            font-weight: 600;
          }
          .chip-status {
            margin-top: 6px;
            background: #f1f5f9;
            color: #475569;
          }
          .footer {
            margin-top: 36px;
            padding-top: 12px;
            border-top: 1px solid #e2e8f0;
            color: #94a3b8;
            font-size: 10px;
            text-align: center;
          }
          @media print {
            .category h2 { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .chip { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        `}</style>
      </head>
      <body>
        <div className="page">
          <h1>{heading}</h1>
          <p className="meta">
            {sheet.title}
            {sheet.rangeStart && sheet.rangeEnd
              ? ` · ${fmtDate(sheet.rangeStart)} – ${fmtDate(sheet.rangeEnd)}`
              : null}
          </p>
          <p className="sub">
            {isHe
              ? `סה״כ ${sheet.rows.length} משימות${role ? ` עבור תפקיד ${role}` : ""}.`
              : `${sheet.rows.length} task${sheet.rows.length === 1 ? "" : "s"}${role ? ` for role ${role}` : ""}.`}
          </p>

          {Array.from(byCategory.entries()).map(([cat, tasks]) => (
            <section key={cat} className="category">
              <h2>{cat}</h2>
              {tasks.map((t, i) => (
                <div key={i} className="task">
                  <div>
                    <div className="date">{fmtDate(t.date)}</div>
                    <div className="dow">{fmtDow(t.date, locale)}</div>
                    {t.status ? <span className="chip chip-status">{t.status}</span> : null}
                  </div>
                  <div className="body">{t.task}</div>
                  <div>
                    {t.action ? (
                      <span className="chip">
                        {(ACTION_LABELS[t.action] ?? { en: t.action, he: t.action })[locale]}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </section>
          ))}

          <p className="footer">
            {isHe
              ? `הופק אוטומטית מהגאנט "${sheet.title}".`
              : `Auto-generated from Gantt "${sheet.title}".`}
          </p>
        </div>
      </body>
    </html>
  );
}
