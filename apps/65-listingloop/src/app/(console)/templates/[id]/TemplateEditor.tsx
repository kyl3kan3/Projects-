"use client";

import { useActionState, useState } from "react";
import { saveTemplateAction, type TemplateState } from "../actions";
import { ANCHOR_LABELS, type AnchorKey } from "@/lib/dates";
import { PARTY_ROLE_LABELS, TASK_OWNER_ROLES, ruleReadback, type TemplateTask } from "@/lib/templates";

const initial: TemplateState = { error: null, ok: null };

interface Draft extends TemplateTask {
  /** Local-only: a row the coordinator ticked for removal. */
  removed?: boolean;
}

/**
 * The date-rule builder. Every rule reads itself back as a sentence under the
 * controls, live, because that sentence is the thing the coordinator is actually
 * checking against a contract form — not the four widgets that produced it.
 */
export function TemplateEditor({
  templateId,
  name,
  tasks,
}: {
  templateId: string;
  name: string;
  tasks: TemplateTask[];
}) {
  const [state, action, pending] = useActionState(saveTemplateAction, initial);
  const [draft, setDraft] = useState<Draft[]>(tasks);

  const update = (i: number, patch: Partial<Draft>) =>
    setDraft((prev) => prev.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  const addTask = () =>
    setDraft((prev) => [
      ...prev,
      {
        key: `task_${prev.length + 1}`,
        label: "",
        ownerRole: "tc",
        docRequired: false,
        dateRule: { anchor: "contract_date", offsetDays: 5, businessDays: true, observeHolidays: true },
      },
    ]);

  return (
    <form action={action}>
      <input type="hidden" name="templateId" value={templateId} />
      <input type="hidden" name="taskCount" value={draft.length} />

      <label className="field max-w-lg">
        <span className="field-label">Template name</span>
        <input
          className="input"
          name="name"
          defaultValue={state.values?.name ?? name}
          required
        />
      </label>

      <ul className="mt-6 list-none p-0">
        {draft.map((task, i) => {
          const rule = task.dateRule;
          return (
            <li key={i} className="hairline-b py-5" data-removed={task.removed ? "true" : "false"}>
              <input type="hidden" name={`key${i}`} value={task.key} />
              {task.removed ? <input type="hidden" name={`delete${i}`} value="1" /> : null}

              <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
                <label className="block">
                  <span className="field-label">Task</span>
                  <input
                    className="input"
                    name={`label${i}`}
                    value={task.label}
                    onChange={(e) => update(i, { label: e.target.value })}
                    placeholder="Inspection objection deadline"
                    disabled={task.removed}
                  />
                </label>
                <label className="block">
                  <span className="field-label">Owner</span>
                  <select
                    className="input"
                    name={`owner${i}`}
                    value={task.ownerRole}
                    onChange={(e) => update(i, { ownerRole: e.target.value as TemplateTask["ownerRole"] })}
                    disabled={task.removed}
                  >
                    {TASK_OWNER_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {PARTY_ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-1 flex flex-wrap gap-x-6">
                <label className="checkline">
                  <input
                    type="checkbox"
                    name={`doc${i}`}
                    checked={task.docRequired}
                    onChange={(e) => update(i, { docRequired: e.target.checked })}
                    disabled={task.removed}
                  />
                  <span className="t-body">A document has to land</span>
                </label>
                <label className="checkline">
                  <input
                    type="checkbox"
                    name={`hasRule${i}`}
                    checked={Boolean(rule)}
                    onChange={(e) =>
                      update(i, {
                        dateRule: e.target.checked
                          ? {
                              anchor: "contract_date",
                              offsetDays: 5,
                              businessDays: true,
                              observeHolidays: true,
                            }
                          : undefined,
                      })
                    }
                    disabled={task.removed}
                  />
                  <span className="t-body">It has a deadline</span>
                </label>
                <label className="checkline">
                  <input
                    type="checkbox"
                    checked={Boolean(task.removed)}
                    onChange={(e) => update(i, { removed: e.target.checked })}
                  />
                  <span className="t-body">Remove this task</span>
                </label>
              </div>

              {rule && !task.removed ? (
                <div className="mt-2 rounded-[var(--radius-card)] border border-line bg-sheet p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="field-label">Counted from</span>
                      <select
                        className="input"
                        name={`anchor${i}`}
                        value={rule.anchor}
                        onChange={(e) =>
                          update(i, { dateRule: { ...rule, anchor: e.target.value as AnchorKey } })
                        }
                      >
                        {(Object.keys(ANCHOR_LABELS) as AnchorKey[]).map((a) => (
                          <option key={a} value={a}>
                            {ANCHOR_LABELS[a]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="field-label">Offset in days (negative counts back)</span>
                      <input
                        className="input input-mono"
                        name={`offset${i}`}
                        type="number"
                        step={1}
                        min={-365}
                        max={365}
                        value={rule.offsetDays}
                        onChange={(e) =>
                          update(i, { dateRule: { ...rule, offsetDays: Number(e.target.value) } })
                        }
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-x-6">
                    <label className="checkline">
                      <input
                        type="checkbox"
                        name={`business${i}`}
                        checked={rule.businessDays}
                        onChange={(e) =>
                          update(i, { dateRule: { ...rule, businessDays: e.target.checked } })
                        }
                      />
                      <span className="t-body">Business days</span>
                    </label>
                    <label className="checkline">
                      <input
                        type="checkbox"
                        name={`holidays${i}`}
                        checked={rule.observeHolidays}
                        onChange={(e) =>
                          update(i, { dateRule: { ...rule, observeHolidays: e.target.checked } })
                        }
                      />
                      <span className="t-body">Observe holidays</span>
                    </label>
                  </div>
                  <p className="t-secondary mt-2">
                    <span className="t-label">Reads as</span>{" "}
                    <span className="t-body">{ruleReadback(rule)}</span>
                  </p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button className="btn btn-secondary" type="button" onClick={addTask}>
          Add a task
        </button>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save the checklist"}
        </button>
      </div>

      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="t-secondary mt-2" style={{ color: "var(--color-cedar-strong)" }} role="status">
          {state.ok}
        </p>
      ) : null}
    </form>
  );
}
