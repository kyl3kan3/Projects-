import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/plans";
import { Notice } from "@/components/ledger";
import { IconChevronLeft } from "@/components/icons";
import { ImportForm } from "../RosterForms";

export const metadata: Metadata = { title: "Import the roster" };
export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const { user } = await requireUser();

  return (
    <main className="screen">
      <header className="pt-8">
        <Link href="/roster" className="btn-quiet inline-flex items-center gap-1">
          <IconChevronLeft size={18} />
          Roster
        </Link>
        <h1 className="t-h2 mt-6">Import the spreadsheet you already keep.</h1>
        <p className="t-secondary mt-2">
          Nothing is saved until you have read the dry run and pressed import. DuesDesk will tell you
          which rows it could not understand instead of guessing at them.
        </p>
      </header>

      {can(user.role, "roster") ? (
        <>
          <section className="mt-8">
            <ImportForm />
          </section>

          <section className="mt-10">
            <h2 className="t-h2">Columns it recognises</h2>
            <div className="panel mt-4 p-5">
              <ColumnRow
                field="Unit"
                aliases="Unit, Unit Number, Address, Lot, Property, Home"
                note="The only one that is required."
              />
              <ColumnRow field="Owner" aliases="Owner, Owner Name, Name, Homeowner, Resident" />
              <ColumnRow field="Email" aliases="Email, Email Address, Primary Email" />
              <ColumnRow field="Phone" aliases="Phone, Mobile, Cell, Telephone" />
              <ColumnRow field="Mailing address" aliases="Mailing Address, Billing Address, Mail To" />
              <ColumnRow
                field="Joined"
                aliases="Closing Date, Joined, Purchase Date, Member Since"
                note="Drives proration. ISO or 4/1/2026 both work."
              />
              <ColumnRow field="Co-owner" aliases="Co-Owner, Spouse, Owner 2, Additional Member" />
              <ColumnRow field="Co-owner email" aliases="Co-Owner Email, Spouse Email, Owner 2 Email" />
            </div>
            <p className="t-secondary mt-4">
              Re-importing the same file is safe: existing units gain any new people and an updated
              mailing address, and their joined date is never rewritten — that date is the turnover
              record the next board inherits.
            </p>
          </section>
        </>
      ) : (
        <section className="mt-8">
          <Notice>
            Your role is {user.role}, which cannot change the roster. The secretary, treasurer, and
            president can import.
          </Notice>
        </section>
      )}
    </main>
  );
}

function ColumnRow({
  field,
  aliases,
  note,
}: {
  field: string;
  aliases: string;
  note?: string;
}) {
  return (
    <div className="hairline-b py-3 last:border-0">
      <p className="t-title">{field}</p>
      <p className="t-data ink-2 mt-1">{aliases}</p>
      {note ? <p className="t-secondary mt-1">{note}</p> : null}
    </div>
  );
}
