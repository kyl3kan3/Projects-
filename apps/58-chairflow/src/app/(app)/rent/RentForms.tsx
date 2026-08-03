"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  addChairAction,
  assignChairAction,
  createShopAction,
  markPaidAction,
  rolloverAction,
  sendRentLinkAction,
  updateRentAction,
  waiveRentAction,
  type ChairValues,
  type RentValues,
  type ShopValues,
} from "@/app/(app)/rent/actions";
import { FormError } from "@/components/ui";
import { emptyState, type FormState } from "@/lib/forms";

const BLANK: FormState<RentValues> = emptyState({});

export function CreateShopForm() {
  const initial: FormState<ShopValues> = emptyState({
    name: "",
    slug: "",
    address: "",
    timezone: "America/New_York",
  });
  const [state, action, pending] = useActionState(createShopAction, initial);
  return (
    <form action={action} className="stack" style={{ gap: 16 }}>
      <FormError message={state.error} />
      <label className="field">
        <span className="t-label">Shop name</span>
        <input className="input" name="name" required defaultValue={state.values.name} placeholder="Foundry Barber Co" />
      </label>
      <label className="field">
        <span className="t-label">Short name for the URL</span>
        <input
          className="input"
          name="slug"
          defaultValue={state.values.slug}
          placeholder="foundry"
          autoCapitalize="none"
        />
      </label>
      <label className="field">
        <span className="t-label">Address</span>
        <input
          className="input"
          name="address"
          defaultValue={state.values.address}
          placeholder="118 Mill St, Providence RI"
        />
      </label>
      <label className="field">
        <span className="t-label">Timezone</span>
        <input className="input" name="timezone" defaultValue={state.values.timezone} />
        <span className="t-secondary">Rent weeks start on Monday, read in the shop's own timezone.</span>
      </label>
      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create the shop"}
      </button>
    </form>
  );
}

export function AddChairForm() {
  const initial: FormState<ChairValues> = emptyState({ label: "", rent: "", handle: "" });
  const [state, action, pending] = useActionState(addChairAction, initial);
  return (
    <form action={action} className="stack" style={{ gap: 12 }}>
      <FormError message={state.error} />
      {state.notice && <p className="t-secondary" style={{ margin: 0 }}>{state.notice}</p>}
      <div style={{ display: "flex", gap: 12 }}>
        <label className="field" style={{ flex: 1 }}>
          <span className="t-label">Label</span>
          <input className="input" name="label" required defaultValue={state.values.label} placeholder="Chair 4" />
        </label>
        <label className="field" style={{ flex: 1 }}>
          <span className="t-label">Weekly rent</span>
          <input
            className="input"
            name="rent"
            inputMode="decimal"
            required
            defaultValue={state.values.rent}
            placeholder="250"
          />
        </label>
      </div>
      <label className="field">
        <span className="t-label">Renter's ChairFlow handle (optional)</span>
        <input
          className="input"
          name="handle"
          defaultValue={state.values.handle}
          placeholder="deecuts"
          autoCapitalize="none"
        />
      </label>
      <button className="btn btn-secondary" type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add the chair"}
      </button>
    </form>
  );
}

export function AssignChairForm({ chairId, handle }: { chairId: string; handle: string }) {
  const [state, action, pending] = useActionState(assignChairAction, BLANK);
  return (
    <form action={action} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <input type="hidden" name="chairId" value={chairId} />
      <label className="field" style={{ flex: "1 1 140px" }}>
        <span className="t-label">Renter</span>
        <input className="input" name="handle" defaultValue={handle} placeholder="empty = vacant" autoCapitalize="none" />
      </label>
      <button className="btn btn-secondary" type="submit" disabled={pending} style={{ flex: "none" }}>
        {pending ? "Saving…" : "Assign"}
      </button>
      {state.error && (
        <span className="t-secondary" style={{ color: "var(--color-red)" }}>
          {state.error}
        </span>
      )}
      {state.notice && <span className="t-secondary">{state.notice}</span>}
    </form>
  );
}

