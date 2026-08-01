import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listTargets } from "@/lib/storage-targets";
import { managedTargetDescription } from "@/lib/storage";
import { AddTargetForm } from "./AddTargetForm";
import {
  addStorageTargetAction,
  deleteStorageTargetAction,
  makeDefaultStorageAction,
  verifyStorageTargetAction,
} from "../actions";
import { StatusPill } from "@/components/StatusPill";
import { formatTimestamp } from "@/lib/format";

export const metadata: Metadata = { title: "Storage" };
export const dynamic = "force-dynamic";

export default async function StoragePage() {
  const { org } = await requireUser();
  const targets = await listTargets(org.id);

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <Link href="/settings" className="btn-quiet no-underline">
          Settings
        </Link>
        <h1 className="t-h2 mt-3">Storage targets</h1>
        <p className="t-secondary mt-1">
          Snapshots are encrypted before they leave this process, so a target only ever holds
          ciphertext. Bring your own bucket and you own your backups outright.
        </p>
      </header>

      <section className="mb-10">
        {targets.map((target) => (
          <div key={target.id} className="row flex-wrap">
            <span className="min-w-0 flex-1">
              <span className="t-title block">
                {target.name}
                {target.isDefault ? " · default" : ""}
              </span>
              <span className="t-data mt-2 block truncate" style={{ color: "var(--color-text-3)" }}>
                {target.kind === "managed"
                  ? managedTargetDescription()
                  : `${target.kind === "byo_r2" ? "r2" : "s3"}://${target.bucket}${target.prefix ? `/${target.prefix}` : ""}`}
              </span>
              {target.lastCheckError ? (
                <span className="t-secondary mt-2 block" style={{ color: "var(--color-torch)" }}>
                  {target.lastCheckError}
                </span>
              ) : (
                <span className="t-data mt-2 block" style={{ color: "var(--color-text-3)" }}>
                  {target.verifiedAt ? `verified ${formatTimestamp(target.verifiedAt)}` : "not verified"}
                </span>
              )}
            </span>

            <span className="flex items-center gap-2">
              <StatusPill
                state={target.verifiedAt ? "verified" : "pending"}
                label={target.verifiedAt ? "Verified" : "Unverified"}
              />
            </span>

            <span className="flex w-full flex-wrap gap-2 pt-2">
              <form action={verifyStorageTargetAction}>
                <input type="hidden" name="targetId" value={target.id} />
                <button className="chip" type="submit">
                  Re-verify
                </button>
              </form>
              {target.isDefault ? null : (
                <>
                  <form action={makeDefaultStorageAction}>
                    <input type="hidden" name="targetId" value={target.id} />
                    <button className="chip" type="submit">
                      Make default
                    </button>
                  </form>
                  <form action={deleteStorageTargetAction}>
                    <input type="hidden" name="targetId" value={target.id} />
                    <button className="chip" type="submit" style={{ color: "var(--color-torch)" }}>
                      Remove
                    </button>
                  </form>
                </>
              )}
            </span>
          </div>
        ))}
      </section>

      <section className="mb-10">
        <p className="t-label mb-3">Add your own bucket</p>
        <AddTargetForm action={addStorageTargetAction} />
      </section>

      <section>
        <p className="t-label mb-2">How to read a snapshot without us</p>
        <p className="t-secondary">
          Each object is a gzipped plain-SQL dump inside a VaultBack envelope: the ASCII magic{" "}
          <span className="t-data">VB1</span>, a version byte, a 12-byte AES-256-GCM IV, then
          length-prefixed ciphertext frames, a zero-length end marker, and the 16-byte auth tag. The
          per-snapshot data key is stored wrapped by your master key. Decrypt, gunzip, and it is a
          file <span className="t-data">psql -f</span> will restore.
        </p>
      </section>
    </main>
  );
}
