"use client";

import { ActionForm } from "@/components/ActionForm";
import { IconUpload } from "@/components/icons";
import { setVisibilityAction, uploadDocumentAction } from "./actions";

export function UploadForm({
  allowed,
  upgradeName,
  supersedable,
}: {
  allowed: boolean;
  upgradeName: string;
  supersedable: { id: string; label: string }[];
}) {
  return (
    <ActionForm
      action={uploadDocumentAction}
      submitLabel="Upload"
      full
      disabled={!allowed}
      disabledReason={
        allowed
          ? undefined
          : `The document library comes with ${upgradeName}. Everything else on this screen keeps working.`
      }
    >
      <label className="field">
        <span className="t-label">Title</span>
        <input className="input" name="title" required placeholder="Bylaws" />
      </label>
      <div className="flex gap-3">
        <label className="field flex-1">
          <span className="t-label">Category</span>
          <select className="input" name="category" defaultValue="bylaws">
            <option value="bylaws">Bylaws</option>
            <option value="ccrs">CC&amp;Rs</option>
            <option value="minutes">Minutes</option>
            <option value="budget">Budget</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="field flex-1">
          <span className="t-label">Version</span>
          <input className="input" name="versionLabel" defaultValue="v1" placeholder="v3 (2026 amendment)" />
        </label>
      </div>
      <label className="field">
        <span className="t-label">File</span>
        <input className="input" type="file" name="file" required />
        <span className="t-secondary flex items-center gap-2">
          <IconUpload size={18} className="navy" />
          Up to 12 MB. Members download through a link that expires in ten minutes.
        </span>
      </label>
      {supersedable.length > 0 ? (
        <label className="field">
          <span className="t-label">Replaces</span>
          <select className="input" name="supersedesId" defaultValue="">
            <option value="">Nothing — this is new</option>
            {supersedable.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.label}
              </option>
            ))}
          </select>
          <span className="t-secondary">
            The replaced version is kept, not deleted. A board that amended its bylaws needs to show
            what the rules were before.
          </span>
        </label>
      ) : null}
      <label className="flex items-center gap-3">
        <input type="checkbox" name="memberVisible" defaultChecked className="h-5 w-5" />
        <span className="t-secondary" style={{ color: "var(--color-ink)" }}>
          Members can see this in their portal
        </span>
      </label>
    </ActionForm>
  );
}

export function VisibilityForm({
  documentId,
  memberVisible,
}: {
  documentId: string;
  memberVisible: boolean;
}) {
  return (
    <ActionForm
      action={setVisibilityAction}
      submitLabel={memberVisible ? "Hide from members" : "Publish to members"}
      variant="quiet"
    >
      <input type="hidden" name="documentId" value={documentId} />
      <input type="hidden" name="memberVisible" value={memberVisible ? "off" : "on"} />
    </ActionForm>
  );
}
