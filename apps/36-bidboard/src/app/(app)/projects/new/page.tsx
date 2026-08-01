import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ActionForm } from "@/components/ActionForm";
import { createProjectAction } from "../actions";
import { canCreateProject, PLANS } from "@/lib/plans";
import { countActiveProjects } from "@/lib/projects";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage() {
  const { company } = await requireUser();
  const active = await countActiveProjects(company.id);
  const gate = canCreateProject(company.plan, active);

  // Two weeks out is the shape of a real bid window and saves a date-picker fight.
  const suggested = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);

  return (
    <main className="wrap gutter" style={{ paddingTop: "var(--s6)" }}>
      <Link href="/projects" className="t-secondary">
        ← Projects
      </Link>
      <h1 className="t-h2" style={{ marginTop: "var(--s4)" }}>
        New project
      </h1>
      <p className="t-secondary" style={{ marginTop: "var(--s2)", marginBottom: "var(--s6)" }}>
        The bid due date drives everything: reminder rungs at T-7, T-3 and T-1, and how long
        each sub&rsquo;s link stays live.
      </p>

      {!gate.allowed ? (
        <div className="notice notice-bad" style={{ marginBottom: "var(--s5)" }}>
          {gate.reason}
          {gate.upgradeTo ? (
            <>
              {" "}
              <Link className="link" href="/settings/billing">
                See {PLANS[gate.upgradeTo].name}
              </Link>
            </>
          ) : null}
        </div>
      ) : null}

      <ActionForm
        action={createProjectAction}
        submitLabel="Create project"
        pendingLabel="Creating…"
        disabled={!gate.allowed}
      >
        <label className="field">
          <span className="t-label">Project name</span>
          <input
            className="input"
            name="name"
            required
            maxLength={160}
            placeholder="Fulton Yard — Building B TI"
          />
        </label>
        <label className="field">
          <span className="t-label">Address</span>
          <input
            className="input"
            name="address"
            maxLength={240}
            placeholder="1420 SE Fulton St, Portland OR"
          />
        </label>
        <label className="field">
          <span className="t-label">Bids due</span>
          <input className="input" name="bidDueAt" type="date" required defaultValue={suggested} />
          <span className="t-secondary">Bids are due 5:00pm on this date.</span>
        </label>
        <label className="field">
          <span className="t-label">Notes for your team</span>
          <textarea
            className="textarea"
            name="notes"
            maxLength={2000}
            placeholder="Owner meeting the 24th. Tenant wants the mechanical scope broken out."
          />
        </label>
      </ActionForm>
    </main>
  );
}
