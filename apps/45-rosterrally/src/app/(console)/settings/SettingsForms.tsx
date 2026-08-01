"use client";

import { ActionForm, type FormState } from "@/components/ActionForm";

type Action = (prev: FormState, form: FormData) => Promise<FormState>;

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

export function ClubForm({
  action,
  club,
  settings,
}: {
  action: Action;
  club: { name: string; timezone: string };
  settings: { smsMonthlyBudget: number; replyToEmail: string };
}) {
  return (
    <ActionForm action={action} submitLabel="Save club" full>
      <div className="field">
        <label className="t-label" htmlFor="club-name">
          Club name
        </label>
        <input id="club-name" name="name" className="input" defaultValue={club.name} required />
      </div>
      <div className="field">
        <label className="t-label" htmlFor="club-tz">
          Timezone
        </label>
        <select id="club-tz" name="timezone" className="input" defaultValue={club.timezone}>
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        <p className="t-secondary">
          Game times are typed in this zone and stored as instants, so a game on the weekend the
          clocks change stays at the time you meant.
        </p>
      </div>
      <div className="field">
        <label className="t-label" htmlFor="sms-budget">
          Monthly SMS budget
        </label>
        <input
          id="sms-budget"
          name="smsMonthlyBudget"
          type="number"
          min={0}
          className="input input-mono"
          defaultValue={settings.smsMonthlyBudget}
        />
        <p className="t-secondary">
          Texts stop rather than bill past this. Skipped sends show as SKIPPED on the receipt grid,
          with the reason.
        </p>
      </div>
      <div className="field">
        <label className="t-label" htmlFor="reply-to">
          Reply-to for parents
        </label>
        <input
          id="reply-to"
          name="replyToEmail"
          type="email"
          className="input"
          defaultValue={settings.replyToEmail}
          placeholder="registrar@millbrooksoccer.org"
        />
      </div>
    </ActionForm>
  );
}

export function PlanForm({ action, plan }: { action: Action; plan: string }) {
  const next = plan === "flat" ? "per_registration" : "flat";
  return (
    <ActionForm
      action={action}
      submitLabel={
        next === "flat" ? "Switch to $49/mo flat" : "Switch to $1.50 per paid registration"
      }
      variant="secondary"
      full
    >
      <input type="hidden" name="plan" value={next} />
    </ActionForm>
  );
}

export function StripeForm({
  action,
  accountId,
}: {
  action: Action;
  accountId: string | null;
}) {
  return (
    <ActionForm action={action} submitLabel="Save Stripe account" variant="secondary" full>
      <div className="field">
        <label className="t-label" htmlFor="stripe-account">
          The club&apos;s Stripe account id
        </label>
        <input
          id="stripe-account"
          name="stripeAccountId"
          className="input input-mono"
          defaultValue={accountId ?? ""}
          placeholder="acct_1234ABCD"
        />
        <p className="t-secondary">
          Registration money lands in the club&apos;s own balance and our $1.50 splits off as an
          application fee. It never sits with us, which is the answer to &ldquo;who is holding our
          parents&apos; money?&rdquo;
        </p>
      </div>
    </ActionForm>
  );
}

export function InviteForm({ action }: { action: Action }) {
  return (
    <details className="disclosure panel mt-4 p-4">
      <summary className="t-title">Add someone to the club</summary>
      <div className="pt-4">
        <ActionForm action={action} submitLabel="Add them" full>
          <div className="field">
            <label className="t-label" htmlFor="invite-name">
              Name
            </label>
            <input id="invite-name" name="name" className="input" required />
          </div>
          <div className="field">
            <label className="t-label" htmlFor="invite-email">
              Email
            </label>
            <input id="invite-email" name="email" type="email" className="input" required />
          </div>
          <div className="field">
            <label className="t-label" htmlFor="invite-role">
              Role
            </label>
            <select id="invite-role" name="role" className="input" defaultValue="coach">
              <option value="admin">Admin — everything, including unlocking rosters</option>
              <option value="registrar">Registrar — season, money, rosters, schedule, comms</option>
              <option value="treasurer">Treasurer — money and comms</option>
              <option value="coach">Coach — their own teams only, no medical, no money</option>
              <option value="manager">Team manager — same as coach</option>
            </select>
          </div>
        </ActionForm>
      </div>
    </details>
  );
}

export function RoleForm({
  action,
  userId,
  role,
}: {
  action: Action;
  userId: string;
  role: string;
}) {
  return (
    <ActionForm action={action} submitLabel="Change" variant="quiet" small>
      <input type="hidden" name="userId" value={userId} />
      <select name="role" className="input btn-small" defaultValue={role} style={{ height: 36 }}>
        <option value="admin">admin</option>
        <option value="registrar">registrar</option>
        <option value="treasurer">treasurer</option>
        <option value="coach">coach</option>
        <option value="manager">manager</option>
      </select>
    </ActionForm>
  );
}

export function LogoutForm({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action} className="mt-8">
      <button type="submit" className="btn-quiet">
        Sign out
      </button>
    </form>
  );
}
