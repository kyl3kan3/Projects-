"use client";

import { useActionState, useState } from "react";
import {
  archiveServiceAction,
  saveHoursAction,
  saveNotifyAction,
  savePolicyAction,
  saveProfileAction,
  saveServiceAction,
  templatePolicyAction,
  type ArchiveValues,
  type HoursValues,
  type NotifyValues,
  type PolicyValues,
  type ProfileValues,
  type ServiceValues,
} from "@/app/(app)/settings/actions";
import { DetailRow, FormError } from "@/components/ui";
import { WEEKDAY_NAMES, type DayHours } from "@/lib/availability";
import { emptyState, type FormState } from "@/lib/forms";
import { duration, moneyShort } from "@/lib/format";
import { POLICY_TEMPLATES, defaultPolicyText } from "@/lib/policy";

/* ---- Services ---------------------------------------------------- */

export interface ServiceRow {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
  depositLabel: string;
  depositKind: string;
  depositValue: string;
}

const BLANK_SERVICE: FormState<ServiceValues> = emptyState({
  id: "",
  name: "",
  durationMinutes: "45",
  price: "",
  depositKind: "none",
  depositValue: "",
});

/**
 * The service editor.
 *
 * The deposit control changes shape with the rule — dollars for a flat deposit, a
 * percentage for a proportional one — because a single ambiguous "amount" box is how a $20
 * deposit becomes a 20% one.
 */
export function ServiceForm({ editing }: { editing: ServiceRow | null }) {
  const initial: FormState<ServiceValues> = editing
    ? emptyState({
        id: editing.id,
        name: editing.name,
        durationMinutes: String(editing.durationMinutes),
        price: (editing.priceCents / 100).toFixed(2),
        depositKind: editing.depositKind,
        depositValue: editing.depositValue,
      })
    : BLANK_SERVICE;
  const [state, action, pending] = useActionState(saveServiceAction, initial);
  const [depositKind, setDepositKind] = useState(initial.values.depositKind);

  return (
    <form action={action} className="stack" style={{ gap: 16 }}>
      <input type="hidden" name="id" value={editing?.id ?? ""} />
      <FormError message={state.error} />
      {state.notice && <p className="t-secondary" style={{ margin: 0 }}>{state.notice}</p>}

      <label className="field">
        <span className="t-label">Service</span>
        <input
          className="input"
          name="name"
          required
          defaultValue={state.values.name}
          placeholder="Skin fade"
        />
      </label>

      <div style={{ display: "flex", gap: 12 }}>
        <label className="field" style={{ flex: 1 }}>
          <span className="t-label">Minutes</span>
          <input
            className="input"
            name="durationMinutes"
            inputMode="numeric"
            required
            defaultValue={state.values.durationMinutes}
            placeholder="45"
          />
        </label>
        <label className="field" style={{ flex: 1 }}>
          <span className="t-label">Price</span>
          <input
            className="input"
            name="price"
            inputMode="decimal"
            required
            defaultValue={state.values.price}
            placeholder="45"
          />
        </label>
      </div>

      <label className="field">
        <span className="t-label">Deposit at booking</span>
        <select
          className="input"
          name="depositKind"
          value={depositKind}
          onChange={(e) => setDepositKind(e.target.value)}
        >
          <option value="none">No deposit</option>
          <option value="flat">A flat amount</option>
          <option value="percent">A percentage of the price</option>
        </select>
      </label>

      {depositKind !== "none" && (
        <label className="field">
          <span className="t-label">
            {depositKind === "flat" ? "Deposit in dollars" : "Deposit percentage"}
          </span>
          <input
            className="input"
            name="depositValue"
            inputMode={depositKind === "flat" ? "decimal" : "numeric"}
            required
            defaultValue={state.values.depositValue}
            placeholder={depositKind === "flat" ? "20" : "25"}
          />
          <span className="t-secondary">
            A deposit is the strongest protection there is: money already held beats a fee
            chased afterwards, and it comes off the fee first if they do not show.
          </span>
        </label>
      )}

      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? "Saving…" : editing ? "Save the service" : "Add the service"}
      </button>
    </form>
  );
}

export function ArchiveServiceForm({ id, name }: { id: string; name: string }) {
  const blank: FormState<ArchiveValues> = emptyState({});
  const [state, action, pending] = useActionState(archiveServiceAction, blank);
  return (
    <form action={action} style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <input type="hidden" name="id" value={id} />
      <button className="btn-quiet" type="submit" disabled={pending} style={{ color: "var(--color-ink-2)" }}>
        {pending ? "Archiving…" : `Archive ${name}`}
      </button>
      {state.notice && <span className="t-secondary">{state.notice}</span>}
    </form>
  );
}

/* ---- Working hours ----------------------------------------------- */

