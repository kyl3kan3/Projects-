import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ScreenHeader } from "@/components/ScreenHeader";
import { requireOnboardedUser } from "@/lib/auth";
import { getItem, groupByCategory, listItems } from "@/lib/price-book";
import { ItemForm } from "../ItemForm";
import { updateItemAction, type ItemFormState } from "../actions";

export const metadata: Metadata = { title: "Edit item" };
export const dynamic = "force-dynamic";

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { org } = await requireOnboardedUser();
  const { id } = await params;
  const item = await getItem(org.id, id);
  if (!item) notFound();

  const items = await listItems(org.id);
  const categories = groupByCategory(items).map(([name]) => name);

  async function action(prev: ItemFormState, formData: FormData): Promise<ItemFormState> {
    "use server";
    return updateItemAction(id, prev, formData);
  }

  return (
    <main>
      <ScreenHeader
        title={item.name}
        meta={`${item.category} · ${item.source === "template" ? "starter item" : item.source === "csv_import" ? "imported" : "added by hand"}`}
        backHref="/price-book"
        backLabel="Price book"
        showSettings={false}
      />
      <div className="gutter">
        <ItemForm
          action={action}
          defaultMarkupPct={org.defaultMarkupPct}
          categories={categories}
          defaults={{
            id: item.id,
            category: item.category,
            name: item.name,
            description: item.description,
            kind: item.kind,
            unit: item.unit,
            unitCostCents: item.unitCostCents,
            markupPct: item.markupPct,
            source: item.source,
          }}
        />
      </div>
    </main>
  );
}
