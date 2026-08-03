"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { SectionHead } from "@/components/ui";
import { addStaffAction } from "../actions";

export function StaffForm({ canManage }: { canManage: boolean }) {
  const [adding, setAdding] = useState(false);

  if (!canManage) {
    return (
      <p className="t-secondary fg-3" style={{ marginTop: 32 }}>
        Only the owner can add or change staff accounts.
      </p>
    );
  }

  return (
    <>
      <SectionHead
        right={
          <button type="button" className="btn-quiet" onClick={() => setAdding(!adding)}>
            {adding ? "Close" : "Add someone"}
          </button>
        }
      >
        New account
      </SectionHead>
      {adding ? (
        <div className="card sheet-enter" style={{ padding: 16 }}>
          <ActionForm action={addStaffAction} submitLabel="Add staff member">
            <div className="field">
              <label className="t-label" htmlFor="stname">
                Name
              </label>
              <input id="stname" name="name" className="input" required placeholder="Ana Duarte" />
            </div>
            <div className="field">
              <label className="t-label" htmlFor="stemail">
                Email
              </label>
              <input
                id="stemail"
                name="email"
                type="email"
                className="input"
                required
                placeholder="ana@yourdojo.com"
              />
            </div>
            <div className="field">
              <label className="t-label" htmlFor="stpass">
                Starting password
              </label>
              <input
                id="stpass"
                name="password"
                type="password"
                className="input"
                required
                minLength={8}
                placeholder="At least 8 characters"
              />
              <p className="t-secondary fg-3">Tell them in person; they can change it later.</p>
            </div>
            <div className="field">
              <label className="t-label" htmlFor="strole">
                Role
              </label>
              <select id="strole" name="role" className="input" defaultValue="front_desk">
                <option value="front_desk">Front desk</option>
                <option value="instructor">Instructor</option>
                <option value="owner">Owner</option>
              </select>
            </div>
          </ActionForm>
        </div>
      ) : null}
    </>
  );
}