export function HoursForm({
  hours,
  minNoticeMinutes,
}: {
  hours: Record<string, DayHours>;
  minNoticeMinutes: number;
}) {
  const blank: FormState<HoursValues> = emptyState({});
  const [state, action, pending] = useActionState(saveHoursAction, blank);

  return (
    <form action={action} className="stack" style={{ gap: 16 }}>
      <FormError message={state.error} />
      {state.notice && <p className="t-secondary" style={{ margin: 0 }}>{state.notice}</p>}

      {WEEKDAY_NAMES.map((name, day) => {
        const key = String(day);
        const value = hours[key];
        return (
          <div
            key={name}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
              paddingBottom: 8,
              borderBottom: "1px solid var(--color-hairline)",
            }}
          >
            <span className="t-title" style={{ minWidth: 96 }}>
              {name}
            </span>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                name={`off-${day}`}
                defaultChecked={value.off}
                style={{ width: 22, height: 22, accentColor: "var(--color-cobalt)" }}
              />
              <span className="t-secondary">Off</span>
            </label>
            <input
              className="input"
              type="time"
              name={`open-${day}`}
              defaultValue={value.open}
              style={{ width: 116 }}
              aria-label={`${name} opens`}
            />
            <input
              className="input"
              type="time"
              name={`close-${day}`}
              defaultValue={value.close}
              style={{ width: 116 }}
              aria-label={`${name} closes`}
            />
          </div>
        );
      })}

      <label className="field">
        <span className="t-label">Minimum notice, in minutes</span>
        <input
          className="input"
          name="minNoticeMinutes"
          inputMode="numeric"
          defaultValue={String(minNoticeMinutes)}
        />
        <span className="t-secondary">
          How far ahead a client has to book. 120 keeps someone from booking the slot you are
          standing in.
        </span>
      </label>

      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save your week"}
      </button>
    </form>
  );
}

/* ---- Reminders --------------------------------------------------- */