export function UpdateRentForm({ chairId, rent }: { chairId: string; rent: string }) {
  const [state, action, pending] = useActionState(updateRentAction, BLANK);
  return (
    <form action={action} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <input type="hidden" name="chairId" value={chairId} />
      <label className="field" style={{ flex: "1 1 120px" }}>
        <span className="t-label">Weekly rent</span>
        <input className="input" name="rent" inputMode="decimal" defaultValue={rent} />
      </label>
      <button className="btn btn-secondary" type="submit" disabled={pending} style={{ flex: "none" }}>
        {pending ? "Saving…" : "Save"}
      </button>
      {state.error && (
        <span className="t-secondary" style={{ color: "var(--color-red)" }}>
          {state.error}
        </span>
      )}
      {state.notice && <span className="t-secondary">{state.notice}</span>}
    </form>
  );
}

/**
 * Mark a rent week paid — hold to confirm, 600ms.
 *
 * The hold timer calls `requestSubmit()` on the form directly. Wrapping it in
 * `startTransition` inside a state updater is what throws in React 19 and surfaces as a
 * client-side exception where the feature should be.
 */
export function MarkPaidForm({ rentPeriodId, label }: { rentPeriodId: string; label: string }) {
  const [state, action, pending] = useActionState(markPaidAction, BLANK);
  const [holding, setHolding] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <form ref={formRef} action={action} className="stack" style={{ gap: 4 }}>
      <input type="hidden" name="rentPeriodId" value={rentPeriodId} />
      <button
        type="submit"
        className="btn btn-primary hold"
        data-holding={holding ? "true" : "false"}
        disabled={pending}
        onPointerDown={() => {
          setHolding(true);
          timer.current = setTimeout(() => {
            setHolding(false);
            formRef.current?.requestSubmit();
          }, 600);
        }}
        onPointerUp={() => {
          setHolding(false);
          if (timer.current) clearTimeout(timer.current);
        }}
        onPointerLeave={() => {
          setHolding(false);
          if (timer.current) clearTimeout(timer.current);
        }}
        onClick={(e) => e.preventDefault()}
      >
        {pending ? "Saving…" : `Hold to mark ${label} paid`}
      </button>
      {state.error && (
        <span className="t-secondary" style={{ color: "var(--color-red)" }}>
          {state.error}
        </span>
      )}
      {state.notice && <span className="t-secondary">{state.notice}</span>}
    </form>
  );
}

export function WaiveRentForm({ rentPeriodId }: { rentPeriodId: string }) {
  const [state, action, pending] = useActionState(waiveRentAction, BLANK);
  return (
    <form action={action} className="stack" style={{ gap: 4 }}>
      <input type="hidden" name="rentPeriodId" value={rentPeriodId} />
      <button className="btn-quiet" type="submit" disabled={pending}>
        {pending ? "Waiving…" : "Waive this week"}
      </button>
      {state.error && (
        <span className="t-secondary" style={{ color: "var(--color-red)" }}>
          {state.error}
        </span>
      )}
      {state.notice && <span className="t-secondary">{state.notice}</span>}
    </form>
  );
}

export function SendRentLinkForm({ rentPeriodId }: { rentPeriodId: string }) {
  const [state, action, pending] = useActionState(sendRentLinkAction, BLANK);
  return (
    <form action={action} className="stack" style={{ gap: 4 }}>
      <input type="hidden" name="rentPeriodId" value={rentPeriodId} />
      <button className="btn btn-secondary" type="submit" disabled={pending}>
        {pending ? "Creating…" : "Send payment link"}
      </button>
      {state.error && (
        <span className="t-secondary" style={{ color: "var(--color-amber-text)" }}>
          {state.error}
        </span>
      )}
      {state.notice && (
        <span className="t-secondary" style={{ wordBreak: "break-all" }}>
          {state.notice}
        </span>
      )}
    </form>
  );
}

export function RolloverForm() {
  const [state, action, pending] = useActionState(rolloverAction, BLANK);
  return (
    <form action={action} className="stack" style={{ gap: 4 }}>
      <button className="btn-quiet" type="submit" disabled={pending}>
        {pending ? "Opening…" : "Open this week's rent"}
      </button>
      {state.error && (
        <span className="t-secondary" style={{ color: "var(--color-red)" }}>
          {state.error}
        </span>
      )}
      {state.notice && <span className="t-secondary">{state.notice}</span>}
    </form>
  );
}
