import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CancelRegistrationForm,
  RecordPaymentForm,
  RefundForm,
  ResendLinkForm,
  RevokeLinkForm,
} from "../RegistrationForms";
import {
  cancelRegistrationAction,
  recordPaymentAction,
  refundAction,
  resendLinkAction,
  revokeLinkAction,
} from "../actions";
import { Money, ScreenTitle, SectionHead, StatePill } from "@/components/ui";
import { IconMail, IconPhone } from "@/components/icons";
import { requireUser, can } from "@/lib/auth";
import { decryptContacts, decryptField } from "@/lib/crypto";
import { getRegistrationDetail } from "@/lib/registration";
import { formatMoney } from "@/lib/money";
import { formatIso } from "@/lib/time";

export const metadata: Metadata = { title: "Registration" };

export default async function RegistrationDetailPage({
  params,
}: {
  params: Promise<{ registrationId: string }>;
}) {
  const { club, user } = await requireUser();
  const { registrationId } = await params;
  const detail = await getRegistrationDetail(registrationId);
  if (!detail || detail.reg.clubId !== club.id) notFound();

  const seesMoney = can(user.role, "manage_money");
  const seesMedical = can(user.role, "view_medical");
  const medical = seesMedical ? decryptField(detail.player.medicalNotesEnc) : null;
  const contacts = seesMedical ? decryptContacts(detail.player.emergencyContactsEnc) : [];

  return (
    <main className="screen">
      <ScreenTitle
        eyebrow={`${detail.division.name} · ${detail.season.name}`}
        title={`${detail.player.firstName} ${detail.player.lastName}`}
        action={<StatePill state={detail.state} />}
      />

      <div className="panel p-4">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="t-label">Fee agreed</p>
            <p className="t-data-lg mt-1">{formatMoney(detail.reg.amountCents)}</p>
          </div>
          <div className="text-right">
            <p className="t-label">Still to pay</p>
            <p
              className="t-data-lg mt-1"
              style={{ color: detail.balanceCents > 0 ? "var(--warn)" : "var(--accent)" }}
            >
              {formatMoney(detail.balanceCents)}
            </p>
          </div>
        </div>
        <div className="mt-4 hairline-t pt-3">
          <p className="t-label">How that was priced</p>
          <div className="mt-2 flex justify-between">
            <span className="t-secondary">Division fee</span>
            <Money cents={detail.reg.feeCents} />
          </div>
          {detail.reg.discounts.map((d, i) => (
            <div key={`${d.kind}-${i}`} className="mt-1 flex justify-between">
              <span className="t-secondary turf">{d.label}</span>
              <span className="t-data turf">−{formatMoney(d.amountCents)}</span>
            </div>
          ))}
          {detail.reg.platformFeeCents > 0 ? (
            <div className="mt-1 flex justify-between">
              <span className="t-secondary" style={{ color: "var(--fg-3)" }}>
                RosterRally fee (ours)
              </span>
              <span className="t-data" style={{ color: "var(--fg-3)" }}>
                {formatMoney(detail.reg.platformFeeCents)}
              </span>
            </div>
          ) : null}
        </div>
        {detail.householdMoney.creditCents > 0 ? (
          <p className="t-secondary mt-3 turf">
            This family holds {formatMoney(detail.householdMoney.creditCents)} in credit, which is
            already counted against what they owe.
          </p>
        ) : null}
      </div>

      <SectionHead>The family</SectionHead>
      <div className="row">
        <span className="min-w-0 flex-1">
          <span className="t-title block">{detail.household.contactName}</span>
          <span className="t-secondary flex items-center gap-2" style={{ color: "var(--fg-3)" }}>
            <IconMail size={14} />
            {detail.household.email}
          </span>
          {detail.household.phone ? (
            <span className="t-secondary flex items-center gap-2" style={{ color: "var(--fg-3)" }}>
              <IconPhone size={14} />
              {detail.household.phone}
              {detail.household.smsConsent ? " · texts allowed" : " · no text consent"}
            </span>
          ) : null}
        </span>
      </div>
      <div className="mt-3 flex flex-col gap-3">
        <ResendLinkForm
          action={resendLinkAction}
          householdId={detail.household.id}
          seasonId={detail.season.id}
        />
        {can(user.role, "manage_club") ? (
          <RevokeLinkForm action={revokeLinkAction} householdId={detail.household.id} />
        ) : null}
      </div>

      <SectionHead>Child</SectionHead>
      <div className="row">
        <span className="t-title flex-1">Birthdate</span>
        <span className="t-data">{formatIso(detail.player.birthdate)}</span>
      </div>
      <div className="row">
        <span className="t-title flex-1">Waiver</span>
        <span className="t-data" style={{ color: detail.reg.waiverAckAt ? "var(--accent)" : "var(--bad)" }}>
          {detail.reg.waiverAckAt
            ? `ACKNOWLEDGED ${detail.reg.waiverAckAt.toISOString().slice(0, 10)}`
            : "NOT ACKNOWLEDGED"}
        </span>
      </div>

      {seesMedical ? (
        <>
          <SectionHead>Medical and emergency</SectionHead>
          <p className="t-secondary">
            Encrypted at rest and never shown to coaches, never in an export.
          </p>
          <div className="panel mt-2 p-4">
            <p className="t-label">Medical notes</p>
            <p className="t-body mt-1">{medical ?? "Nothing on file."}</p>
            <p className="t-label mt-4">Emergency contacts</p>
            {contacts.length === 0 ? (
              <p className="t-body mt-1">None given.</p>
            ) : (
              contacts.map((c, i) => (
                <p key={i} className="t-body mt-1">
                  {c.name} · {c.phone} · {c.relationship}
                </p>
              ))
            )}
          </div>
        </>
      ) : (
        <>
          <SectionHead>Medical and emergency</SectionHead>
          <p className="t-secondary">
            Your role ({user.role}) does not see medical notes or emergency contacts.
          </p>
        </>
      )}

      {detail.plan ? (
        <>
          <SectionHead>Payment plan</SectionHead>
          <div className="row">
            <span className="t-title flex-1">Deposit</span>
            <Money cents={detail.plan.depositCents} />
          </div>
          {detail.plan.installments.map((i, idx) => (
            <div key={idx} className="row">
              <span className="t-title flex-1">Payment {idx + 1}</span>
              <span className="t-data" style={{ color: "var(--fg-2)" }}>
                {formatIso(i.dueOn)}
              </span>
              <Money cents={i.amountCents} />
            </div>
          ))}
        </>
      ) : null}

      <SectionHead>Money in and out</SectionHead>
      {detail.history.length === 0 ? (
        <p className="t-secondary py-2">Nothing has been paid on this registration yet.</p>
      ) : (
        <div className="stagger">
          {detail.history.map((h, i) => (
            <div key={`${h.payment.id}-${i}`} className="row">
              <span className="min-w-0 flex-1">
                <span className="t-title block">
                  {h.payment.kind === "refund" ? "Refund" : "Payment"} · {h.payment.method}
                </span>
                <span className="t-secondary block" style={{ color: "var(--fg-3)" }}>
                  {formatIso(h.payment.receivedOn)}
                  {h.payment.note ? ` · ${h.payment.note}` : ""}
                </span>
              </span>
              <span
                className="t-data"
                style={{ color: h.amountCents < 0 ? "var(--bad)" : "var(--accent)" }}
              >
                {h.amountCents < 0 ? "−" : "+"}
                {formatMoney(Math.abs(h.amountCents))}
              </span>
            </div>
          ))}
        </div>
      )}

      {seesMoney ? (
        <>
          <RecordPaymentForm
            action={recordPaymentAction}
            householdId={detail.household.id}
            suggestCents={detail.householdMoney.netDueCents}
          />
          {detail.allocatedCents > 0 ? (
            <RefundForm
              action={refundAction}
              registrationId={detail.reg.id}
              maxCents={detail.allocatedCents}
            />
          ) : null}
          {detail.reg.status === "active" || detail.reg.status === "waitlisted" ? (
            <CancelRegistrationForm
              action={cancelRegistrationAction}
              registrationId={detail.reg.id}
              settledCents={detail.allocatedCents}
            />
          ) : null}
        </>
      ) : null}

      <p className="mt-8">
        <Link href="/registrations" className="btn-quiet">
          Back to registrations
        </Link>
      </p>
    </main>
  );
}
