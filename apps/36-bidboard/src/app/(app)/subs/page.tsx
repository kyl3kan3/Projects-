import type { Metadata } from "next";
import Link from "next/link";
import { canWrite, requireUser } from "@/lib/auth";
import { ActionForm } from "@/components/ActionForm";
import { Pill } from "@/components/StatusPill";
import { IconHardHat, IconPlus } from "@/components/icons";
import { DIVISIONS, divisionLabel } from "@/lib/csi";
import { listDirectory, tradeCoverage } from "@/lib/subs";
import { addContactAction, addSubAction, importSubsAction, updateSubAction } from "./actions";

export const metadata: Metadata = { title: "Sub directory" };

const SAMPLE = `Company,Contact,Email,Phone,Trades,City
Meridian Electric,Dana Reyes,dana@meridian-elec.example,503-555-0142,26;27,Portland
Harlan Voss Electric,Hal Voss,hal@harlanvoss.example,503-555-0199,26,Beaverton
Cass Ridge Drywall,Marta Cass,office@cassridge.example,,Drywall,Gresham`;

export default async function SubsPage({
  searchParams,
}: {
  searchParams: Promise<{ trade?: string }>;
}) {
  const { trade } = await searchParams;
  const { company, user } = await requireUser();
  const filter = trade && DIVISIONS.some((d) => d.code === trade) ? trade : null;
  const [directory, coverage] = await Promise.all([
    listDirectory(company.id, filter),
    tradeCoverage(company.id),
  ]);
  const writable = canWrite(user.role);
  const total = [...coverage.values()].length;

  return (
    <main className="wrap">
      <header className="gutter" style={{ paddingBlock: "var(--s5)" }}>
        <h1 className="t-h2">
          <IconHardHat size={20} /> Your subs
        </h1>
        <p className="t-secondary" style={{ marginTop: "var(--s2)" }}>
          Private to you. Never a network, never shared with another GC, never sold — which is also
          why it is worth importing.
        </p>
      </header>

      {/* ---------------------------------------------------------- coverage --- */}
      {total > 0 ? (
        <section className="gutter" style={{ paddingBottom: "var(--s5)" }}>
          <h2 className="t-label">Coverage by division</h2>
          <div
            style={{
              display: "flex",
              gap: "var(--s2)",
              flexWrap: "wrap",
              marginTop: "var(--s3)",
            }}
          >
            {DIVISIONS.filter((d) => coverage.has(d.code)).map((d) => {
              const count = coverage.get(d.code)!;
              const thin = count < 3;
              return (
                <Link
                  key={d.code}
                  href={filter === d.code ? "/subs" : `/subs?trade=${d.code}`}
                  className="chip"
                  data-on={filter === d.code ? "true" : undefined}
                  title={`${count} sub${count === 1 ? "" : "s"} tagged ${d.label}`}
                >
                  <span className="t-data">{d.code}</span>
                  <span style={{ color: thin ? "var(--warn)" : undefined }}>{count}</span>
                </Link>
              );
            })}
          </div>
          {[...coverage.entries()].some(([, n]) => n < 3) ? (
            <p className="notice" style={{ marginTop: "var(--s4)" }}>
              Divisions in amber have fewer than three subs. Two bids is not a comparison — it is a
              coin flip with a spreadsheet.
            </p>
          ) : null}
        </section>
      ) : null}

      {/* --------------------------------------------------------- directory --- */}
      <section className="hairline-t" style={{ paddingTop: "var(--s5)" }}>
        <div
          className="gutter"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}
        >
          <h2 className="t-label">
            {filter ? `${filter} · ${divisionLabel(filter)}` : "All subs"}
          </h2>
          <span className="t-data" style={{ color: "var(--fg-3)" }}>
            {directory.length}
          </span>
        </div>

        {directory.length === 0 ? (
          <p className="gutter t-secondary" style={{ marginTop: "var(--s3)" }}>
            {filter ? (
              <>
                Nobody tagged for {divisionLabel(filter).toLowerCase()} yet.{" "}
                <Link className="link" href="/subs">
                  Show all
                </Link>
              </>
            ) : (
              "Nothing here yet. Paste your spreadsheet below — it takes about a minute and it is the thing that makes everything after it fast."
            )}
          </p>
        ) : (
          <div className="rows stagger" style={{ marginTop: "var(--s3)" }}>
            {directory.map(({ sub, contacts }) => (
              <div key={sub.id} className="gutter stack" style={{ gap: "var(--s2)", paddingBlock: "var(--s4)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--s3)" }}>
                  <span className="t-title">{sub.name}</span>
                  {sub.source === "import" ? <Pill tone="neutral">IMPORTED</Pill> : null}
                </div>
                <span className="t-data" style={{ color: "var(--fg-2)", fontSize: 12 }}>
                  {sub.trades.length > 0 ? sub.trades.join(" · ") : "NO TRADE TAGS"}
                  {sub.city ? ` · ${sub.city.toUpperCase()}` : ""}
                </span>
                {contacts.map((c) => (
                  <span key={c.id} className="t-secondary" style={{ fontSize: 13 }}>
                    {c.name} · {c.email}
                    {c.phone ? ` · ${c.phone}` : ""}
                    {c.isPrimary ? " · primary" : ""}
                  </span>
                ))}
                {sub.performanceNote ? (
                  <p className="notice notice-accent" style={{ marginTop: "var(--s1)" }}>
                    {sub.performanceNote}
                  </p>
                ) : null}
                {sub.notes ? <p className="t-secondary">{sub.notes}</p> : null}

                {writable ? (
                  <details style={{ marginTop: "var(--s2)" }}>
                    <summary className="btn-quiet">Edit / add a contact</summary>
                    <div className="stack" style={{ gap: "var(--s6)", marginTop: "var(--s4)" }}>
                      <ActionForm
                        action={updateSubAction}
                        submitLabel="Save"
                        hiddenFields={{ subCompanyId: sub.id }}
                      >
                        <fieldset
                          className="field"
                          style={{ border: 0, padding: 0, margin: 0 }}
                        >
                          <legend className="t-label">Trades</legend>
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "var(--s2)",
                              marginTop: "var(--s2)",
                            }}
                          >
                            {DIVISIONS.map((d) => (
                              <label key={d.code} className="chip" data-on={sub.trades.includes(d.code) ? "true" : undefined}>
                                <input
                                  type="checkbox"
                                  name="trades"
                                  value={d.code}
                                  defaultChecked={sub.trades.includes(d.code)}
                                />
                                <span className="t-data">{d.code}</span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        <label className="field">
                          <span className="t-label">How they perform</span>
                          <input
                            className="input"
                            name="performanceNote"
                            defaultValue={sub.performanceNote ?? ""}
                            maxLength={300}
                            placeholder="Always bids. Slow on submittals."
                          />
                        </label>
                        <label className="field">
                          <span className="t-label">Notes</span>
                          <textarea
                            className="textarea"
                            name="notes"
                            defaultValue={sub.notes ?? ""}
                            maxLength={1000}
                          />
                        </label>
                      </ActionForm>

                      <ActionForm
                        action={addContactAction}
                        submitLabel="Add contact"
                        variant="secondary"
                        hiddenFields={{ subCompanyId: sub.id }}
                      >
                        <label className="field">
                          <span className="t-label">Name</span>
                          <input className="input" name="name" maxLength={120} />
                        </label>
                        <label className="field">
                          <span className="t-label">Email</span>
                          <input className="input" name="email" type="email" required />
                        </label>
                        <label className="field">
                          <span className="t-label">Phone</span>
                          <input className="input" name="phone" maxLength={40} />
                        </label>
                      </ActionForm>
                    </div>
                  </details>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------ import --- */}
      {writable ? (
        <>
          <section className="hairline-t" style={{ marginTop: "var(--s6)", paddingTop: "var(--s5)" }}>
            <details className="gutter" open={directory.length === 0}>
              <summary className="btn-quiet">Import from a spreadsheet</summary>
              <div style={{ marginTop: "var(--s4)" }}>
                <p className="t-secondary">
                  Paste the columns straight out of Excel, or pick a CSV. Headers are read if they
                  are there and guessed if they are not; a row without a company name or a usable
                  email is skipped and reported, never imported half-formed.
                </p>
                <ActionForm
                  action={importSubsAction}
                  submitLabel="Import"
                  pendingLabel="Importing…"
                  className="flex flex-col gap-3"
                >
                  <label className="field" style={{ marginTop: "var(--s4)" }}>
                    <span className="t-label">Paste rows</span>
                    <textarea
                      className="textarea"
                      name="pasted"
                      rows={6}
                      style={{ fontFamily: "var(--font-mono)", fontSize: 13, minHeight: 140 }}
                      placeholder={SAMPLE}
                    />
                  </label>
                  <label className="field">
                    <span className="t-label">…or a CSV file</span>
                    <input
                      className="input"
                      type="file"
                      name="file"
                      accept=".csv,.tsv,.txt"
                      style={{ paddingBlock: 12 }}
                    />
                  </label>
                </ActionForm>
              </div>
            </details>
          </section>

          <section className="hairline-t" style={{ marginTop: "var(--s6)", paddingTop: "var(--s5)" }}>
            <details className="gutter">
              <summary className="btn-quiet">
                <IconPlus size={16} /> Add one sub by hand
              </summary>
              <div style={{ marginTop: "var(--s4)" }}>
                <ActionForm action={addSubAction} submitLabel="Add sub">
                  <label className="field">
                    <span className="t-label">Company</span>
                    <input className="input" name="name" required maxLength={120} placeholder="Northfield Roofing" />
                  </label>
                  <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
                    <legend className="t-label">Trades</legend>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "var(--s2)",
                        marginTop: "var(--s2)",
                      }}
                    >
                      {DIVISIONS.map((d) => (
                        <label key={d.code} className="chip">
                          <input type="checkbox" name="trades" value={d.code} />
                          <span className="t-data">{d.code}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label className="field">
                    <span className="t-label">City</span>
                    <input className="input" name="city" maxLength={80} placeholder="Portland" />
                  </label>
                  <label className="field">
                    <span className="t-label">Contact name</span>
                    <input className="input" name="contactName" maxLength={120} placeholder="Ruth Northfield" />
                  </label>
                  <label className="field">
                    <span className="t-label">Contact email</span>
                    <input
                      className="input"
                      name="contactEmail"
                      type="email"
                      required
                      placeholder="ruth@northfieldroofing.example"
                    />
                  </label>
                  <label className="field">
                    <span className="t-label">Phone</span>
                    <input className="input" name="contactPhone" maxLength={40} />
                  </label>
                  <label className="field">
                    <span className="t-label">Notes</span>
                    <textarea className="textarea" name="notes" maxLength={1000} />
                  </label>
                </ActionForm>
              </div>
            </details>
          </section>
        </>
      ) : null}
    </main>
  );
}
