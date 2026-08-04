import type { Metadata } from "next";
import Link from "next/link";
import { ItemForm } from "../ItemForm";
import { createItemAction, updateItemAction } from "../actions";
import { requireSession } from "@/lib/auth";
import { parseSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Add gear" };

export default async function NewItemPage() {
  const { account } = await requireSession();
  const settings = parseSettings(account.settings);

  return (
    <main style={{ paddingBottom: 40, maxWidth: 560 }}>
      <Link href="/items" className="btn-quiet">
        Gear
      </Link>
      <h1 className="t-h2" style={{ marginTop: 12 }}>
        Add an item
      </h1>
      <p className="t-secondary" style={{ marginTop: 4, marginBottom: 24 }}>
        The owned count is what availability divides by. Get it right once and no quote can promise
        the same chairs twice.
      </p>
      <ItemForm
        item={null}
        fees={[]}
        defaultFees={settings.damageFeeDefaults}
        createAction={createItemAction}
        updateAction={updateItemAction}
      />
    </main>
  );
}
