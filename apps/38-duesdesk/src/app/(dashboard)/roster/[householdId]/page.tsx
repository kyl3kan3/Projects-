import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { formatIso, today } from "@/lib/dates";
import { associationBalances } from "@/lib/invoicing";
import { householdWithMembers } from "@/lib/roster";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/plans";
import { formatPhone } from "@/lib/text";
import { Money, Notice } from "@/components/ledger";
import { IconChevronLeft, IconChevronRight } from "@/components/icons";
import { AddMemberForm, PortalLinkControls, TransferForm } from "../RosterForms";

export const metadata: Metadata = { title: "Household" };
export const dynamic = "force-dynamic";

export default async function RosterHouseholdPage({
  params,
}: {
  params: Promise<{ householdId: string }>;
}) {
  const { user, association } = await requireUser();
  const { householdId } = await params;
  const entry = await householdWithMembers(householdId);
  if (!entry || entry.household.associationId !== association.id) notFound();

  const { household, members } = entry;
  const balances = await associationBalances(association.id);
  const balance = balances.get(householdId);
  const canEdit = can(user.role, "roster");
  const asOf = today();

  return (
    <main className="screen">
      <header className="pt-8">
        <Link href="/roster" className="btn-quiet inline-flex items-center gap-1">
          <IconChevronLeft size={18} />
          Roster
        </Link>
        <p className="t-label mt-6">{household.leftOn ? "Past owner" : "Household"}</p>
        <h1 className="t-h2 mt-1">{household.unitLabel}</h1>
        <p className="t-secondary mt-1">
          Joined {formatIso(household.joinedOn)}
          {household.leftOn ? ` · left ${formatIso(household.leftOn)}` : ""}
        </p>
      </header>

      <section className="mt-6">
        <Link href={`/dues/${household.id}`} className="row">
          <span className="flex-1">
            <span className="t-title">Balance and invoices</span>
            <span className="t-secondary block">
              {(balance?.balanceCents ?? 0) > 0
                ? `${formatMoney(balance!.balanceCents)} outstanding across ${balance!.openInvoices} invoice${balance!.openInvoices === 1 ? "" : "s"}`
                : "Nothing outstanding"}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <Money cents={balance?.balanceCents ?? 0} />
            <IconChevronRight size={18} className="ink-3" />
          </span>
        </Link>
      </section>

      <section className="mt-8 split">
        <div>
          <h2 className="t-h2">People</h2>
          <div className="mt-4 flex flex-col gap-4">
            {members.map((member) => (
              <article key={member.id} className="panel p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="t-title">
                      {member.name}
                      {member.isPrimary ? <span className="t-label ml-2">Primary</span> : null}
                    </p>
                    <p className="t-secondary mt-1">{member.email ?? "No email on file"}</p>
                    <p className="t-data ink-3 mt-1">{formatPhone(member.phone)}</p>
                  </div>
                </div>

                <div className="hairline-t mt-3 pt-3">
                  <p className="t-secondary">
                    Text messages:{" "}
                    {member.smsOptIn ? (
                      <span className="green">opted in</span>
                    ) : member.smsOptedOutAt ? (
                      <span className="ink-2">
                        opted out {formatIso(member.smsOptedOutAt.toISOString().slice(0, 10))}
                      </span>
                    ) : (
                      <span className="ink-2">not opted in</span>
                    )}
                  </p>
                  <p className="t-secondary mt-1 ink-3">
                    Consent is the member&apos;s to give, from their own portal — the board cannot set
                    it here, and a STOP reply switches it off immediately.
                  </p>
                </div>

                <div className="hairline-t mt-3 pt-3">
                  <p className="t-label">Payment link</p>
                  <p className="t-secondary mt-1">
                    {member.portalTokenId
                      ? `Live since ${member.portalTokenIssuedAt ? formatIso(member.portalTokenIssuedAt.toISOString().slice(0, 10)) : "issue"}. Every invoice and reminder email carries this same link, so older emails keep working — issuing a fresh one retires all of them.`
                      : "No live link yet. The next invoice or reminder email mints one automatically."}
                  </p>
                  {canEdit ? (
                    <div className="mt-3">
                      <PortalLinkControls
                        memberId={member.id}
                        hasLink={Boolean(member.portalTokenId)}
                      />
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>

          {canEdit && !household.leftOn ? (
            <div className="panel mt-4 p-4">
              <p className="t-label">Add someone</p>
              <p className="t-secondary mt-1">
                A second owner, a spouse, or a property manager who should get the invoices too.
              </p>
              <div className="mt-3">
                <AddMemberForm householdId={household.id} />
              </div>
            </div>
          ) : null}
        </div>

        <div>
          <div className="panel p-4">
            <p className="t-label">On file</p>
            <div className="mt-2">
              <Field label="Unit">{household.unitLabel}</Field>
              <Field label="Mailing address">{household.mailingAddress ?? "the unit itself"}</Field>
              <Field label="Joined">{formatIso(household.joinedOn)}</Field>
              {household.leftOn ? <Field label="Left">{formatIso(household.leftOn)}</Field> : null}
              {household.succeededById ? (
                <div className="py-1.5">
                  <Link href={`/roster/${household.succeededById}`} className="btn-quiet">
                    See the household that succeeded this one
                  </Link>
                </div>
              ) : null}
            </div>
            {household.notes ? <p className="t-secondary mt-3">{household.notes}</p> : null}
          </div>

          {canEdit && !household.leftOn ? (
            <div className="panel mt-4 p-4">
              <p className="t-label">The home sold</p>
              <p className="t-secondary mt-1">
                Close this household and open one for the buyer. History on both sides survives, which
                is the point.
              </p>
              <div className="mt-3">
                <TransferForm
                  householdId={household.id}
                  unitLabel={household.unitLabel}
                  todayIso={asOf}
                />
              </div>
            </div>
          ) : null}

          {household.leftOn && (balance?.balanceCents ?? 0) > 0 ? (
            <div className="mt-4">
              <Notice tone="warn">
                {formatMoney(balance!.balanceCents)} is still outstanding against this closed
                household. It stays here, with the people who owed it. The 90-plus bucket offers an
                export you can hand to the association&apos;s attorney.
              </Notice>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="t-secondary">{label}</span>
      <span className="t-data text-right">{children}</span>
    </div>
  );
}
