"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { Notice } from "@/components/ui";
import { sendAnnouncementAction } from "./actions";

export function ComposeForm({
  programs,
  simulated,
}: {
  programs: { id: string; name: string }[];
  simulated: boolean;
}) {
  const [scope, setScope] = useState<"all" | "programs">("all");

  return (
    <div style={{ marginTop: 24 }}>
      {simulated ? (
        <div style={{ marginBottom: 16 }}>
          <Notice>
            No Resend key is configured here, so sends are <strong>recorded and logged</strong>
            rather than delivered. Delivery rows, bounce handling and the retry path are real; the
            outbound SMTP hop is the only part standing in.
          </Notice>
        </div>
      ) : null}

      <div className="card" style={{ padding: 16 }}>
        <ActionForm
          action={sendAnnouncementAction}
          submitLabel="Send"
          pendingLabel="Sending…"
        >
          <div className="field">
            <label className="t-label" htmlFor="subject">
              Subject
            </label>
            <input
              id="subject"
              name="subject"
              className="input"
              required
              placeholder="Spring grading — Saturday 18 April"
            />
          </div>
          <div className="field">
            <label className="t-label" htmlFor="body">
              Message
            </label>
            <textarea
              id="body"
              name="body"
              className="input"
              required
              placeholder={"Doors at 9:30, gradings start at 10. Full gi, belts washed. Parents welcome on the mat edge — chairs along the south wall."}
            />
          </div>
          <fieldset className="field" style={{ border: "none", padding: 0, margin: 0 }}>
            <legend className="t-label" style={{ marginBottom: 8 }}>
              Audience
            </legend>
            <label className="flex items-center gap-3" style={{ minHeight: 44 }}>
              <input
                type="radio"
                name="scope"
                value="all"
                checked={scope === "all"}
                onChange={() => setScope("all")}
                style={{ accentColor: "var(--accent)" }}
              />
              <span className="t-body">The whole school</span>
            </label>
            <label className="flex items-center gap-3" style={{ minHeight: 44 }}>
              <input
                type="radio"
                name="scope"
                value="programs"
                checked={scope === "programs"}
                onChange={() => setScope("programs")}
                style={{ accentColor: "var(--accent)" }}
              />
              <span className="t-body">Specific programs</span>
            </label>
            {scope === "programs" ? (
              <div style={{ paddingLeft: 32, marginTop: 4 }}>
                {programs.map((program) => (
                  <label
                    key={program.id}
                    className="flex items-center gap-3"
                    style={{ minHeight: 44 }}
                  >
                    <input
                      type="checkbox"
                      name="programIds"
                      value={program.id}
                      className="check"
                    />
                    <span className="t-body">{program.name}</span>
                  </label>
                ))}
                <p className="t-secondary fg-3">
                  A household with children in two of these still gets one email.
                </p>
              </div>
            ) : null}
          </fieldset>
        </ActionForm>
      </div>
    </div>
  );
}
