"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOffice } from "@/lib/auth";
import { sendEmail } from "@/lib/alerts";
import { t } from "@/lib/i18n";
import {
  ExportBlocked,
  centihoursLabel,
  generateExport,
  getExport,
  markDelivered,
} from "@/lib/payroll-export";
import type { ExportFormat } from "@/db/schema";

export async function generateExportAction(formData: FormData): Promise<void> {
  const { user, org } = await requireOffice();
  const format = (String(formData.get("format") ?? "gusto") === "adp" ? "adp" : "gusto") as ExportFormat;
  const periodStart = String(formData.get("periodStart") ?? "");
  const periodEnd = String(formData.get("periodEnd") ?? "");
  const query = `?period=${periodStart}&format=${format}`;
  if (!periodStart || !periodEnd) redirect("/export");

  try {
    const result = await generateExport(org, format, periodStart, periodEnd, user);
    revalidatePath("/export");
    redirect(`/export${query}&generated=${result.id}`);
  } catch (err) {
    if (err instanceof ExportBlocked) {
      // The validator already told the screen what is wrong; re-render it.
      redirect(`/export${query}&blocked=1`);
    }
    throw err;
  }
}

export async function emailExportAction(formData: FormData): Promise<void> {
  const { org, user } = await requireOffice();
  const exportId = String(formData.get("exportId") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const period = String(formData.get("periodStart") ?? "");
  const back = `/export?period=${period}`;
  if (!exportId || !email) redirect(back);

  const record = await getExport(org.id, exportId);
  if (!record) redirect(back);

  const locale = user.locale;
  await sendEmail({
    to: email,
    subject: t(locale, "alert.export.subject", {
      start: record.periodStart,
      end: record.periodEnd,
    }),
    text: [
      t(locale, "alert.export.body", {
        format: record.format.toUpperCase(),
        start: record.periodStart,
        end: record.periodEnd,
        rows: `${record.rowCount}`,
        totals: centihoursLabel(record.totalCentihours),
      }),
      "",
      record.csv ?? "",
    ].join("\n"),
  });
  await markDelivered(record.id, email);

  revalidatePath("/export");
  redirect(`${back}&emailed=${encodeURIComponent(email)}`);
}