export function NotifyForm({
  reminder48h,
  reminder2h,
  nudgeGraceDays,
  quietStartHour,
  quietEndHour,
}: {
  reminder48h: boolean;
  reminder2h: boolean;
  nudgeGraceDays: number;
  quietStartHour: number;
  quietEndHour: number;
}) {
  const blank: FormState<NotifyValues> = emptyState({});
  const [state, action, pending] = useActionState(saveNotifyAction, blank);
  return (
    <form action={action} className="stack" style={{ gap: 16 }}>
      <FormError message={state.error} />
      {state.notice && <p className="t-secondary" style={{ margin: 0 }}>{state.notice}</p>}

      <label style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <input
          type="checkbox"
          name="reminder48h"
          defaultChecked={reminder48h}
          style={{ width: 22, height: 22, accentColor: "var(--color-cobalt)" }}
        />
        <span className="t-secondary">Remind clients 48 hours before</span>
      </label>
      <label style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <input
          type="checkbox"
          name="reminder2h"
          defaultChecked={reminder2h}
          style={{ width: 22, height: 22, accentColor: "var(--color-cobalt)" }}
        />
        <span className="t-secondary">Remind clients 2 hours before</span>
      </label>

      <label className="field">
        <span className="t-label">Wait this many days past due before nudging</span>
        <input
          className="input"
          name="nudgeGraceDays"
          inputMode="numeric"
          defaultValue={String(nudgeGraceDays)}
        />
      </label>

      <div style={{ display: "flex", gap: 12 }}>
        <label className="field" style={{ flex: 1 }}>
          <span className="t-label">Quiet from (hour)</span>
          <input
            className="input"
            name="quietStartHour"
            inputMode="numeric"
            defaultValue={String(quietStartHour)}
          />
        </label>
        <label className="field" style={{ flex: 1 }}>
          <span className="t-label">Quiet until (hour)</span>
          <input
            className="input"
            name="quietEndHour"
            inputMode="numeric"
            defaultValue={String(quietEndHour)}
          />
        </label>
      </div>
      <p className="t-secondary" style={{ margin: 0 }}>
        Quiet hours are read in your own timezone, not the server's. Nothing goes out between
        them.
      </p>

      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

/* ---- Policy ------------------------------------------------------ */

export function PolicyForm({
  version,
  cancelWindowHours,
  lateCancelFeePercent,
  noShowFeePercent,
  policyText,
}: {
  version: number;
  cancelWindowHours: number;
  lateCancelFeePercent: number;
  noShowFeePercent: number;
  policyText: string;
}) {
  const initial: FormState<PolicyValues> = emptyState({
    cancelWindowHours: String(cancelWindowHours),
    lateCancelFeePercent: String(lateCancelFeePercent),
    noShowFeePercent: String(noShowFeePercent),
    policyText,
  });
  const [state, action, pending] = useActionState(savePolicyAction, initial);
  const [text, setText] = useState(initial.values.policyText);
  const [numbers, setNumbers] = useState({
    window: initial.values.cancelWindowHours,
    late: initial.values.lateCancelFeePercent,
    noShow: initial.values.noShowFeePercent,
  });

  return (
    <form action={action} className="stack" style={{ gap: 16 }}>
      <FormError message={state.error} />
      {state.notice && (
        <p className="t-secondary" style={{ margin: 0, color: "var(--color-green)" }}>
          {state.notice}
        </p>
      )}

      <div className="scroll-x">
        <div style={{ display: "flex", gap: 8 }}>
          {POLICY_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              className="chip chip-lg"
              style={{ alignItems: "flex-start", textAlign: "left", height: "auto", padding: 12 }}
              onClick={() => {
                setNumbers({
                  window: String(t.cancelWindowHours),
                  late: String(t.lateCancelFeePercent),
                  noShow: String(t.noShowFeePercent),
                });
                setText(defaultPolicyText(t));
              }}
            >
              <span className="t-title">{t.name}</span>
              <span className="t-secondary" style={{ maxWidth: "22ch", whiteSpace: "normal" }}>
                {t.blurb}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <label className="field" style={{ flex: "1 1 100px" }}>
          <span className="t-label">Free until (hours)</span>
          <input
            className="input"
            name="cancelWindowHours"
            inputMode="numeric"
            value={numbers.window}
            onChange={(e) => setNumbers({ ...numbers, window: e.target.value })}
          />
        </label>
        <label className="field" style={{ flex: "1 1 100px" }}>
          <span className="t-label">Late cancel %</span>
          <input
            className="input"
            name="lateCancelFeePercent"
            inputMode="numeric"
            value={numbers.late}
            onChange={(e) => setNumbers({ ...numbers, late: e.target.value })}
          />
        </label>
        <label className="field" style={{ flex: "1 1 100px" }}>
          <span className="t-label">No-show %</span>
          <input
            className="input"
            name="noShowFeePercent"
            inputMode="numeric"
            value={numbers.noShow}
            onChange={(e) => setNumbers({ ...numbers, noShow: e.target.value })}
          />
        </label>
      </div>

      <label className="field">
        <span className="t-label">What clients read and agree to</span>
        <textarea
          className="input"
          name="policyText"
          rows={9}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <span className="t-secondary">
          This exact text is shown on your booking page, stamped with a version and a
          timestamp when they book, and quoted on every fee receipt. Saving creates version{" "}
          {version + 1}; appointments already booked keep the version they agreed to.
        </span>
      </label>

      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save as a new version"}
      </button>

      <TemplateRewriteButton
        numbers={numbers}
        onRewrite={(next) => {
          setNumbers(next.numbers);
          setText(next.text);
        }}
      />
    </form>
  );
}

/**
 * "Rewrite from my numbers" — a button, not a form, so it cannot nest inside the policy
 * form above it. The rewrite is done with the same pure function the server uses.
 */
function TemplateRewriteButton({
  numbers,
  onRewrite,
}: {
  numbers: { window: string; late: string; noShow: string };
  onRewrite: (next: {
    numbers: { window: string; late: string; noShow: string };
    text: string;
  }) => void;
}) {
  return (
    <button
      type="button"
      className="btn-quiet"
      style={{ justifySelf: "start" }}
      onClick={() =>
        onRewrite({
          numbers,
          text: defaultPolicyText({
            cancelWindowHours: Number(numbers.window) || 24,
            lateCancelFeePercent: Number(numbers.late) || 0,
            noShowFeePercent: Number(numbers.noShow) || 0,
          }),
        })
      }
    >
      Rewrite the text from my numbers
    </button>
  );
}

/* ---- Profile ----------------------------------------------------- */

export function ProfileForm({
  displayName,
  chairLocation,
  bio,
  timezone,
}: {
  displayName: string;
  chairLocation: string;
  bio: string;
  timezone: string;
}) {
  const initial: FormState<ProfileValues> = emptyState({
    displayName,
    chairLocation,
    bio,
    timezone,
  });
  const [state, action, pending] = useActionState(saveProfileAction, initial);
  return (
    <form action={action} className="stack" style={{ gap: 16 }}>
      <FormError message={state.error} />
      {state.notice && <p className="t-secondary" style={{ margin: 0 }}>{state.notice}</p>}

      <label className="field">
        <span className="t-label">Your name, as clients know it</span>
        <input className="input" name="displayName" required defaultValue={state.values.displayName} />
      </label>
      <label className="field">
        <span className="t-label">Where your chair is</span>
        <input
          className="input"
          name="chairLocation"
          defaultValue={state.values.chairLocation}
          placeholder="Foundry Barber Co, 118 Mill St, Providence RI"
        />
      </label>
      <label className="field">
        <span className="t-label">A line about you</span>
        <textarea
          className="input"
          name="bio"
          rows={3}
          defaultValue={state.values.bio}
          placeholder="Fades, beard work and skin care. Twelve years behind the chair."
        />
      </label>
      <label className="field">
        <span className="t-label">Timezone</span>
        <input
          className="input"
          name="timezone"
          defaultValue={state.values.timezone}
          placeholder="America/New_York"
        />
        <span className="t-secondary">
          Everything a client sees — slots, reminders, quiet hours — is read in this timezone.
        </span>
      </label>
      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

/* ---- A read-only list used beside the service editor -------------- */

export function ServiceList({ services }: { services: ServiceRow[] }) {
  return (
    <div className="stack">
      {services.map((s) => (
        <DetailRow key={s.id} term={`${s.name} · ${duration(s.durationMinutes)}`}>
          {moneyShort(s.priceCents)}
          <span className="t-secondary" style={{ display: "block" }}>
            {s.depositLabel}
          </span>
        </DetailRow>
      ))}
    </div>
  );
}
