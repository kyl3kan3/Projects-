import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { SignaturePad } from "@/components/SignaturePad";
import { Aperture } from "@/components/icons";

export const dynamic = "force-dynamic";

/** Client contract signing — paper ground, guest-book calm. */
export default async function SignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contract = await db.query.contracts.findFirst({ where: eq(schema.contracts.id, id) });
  if (!contract) notFound();
  const client = contract.clientId ? await db.query.clients.findFirst({ where: eq(schema.clients.id, contract.clientId) }) : null;
  const account = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, contract.accountId) });
  const signed = contract.status === "signed";

  return (
    <main className="paper-ground min-h-screen">
      <div className="mx-auto max-w-xl px-6 py-12">
        <div className="flex items-center justify-center gap-2"><Aperture size={22} stroke="#1b1b19" /><span className="font-semibold" style={{ color: "#1b1b19" }}>{account?.name}</span></div>
        <h1 className="t-display mt-8 text-center" style={{ fontSize: "clamp(26px, 7vw, 38px)", color: "#1b1b19" }}>{contract.title}</h1>
        {signed && (
          <p className="mt-3 text-center"><span className="pill" style={{ color: "#7ba05b", borderColor: "#b9cba6" }}><span className="dot" style={{ background: "#7ba05b" }} />EXECUTED</span></p>
        )}
        <div className="mt-8 whitespace-pre-wrap text-[15px] leading-relaxed" style={{ color: "#3a3833" }}>{contract.body}</div>
        {!signed && client && (
          <div className="mt-8 border-t pt-6" style={{ borderColor: "#e2ded4" }}>
            <p className="t-placard" style={{ color: "#6b6a63" }}>Sign as {client.name}</p>
            <SignaturePad contractId={contract.id} defaultName={client.name} defaultEmail={client.email} />
          </div>
        )}
        <p className="mt-10 text-center text-[11px] uppercase tracking-[0.08em]" style={{ color: "#9a978d" }}>Secured by LensCRM · e-signature with audit trail</p>
      </div>
    </main>
  );
}
