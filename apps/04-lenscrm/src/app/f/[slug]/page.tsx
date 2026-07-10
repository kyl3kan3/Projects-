import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { LeadFormClient } from "@/components/LeadFormClient";
import { Aperture } from "@/components/icons";

export const dynamic = "force-dynamic";
export default async function LeadFormPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const form = await db.query.leadForms.findFirst({ where: eq(schema.leadForms.slug, slug) });
  if (!form || !form.isActive) notFound();
  const account = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, form.accountId) });
  return (
    <main className="paper-ground min-h-screen">
      <div className="mx-auto max-w-md px-5 py-12">
        <div className="flex flex-col items-center gap-2 text-center"><Aperture size={24} stroke="#1b1b19" /><span className="font-semibold" style={{ color: "#1b1b19" }}>{account?.name}</span></div>
        <h1 className="t-display mt-6 text-center" style={{ fontSize: "clamp(24px, 7vw, 32px)", color: "#1b1b19" }}>{form.name}</h1>
        <div className="mt-8"><LeadFormClient formSlug={form.slug} successMessage={form.successMessage ?? "Thank you!"} /></div>
      </div>
    </main>
  );
}
