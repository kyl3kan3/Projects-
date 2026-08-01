import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listForms } from "@/lib/forms";
import { validateForm } from "@/lib/blocks";
import { TEMPLATES } from "@/lib/templates";
import { settingsOf } from "@/lib/practices";
import { shortDate } from "@/lib/format";
import { IconChevronRight } from "@/components/icons";
import { copyTemplateAction } from "./actions";

export const metadata: Metadata = { title: "Packets" };

/**
 * Packets: what this practice sends, plus the template gallery.
 *
 * The gallery is the ten-minute onboarding path from README's positioning — copy a
 * vertical's packet, change the consent text to name your practice, publish. Each
 * card says plainly that the consent copy is a starting point for the practice's own
 * counsel, because a template that implies legal review has happened is worse than
 * no template.
 */
export default async function FormsPage() {
  const { practice } = await requireUser();
  const forms = await listForms(practice.id);
  const settings = settingsOf(practice);
  const active = forms.filter((f) => f.status !== "archived");

  return (
    <main className="screen pt-6">
      <h1 className="t-h2 mb-1">Packets</h1>
      <p className="t-secondary mb-6">
        Publishing snapshots the exact wording. A signature always points at the version the
        patient actually saw, so editing a live packet is safe.
      </p>

      {active.length > 0 && (
        <section className="mb-10">
          <h2 className="t-label mb-1">Your packets</h2>
          <ul className="list-none p-0">
            {active.map((form, i) => {
              const problems = validateForm(form.blocks);
              return (
                <li key={form.id} className="enter" style={{ animationDelay: `${i * 24}ms` }}>
                  <Link href={`/forms/${form.id}`} className="row no-underline">
                    <span className="min-w-0 flex-1">
                      <span className="t-title block truncate">{form.title}</span>
                      <span className="t-secondary block truncate">
                        {form.blocks.length} blocks ·{" "}
                        {form.status === "live" ? (
                          <span className="t-data" style={{ fontSize: 12 }}>
                            V{form.version} · {shortDate(form.updatedAt, settings.timeZone)}
                          </span>
                        ) : (
                          "draft"
                        )}
                        {problems.length > 0 && (
                          <span style={{ color: "var(--color-clay)" }}>
                            {" · "}
                            {problems.length} thing{problems.length === 1 ? "" : "s"} to fix
                          </span>
                        )}
                      </span>
                    </span>
                    <span style={{ color: "var(--color-ink-3)" }}>
                      <IconChevronRight size={18} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h2 className="t-label mb-1">Template gallery</h2>
        <p className="t-secondary mb-4">
          Complete packets you can edit. The consent wording is drafted to be plain and specific —
          treat it as a starting point for your own counsel, not as reviewed legal text.
        </p>

        <ul className="list-none p-0">
          {TEMPLATES.map((template) => (
            <li key={template.key} className="panel mb-4 p-4">
              <p className="t-label mb-1">{template.vertical}</p>
              <h3 className="t-title mb-1">{template.title}</h3>
              <p className="t-secondary mb-3">{template.description}</p>
              <p className="t-data mb-4" style={{ color: "var(--color-ink-3)" }}>
                {template.blocks.length} BLOCKS ·{" "}
                {template.blocks.filter((b) => b.kind === "screener").length} SCREENERS ·{" "}
                {template.blocks.filter((b) => b.kind === "signature").length} SIGNATURES
              </p>
              <form action={copyTemplateAction}>
                <input type="hidden" name="templateKey" value={template.key} />
                <button className="btn btn-secondary" type="submit">
                  Copy to my packets
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
