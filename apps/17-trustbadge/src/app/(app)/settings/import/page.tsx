import type { Metadata } from "next";
import Link from "next/link";
import { requireMerchant } from "@/lib/auth";
import { SnippetBlock } from "@/components/CopyField";
import { IconCheck } from "@/components/icons";
import { ago, count } from "@/lib/format";
import { listImportJobs } from "@/lib/import-run";
import { featureAllowed, plan, tierUnlocking } from "@/lib/plans";
import { approveImportAction } from "../actions";
import { ImportForm } from "./ImportForm";

export const metadata: Metadata = { title: "Import reviews" };
export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  import_judgeme: "Judge.me export",
  import_loox: "Loox export",
  import_csv: "CSV",
  import_amazon: "Amazon",
  import_etsy: "Etsy",
  import_google: "Google",
  native: "Collected here",
};

export default async function ImportPage() {
  const { merchant, store } = await requireMerchant();
  const allowed = featureAllowed(merchant.tier, "imports");
  const jobs = await listImportJobs(store.id, 8);
  const needed = tierUnlocking("imports");

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <Link href="/settings" className="btn-quiet no-underline">
          Settings
        </Link>
        <h1 className="t-h2 mt-3">Bring your reviews with you.</h1>
        <p className="t-secondary mt-1">
          Export from Judge.me or Loox and upload the file unedited. Column names are matched by
          alias, so a plain CSV with a Rating and a Review column works too.
        </p>
      </header>

      {!allowed ? (
        <p className="card mb-6 p-4 t-secondary">
          Imports are on {plan(needed ?? "growth").name} and up.{" "}
          <Link href="/settings/billing" style={{ color: "var(--color-gold)" }}>
            See plans
          </Link>
        </p>
      ) : null}

      <section className="mb-10">
        <ImportForm allowed={allowed} />
      </section>

      <section className="hairline-t mb-10 pt-8">
        <p className="t-label mb-2">What gets read</p>
        <ul className="mb-4">
          {[
            ["Rating", "Rating, Stars, Score — as 4, 4.0, 4/5, or four star glyphs"],
            ["Review", "Review, Body, Content, Comment, Text"],
            ["Reviewer", "Author, Reviewer, Name, Customer Name"],
            ["Date", "Date, Created At, Review Date — ISO or a unix timestamp"],
            ["Product", "Product Handle, SKU, Product ID, plus a Product Title"],
            ["Photo", "Picture URLs, Photo, Image — the first URL is kept"],
          ].map(([field, aliases]) => (
            <li key={field} className="row">
              <span className="t-title" style={{ minWidth: 92 }}>
                {field}
              </span>
              <span className="t-secondary flex-1">{aliases}</span>
            </li>
          ))}
        </ul>
        <SnippetBlock
          label="A minimal file that imports cleanly"
          code={`rating,body,reviewer_name,created_at,product_handle
5,"Beautiful weight, washes well.",Maya R.,2026-06-24,harbor-linen-apron
4,Runs small — size up.,Tomas L.,2026-06-19,harbor-linen-apron`}
        />
        <p className="t-secondary mt-3">
          Imported reviews are never marked as verified purchases unless the export says they were,
          and they land in moderation rather than straight on your storefront. Re-uploading the same
          file changes nothing — reviews are deduped on author, text, and date.
        </p>
      </section>

      <section className="hairline-t pt-8">
        <p className="t-label mb-2">Past imports</p>
        {jobs.length === 0 ? (
          <p className="t-secondary">Nothing imported yet.</p>
        ) : (
          <ul>
            {jobs.map((job) => (
              <li key={job.id} className="row">
                <span className="min-w-0 flex-1">
                  <span className="t-title block truncate">{job.fileName}</span>
                  <span className="t-secondary block">
                    {SOURCE_LABEL[job.source] ?? job.source} &middot; {count(job.importedRows)} imported
                    {job.skippedRows ? `, ${count(job.skippedRows)} already here` : ""}
                    {job.errorLog.length ? `, ${count(job.errorLog.length)} failed` : ""} &middot;{" "}
                    {ago(job.createdAt)}
                  </span>
                </span>
                {job.importedRows > 0 ? (
                  <form action={approveImportAction}>
                    <input type="hidden" name="jobId" value={job.id} />
                    <button className="btn-quiet inline-flex items-center gap-1" type="submit">
                      <IconCheck size={16} />
                      Publish all
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
