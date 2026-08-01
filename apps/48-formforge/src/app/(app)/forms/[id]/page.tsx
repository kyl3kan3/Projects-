import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getForm, verifyVersion, versionUsage, versionsOf } from "@/lib/forms";
import { blockRegistry, blockHeading, safeConfig, validateForm } from "@/lib/blocks";
import { settingsOf } from "@/lib/practices";
import { shortDate, shortHash } from "@/lib/format";
import { IconAlert, IconArrowDown, IconArrowUp, IconTrash } from "@/components/icons";
import { PublishButton } from "./PublishButton";
import { BlockEditor } from "./BlockEditor";
import { addBlockAction, reorderBlockAction } from "../actions";

export const metadata: Metadata = { title: "Packet builder" };

/**
 * The builder (DESIGN.md "Builder"): block cards with move handles, a config sheet
 * per block, and a pinned Publish.
 *
 * There is no drag-and-drop canvas, on purpose (README differentiation 3): up/down
 * buttons are keyboard-usable, work without JavaScript, and cannot produce the one
 * arrangement that matters — a signature above the text it signs. The validator
 * refuses that anyway, and it is shown here before publish rather than after.
 */
export default async function BuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { practice } = await requireUser();
  const form = await getForm(practice.id, id);
  if (!form) notFound();

  const settings = settingsOf(practice);
  const [versions, usage] = await Promise.all([
    versionsOf(practice.id, form.id),
    versionUsage(practice.id, form.id),
  ]);
  const problems = validateForm(form.blocks);
  const registry = blockRegistry();
  const consentBlocks = form.blocks.filter((b) => b.kind === "consent");

  return (
    <main className="screen pt-6">
      <Link href="/forms" className="btn-quiet mb-4 inline-block">
        Back to packets
      </Link>

      <h1 className="t-h2 mb-1">{form.title}</h1>
      <p className="t-secondary mb-1">{form.description}</p>
      <p className="t-data mb-6" style={{ color: "var(--color-ink-3)" }}>
        {form.version > 0
          ? `V${form.version} · ${shortDate(form.updatedAt, settings.timeZone).toUpperCase()}`
          : "NOT PUBLISHED"}
      </p>

      {problems.length > 0 && (
        <div className="panel mb-6 p-4">
          <p className="t-title mb-2 flex items-center gap-2" style={{ color: "var(--color-clay)" }}>
            <IconAlert size={18} />
            Publishing is blocked
          </p>
          <ul className="m-0 list-none p-0">
            {problems.map((p, i) => (
              <li key={i} className="t-secondary" style={{ color: "var(--color-clay)" }}>
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---- block cards ---- */}
      <section className="mb-10">
        <h2 className="t-label mb-3">Blocks</h2>
        {form.blocks.length === 0 && (
          <p className="t-secondary mb-4">
            This packet is empty. Add a demographics block to start, then consent text and a
            signature.
          </p>
        )}
        {form.blocks.map((block, index) => {
          const definition = registry.find((d) => d.kind === block.kind);
          return (
            <div key={block.key} className="panel mb-3 p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="t-label mb-1">
                    {block.kind.toUpperCase()}
                    {block.kind === "screener" &&
                      ` · ${String(safeConfig("screener", block.config)?.instrument ?? "").toUpperCase()}`}
                  </p>
                  <p className="t-title mb-1 break-words">{blockHeading(block)}</p>
                  <p className="t-data" style={{ color: "var(--color-ink-3)" }}>
                    {definition?.summary(block) ?? ""}
                  </p>
                </div>
                <div className="flex flex-none gap-1">
                  <MoveButton formId={form.id} blockKey={block.key} direction="up" disabled={index === 0} />
                  <MoveButton
                    formId={form.id}
                    blockKey={block.key}
                    direction="down"
                    disabled={index === form.blocks.length - 1}
                  />
                  <MoveButton formId={form.id} blockKey={block.key} direction="remove" disabled={false} />
                </div>
              </div>
              <BlockEditor formId={form.id} block={block} consentKeys={consentBlocks.map((b) => b.key)} />
            </div>
          );
        })}
      </section>

      {/* ---- add a block ---- */}
      <section className="mb-10">
        <h2 className="t-label mb-3">Add a block</h2>
        <ul className="list-none p-0">
          {registry.map((definition) => (
            <li key={definition.kind} className="hairline-b py-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="t-title">{definition.label}</p>
                  <p className="t-secondary">{definition.description}</p>
                </div>
                {definition.kind === "screener" ? (
                  <div className="flex flex-none gap-2">
                    {(["phq9", "gad7"] as const).map((instrument) => (
                      <form action={addBlockAction} key={instrument}>
                        <input type="hidden" name="formId" value={form.id} />
                        <input type="hidden" name="kind" value="screener" />
                        <input type="hidden" name="instrument" value={instrument} />
                        <button className="chip" type="submit">
                          {instrument === "phq9" ? "PHQ-9" : "GAD-7"}
                        </button>
                      </form>
                    ))}
                  </div>
                ) : definition.kind === "signature" ? (
                  consentBlocks.length === 0 ? (
                    <p className="t-secondary flex-none" style={{ maxWidth: 160 }}>
                      Add consent text first
                    </p>
                  ) : (
                    <form action={addBlockAction} className="flex flex-none items-center gap-2">
                      <input type="hidden" name="formId" value={form.id} />
                      <input type="hidden" name="kind" value="signature" />
                      <select
                        className="input"
                        name="consentBlockKey"
                        style={{ height: 36, width: 130, fontSize: 13 }}
                        aria-label="Which consent does this signature sign?"
                      >
                        {consentBlocks.map((b) => (
                          <option key={b.key} value={b.key}>
                            {blockHeading(b)}
                          </option>
                        ))}
                      </select>
                      <button className="chip" type="submit">
                        Add
                      </button>
                    </form>
                  )
                ) : (
                  <form action={addBlockAction} className="flex-none">
                    <input type="hidden" name="formId" value={form.id} />
                    <input type="hidden" name="kind" value={definition.kind} />
                    <button className="chip" type="submit">
                      Add
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ---- published versions ---- */}
      {versions.length > 0 && (
        <section className="mb-10">
          <h2 className="t-label mb-1">Published versions</h2>
          <p className="t-secondary mb-3">
            Each row is a frozen snapshot. The database refuses UPDATE and DELETE on this table, so
            a signature from an earlier version keeps meaning what it meant.
          </p>
          <ul className="list-none p-0">
            {versions.map((version) => {
              const check = verifyVersion(version);
              return (
                <li key={version.id} className="ledger-row">
                  <span className="ledger-verb">V{version.version}</span>
                  <span>{shortDate(version.publishedAt, settings.timeZone)}</span>
                  <span>{version.blocks.length} blocks</span>
                  <span>{usage.get(version.id) ?? 0} sent</span>
                  <span title={version.blocksHash}>{shortHash(version.blocksHash)}</span>
                  <span style={{ color: check.ok ? "var(--color-moss)" : "var(--color-clay)" }}>
                    {check.ok ? "INTACT" : "ALTERED"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="sticky-action lg:static lg:p-0">
        <PublishButton formId={form.id} blocked={problems.length > 0} version={form.version} />
      </div>
    </main>
  );
}

function MoveButton({
  formId,
  blockKey,
  direction,
  disabled,
}: {
  formId: string;
  blockKey: string;
  direction: "up" | "down" | "remove";
  disabled: boolean;
}) {
  const label =
    direction === "up" ? "Move up" : direction === "down" ? "Move down" : "Remove block";
  return (
    <form action={reorderBlockAction}>
      <input type="hidden" name="formId" value={formId} />
      <input type="hidden" name="blockKey" value={blockKey} />
      <input type="hidden" name="direction" value={direction} />
      <button
        type="submit"
        aria-label={label}
        title={label}
        disabled={disabled}
        className="flex h-11 w-11 items-center justify-center rounded-[8px]"
        style={{
          border: "1px solid var(--color-hairline)",
          color: disabled
            ? "var(--color-ink-3)"
            : direction === "remove"
              ? "var(--color-clay)"
              : "var(--color-ink-2)",
          background: "transparent",
        }}
      >
        {direction === "up" ? (
          <IconArrowUp size={18} />
        ) : direction === "down" ? (
          <IconArrowDown size={18} />
        ) : (
          <IconTrash size={18} />
        )}
      </button>
    </form>
  );
}
