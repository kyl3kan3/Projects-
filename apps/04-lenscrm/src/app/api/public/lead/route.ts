import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";

/** Public lead-form submission. Honeypot + basic shape validation. */
const Body = z.object({
  formSlug: z.string(),
  name: z.string().min(1).max(160),
  email: z.string().email(),
  phone: z.string().max(40).optional(),
  eventDate: z.string().max(40).optional(),
  message: z.string().max(4000).optional(),
  answers: z.record(z.string(), z.string()).optional(),
  website: z.string().optional(), // honeypot — must be empty
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  if (parsed.data.website) return NextResponse.json({ ok: true }); // silently drop bots

  const form = await db.query.leadForms.findFirst({ where: eq(schema.leadForms.slug, parsed.data.formSlug) });
  if (!form || !form.isActive) return NextResponse.json({ error: "Form not found" }, { status: 404 });

  await db.insert(schema.leads).values({
    accountId: form.accountId,
    leadFormId: form.id,
    name: parsed.data.name,
    email: parsed.data.email,
    phone: parsed.data.phone,
    shootType: form.shootType,
    eventDate: parsed.data.eventDate,
    message: parsed.data.message,
    answers: parsed.data.answers ?? {},
    stage: "inquiry",
    source: "lead_form",
  });
  // (worker would enqueue a lead-notify email here)
  return NextResponse.json({ ok: true, message: form.successMessage });
}
