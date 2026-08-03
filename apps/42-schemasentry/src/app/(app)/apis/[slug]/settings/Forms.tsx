"use client";

/**
 * Per-API settings forms: identity and Slack, the breaking-change policy, and
 * contract-suite generation.
 *
 * The policy editor lists the whole rule corpus with its default level and a
 * per-rule override. That is a long list, so it is grouped and searchable rather
 * than paginated — an engineer looking for "the enum rule" wants to type "enum".
 */

import { useActionState, useMemo, useState } from "react";
import { updateApiAction, updatePolicyAction } from "../../actions";
import { deleteSuiteAction, generateSuiteAction } from "./actions";
import { EMPTY_STATE } from "@/lib/form-state";

export interface RuleView {
  id: string;
  level: "breaking" | "risky" | "compatible" | "info";
  side: "request" | "response" | "operation";
  template: string;
  why: string;
  override: string | null;
}

export function ApiIdentityForm({
  slug,
  name,
  visibility,
  slackWebhookUrl,
}: {
  slug: string;
  name: string;
  visibility: string;
  slackWebhookUrl: string;
}) {
  const [state, action, pending] = useActionState(updateApiAction, EMPTY_STATE);

  return (
    <form action={action} style={{ display: "grid", gap: 20 }}>
      <input type="hidden" name="slug" value={slug} />

      <label className="field">
        <span className="t-label">Name</span>
        <input className="input" name="name" defaultValue={name} required minLength={2} />
      </label>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="t-label" style={{ color: "var(--color-text-2)", marginBottom: 8 }}>
          Changelog visibility
        </legend>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["unlisted", "public", "private"].map((option) => (
            <label key={option} className="chip" style={{ cursor: "pointer", textTransform: "capitalize" }}>
              <input
                type="radio"
                name="visibility"
                value={option}
                defaultChecked={visibility === option}
                style={{ accentColor: "var(--color-break)" }}
              />
              {option}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span className="t-label">Slack incoming webhook</span>
        <input
          className="input input-mono"
          name="slackWebhookUrl"
          type="url"
          defaultValue={slackWebhookUrl}
          placeholder="https://hooks.slack.com/services/…"
          autoCapitalize="off"
          spellCheck={false}
        />
        <span className="field-hint">
          Breaking and risky verdicts post here. Compatible deploys stay silent — a channel that fires on every
          green deploy gets muted, and a muted channel is the same as no product.
        </span>
      </label>

      {state.error ? (
        <p role="alert" className="t-secondary" style={{ color: "var(--color-break-text)", margin: 0 }}>
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="t-secondary" style={{ color: "var(--color-green)", margin: 0 }}>
          {state.ok}
        </p>
      ) : null}

      <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

const LEVEL_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "breaking", label: "Breaking" },
  { value: "risky", label: "Risky" },
  { value: "compatible", label: "Compatible" },
  { value: "ignore", label: "Ignore" },
];

export function PolicyForm({
  slug,
  rules,
  failOn,
  blocked,
}: {
  slug: string;
  rules: RuleView[];
  failOn: "breaking" | "risky";
  blocked: string | null;
}) {
  const [state, action, pending] = useActionState(updatePolicyAction, EMPTY_STATE);
  const [query, setQuery] = useState("");
  const [onlyOverridden, setOnlyOverridden] = useState(false);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rules.filter((rule) => {
      if (onlyOverridden && !rule.override) return false;
      if (!q) return true;
      return rule.id.toLowerCase().includes(q) || rule.template.toLowerCase().includes(q);
    });
  }, [rules, query, onlyOverridden]);

  const overridden = rules.filter((r) => r.override).length;

  if (blocked) {
    return (
      <div className="card">
        <p className="t-label" style={{ color: "var(--color-amber)", margin: "0 0 8px" }}>
          Not on your plan
        </p>
        <p className="t-body" style={{ margin: 0 }}>
          {blocked}
        </p>
        <p className="t-secondary" style={{ margin: "16px 0 0" }}>
          The default ruleset still applies, and CI still fails on breaking.
        </p>
      </div>
    );
  }

  return (
    <form action={action} style={{ display: "grid", gap: 20 }}>
      <input type="hidden" name="slug" value={slug} />

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="t-label" style={{ color: "var(--color-text-2)", marginBottom: 8 }}>
          Fail CI on
        </legend>
        <div style={{ display: "flex", gap: 8 }}>
          {(["breaking", "risky"] as const).map((option) => (
            <label key={option} className="chip" style={{ cursor: "pointer", textTransform: "capitalize" }}>
              <input
                type="radio"
                name="failOn"
                value={option}
                defaultChecked={failOn === option}
                style={{ accentColor: "var(--color-break)" }}
              />
              {option === "breaking" ? "Breaking only" : "Breaking or risky"}
            </label>
          ))}
        </div>
      </fieldset>

      <div style={{ display: "grid", gap: 12 }}>
        <input
          className="input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Filter ${rules.length} rules — try "enum" or "nullable"`}
          aria-label="Filter rules"
        />
        <label style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 44 }}>
          <input
            type="checkbox"
            checked={onlyOverridden}
            onChange={(e) => setOnlyOverridden(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: "var(--color-break)" }}
          />
          <span className="t-secondary">
            Show only the {overridden} rule{overridden === 1 ? "" : "s"} you have overridden
          </span>
        </label>
      </div>

      <ul className="rows hairline-t hairline-b" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {shown.map((rule) => (
          <li key={rule.id} style={{ paddingBlock: 12 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <p className="t-data" style={{ margin: 0, color: "var(--color-text)" }}>
                  {rule.id}
                </p>
                <p className="t-secondary" style={{ margin: "2px 0 0" }}>
                  {rule.template}
                </p>
                <p className="t-secondary" style={{ margin: "2px 0 0", color: "var(--color-text-3-aa)" }}>
                  default: <span className="level-label" data-level={rule.level}>{rule.level}</span>
                </p>
              </div>
              <label style={{ flex: "none" }}>
                <span className="sr-only">Override for {rule.id}</span>
                <select
                  className="select"
                  name={`rule:${rule.id}`}
                  defaultValue={rule.override ?? "default"}
                  style={{ width: 148, paddingRight: 8 }}
                >
                  {LEVEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </li>
        ))}
        {shown.length === 0 ? (
          <li className="row">
            <span className="t-secondary">No rule matches that.</span>
          </li>
        ) : null}
      </ul>

      {/* Rules filtered out of view keep their stored override: a hidden input
          per rule means a search does not silently reset the policy. */}
      {rules
        .filter((rule) => !shown.some((s) => s.id === rule.id) && rule.override)
        .map((rule) => (
          <input key={rule.id} type="hidden" name={`rule:${rule.id}`} value={rule.override!} />
        ))}

      {state.error ? (
        <p role="alert" className="t-secondary" style={{ color: "var(--color-break-text)", margin: 0 }}>
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="t-secondary" style={{ color: "var(--color-green)", margin: 0 }}>
          {state.ok}
        </p>
      ) : null}

      <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
        {pending ? "Saving…" : "Save policy"}
      </button>
    </form>
  );
}

export interface SuiteView {
  id: string;
  filename: string;
  framework: string;
  consumerName: string | null;
  assertionCount: number;
  generatedLabel: string;
  sourceLabel: string;
}

export function ContractSuites({
  slug,
  suites,
  consumerOptions,
  blocked,
}: {
  slug: string;
  suites: SuiteView[];
  consumerOptions: Array<{ id: string; name: string }>;
  blocked: string | null;
}) {
  const [state, action, pending] = useActionState(generateSuiteAction, EMPTY_STATE);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteSuiteAction, EMPTY_STATE);

  if (blocked) {
    return (
      <div className="card">
        <p className="t-label" style={{ color: "var(--color-amber)", margin: "0 0 8px" }}>
          Not on your plan
        </p>
        <p className="t-body" style={{ margin: 0 }}>
          {blocked}
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {suites.length > 0 ? (
        <ul className="rows hairline-t hairline-b" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {suites.map((suite) => (
            <li key={suite.id} className="row" style={{ flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="t-data" style={{ display: "block", color: "var(--color-text)" }}>
                  {suite.filename}
                </span>
                <span className="t-secondary" style={{ display: "block" }}>
                  {suite.consumerName ? `${suite.consumerName} · ` : "Whole API · "}
                  {suite.assertionCount} assertions · {suite.framework} · from {suite.sourceLabel} ·{" "}
                  {suite.generatedLabel}
                </span>
              </span>
              <span style={{ display: "flex", gap: 12, alignItems: "center", flex: "none" }}>
                <a href={`/api/suites/${suite.id}`} className="btn-quiet" download>
                  Download
                </a>
                <form action={deleteAction}>
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="suiteId" value={suite.id} />
                  <button type="submit" className="btn-quiet" disabled={deletePending}>
                    Remove
                  </button>
                </form>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="t-secondary" style={{ margin: 0 }}>
          Nothing generated yet. A suite asserts the shapes your consumers depend on and runs against any
          environment — it is the artifact you run before your consumers do.
        </p>
      )}

      <form action={action} style={{ display: "grid", gap: 16 }}>
        <input type="hidden" name="slug" value={slug} />

        <label className="field">
          <span className="t-label">Scope</span>
          <select className="select" name="consumerId" defaultValue="">
            <option value="">Every documented GET response</option>
            {consumerOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}&apos;s declared usage
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="t-label">Framework</span>
          <select className="select" name="framework" defaultValue="vitest">
            <option value="vitest">Vitest</option>
            <option value="jest">Jest</option>
          </select>
        </label>

        <label style={{ display: "flex", alignItems: "flex-start", gap: 12, minHeight: 44 }}>
          <input
            type="checkbox"
            name="replace"
            style={{ width: 18, height: 18, accentColor: "var(--color-break)", marginTop: 12 }}
          />
          <span className="t-secondary">
            Replace the stored suite. Left unticked, regeneration reports drift and changes nothing — your edits
            are never overwritten.
          </span>
        </label>

        {deleteState.error ? (
          <p role="alert" className="t-secondary" style={{ color: "var(--color-break-text)", margin: 0 }}>
            {deleteState.error}
          </p>
        ) : null}
        {state.error ? (
          <p role="alert" className="t-secondary" style={{ color: "var(--color-break-text)", margin: 0 }}>
            {state.error}
          </p>
        ) : null}
        {state.ok ? (
          <p role="status" className="t-secondary" style={{ color: "var(--color-green)", margin: 0 }}>
            {state.ok}
          </p>
        ) : null}

        <button type="submit" className="btn btn-secondary btn-full" disabled={pending}>
          {pending ? "Generating…" : "Generate contract suite"}
        </button>
      </form>
    </div>
  );
}
