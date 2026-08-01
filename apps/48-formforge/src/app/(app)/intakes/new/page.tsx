import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { actorFor, requireUser } from "@/lib/auth";
import { listForms } from "@/lib/forms";
import { listPatients } from "@/lib/patients";
import { clinicianCount } from "@/lib/practices";
import { sendGate } from "@/lib/plans";
import { clientIp } from "@/lib/request";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SendIntakeForm } from "./SendIntakeForm";

export const metadata: Metadata = { title: "Send an intake" };

/**
 * The send sheet: patient, packet, channels (DESIGN.md "Intakes ... sheet").
 *
 * The existing-patient list is decrypted here, once, through the audited helper —
 * which is also why it is a list and not a live search box: an autocomplete that
 * decrypted on every keystroke would write an audit row per keystroke and make the
 * ledger useless.
 */
export default async function NewIntakePage() {
  const { user, practice } = await requireUser();

  const gate = sendGate({
    plan: practice.plan,
    clinicians: await clinicianCount(practice.id),
    trialEndsAt: practice.trialEndsAt,
    subscriptionStatus: practice.subscriptionStatus,
  });
  if (!gate.canSend) redirect("/intakes");

  const db = getDb();
  const [forms, patients, staff] = await Promise.all([
    listForms(practice.id),
    listPatients(practice, actorFor(user, await clientIp())),
    db
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(eq(users.practiceId, practice.id)),
  ]);

  const live = forms.filter((f) => f.status === "live" && f.version > 0);
  if (live.length === 0) {
    return (
      <main className="screen pt-6">
        <h1 className="t-h2">Send an intake</h1>
        <div className="panel mt-5 p-5">
          <p className="t-title">No published packet yet</p>
          <p className="t-secondary mt-1 mb-4">
            A packet has to be published before it can be sent — publishing takes a snapshot of the
            exact wording, which is what a signature later points at.
          </p>
          <Link href="/forms" className="btn btn-secondary">
            Go to packets
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="screen pt-6">
      <Link href="/intakes" className="btn-quiet mb-4 inline-block">
        Back to intakes
      </Link>
      <h1 className="t-h2 mb-1">Send an intake</h1>
      <p className="t-secondary mb-6">
        The link is unique to this patient and expires in {practice.settings.linkDays} days. The
        message carries their first name, your practice name and the link — nothing else.
      </p>

      <SendIntakeForm
        forms={live.map((f) => ({ id: f.id, title: f.title, version: f.version }))}
        patients={patients.map((p) => ({
          id: p.id,
          fullName: p.fullName,
          firstName: p.firstName,
          lastName: p.lastName,
          email: p.email,
          phone: p.phone,
          dob: p.dob,
        }))}
        staff={staff.filter((s) => s.role !== "frontdesk").map((s) => ({ id: s.id, name: s.name }))}
        defaultAssigneeId={user.id}
      />
    </main>
  );
}
