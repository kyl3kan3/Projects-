"use client";

import { ActionForm } from "@/components/ActionForm";
import {
  payBalanceAction,
  payFirstMonthAction,
  savePaymentMethodAction,
  signLeaseAction,
} from "@/app/t/[token]/actions";

export function SignForm({ token, tenantName }: { token: string; tenantName: string }) {
  return (
    <ActionForm action={signLeaseAction} submitLabel="Sign the agreement">
      <input type="hidden" name="token" value={token} />
      <label className="field">
        <span className="field-label">Type your full name</span>
        <input className="input" name="signature" defaultValue={tenantName} required />
      </label>
      <label className="checkline">
        <input type="checkbox" name="agree" required />
        <span className="t-body">
          I have read the agreement above and I agree to it. I understand this is my electronic
          signature.
        </span>
      </label>
      <p className="field-help">
        You will get a copy with your signature, the time, and a fingerprint of the document — so
        neither of us can change it afterwards.
      </p>
    </ActionForm>
  );
}

export function MethodForm({
  token,
  methods,
  simulated,
}: {
  token: string;
  methods: readonly { id: string; label: string; detail: string }[];
  simulated: boolean;
}) {
  return (
    <ActionForm action={savePaymentMethodAction} submitLabel="Save this method">
      <input type="hidden" name="token" value={token} />
      {simulated ? (
        <>
          <p className="t-secondary" style={{ marginBottom: 12 }}>
            This facility has not connected a live payment processor, so these are{" "}
            <strong>test methods</strong> — nothing is charged to a real card. In a live facility this
            step is a card or bank form.
          </p>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field-label">Choose a test method</legend>
            {methods.map((method, i) => (
              <label className="checkline" key={method.id}>
                <input type="radio" name="methodId" value={method.id} defaultChecked={i === 0} required />
                <span className="t-body">
                  {method.label}
                  <br />
                  <span className="t-secondary">{method.detail}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </>
      ) : (
        <label className="field">
          <span className="field-label">Payment method id</span>
          <input className="input input-mono" name="methodId" placeholder="pm_…" required />
          <span className="field-help">
            Collected by Stripe on the facility&rsquo;s own account. UnitKeeper never sees the card
            number.
          </span>
        </label>
      )}
    </ActionForm>
  );
}

export function PayFirstMonthForm({ token, amountLabel }: { token: string; amountLabel: string }) {
  return (
    <ActionForm action={payFirstMonthAction} submitLabel={`Pay ${amountLabel} and get my gate code`}>
      <input type="hidden" name="token" value={token} />
    </ActionForm>
  );
}

export function PayBalanceForm({ token, amountLabel }: { token: string; amountLabel: string }) {
  return (
    <ActionForm action={payBalanceAction} submitLabel={`Pay ${amountLabel}`}>
      <input type="hidden" name="token" value={token} />
    </ActionForm>
  );
}
