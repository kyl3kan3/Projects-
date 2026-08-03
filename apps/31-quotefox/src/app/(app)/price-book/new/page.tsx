import type { Metadata } from "next";
import { ScreenHeader } from "@/components/ScreenHeader";
import { requireOnboardedUser } from "@/lib/auth";
import { groupByCategory, listItems } from "@/lib/price-book";
import { ItemForm } from "../ItemForm";
import { createItemAction } from "../actions";

export const metadata: Metadata = { title: "Add an item" };
export const dynamic = "force-dynamic";

export default async function NewItemPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { org } = await requireOnboardedUser();
  const { category } = await searchParams;
  const items = await listItems(org.id);
  const categories = groupByCategory(items).map(([name]) => name);

  return (
    <main>
      <ScreenHeader
        title="Add an item"
        meta="Cost and markup — QuoteFox never prices from anything else"
        backHref="/price-book"
        backLabel="Price book"
        showSettings={false}
      />
      <div className="gutter">
        <ItemForm
          action={createItemAction}
          defaultMarkupPct={org.defaultMarkupPct}
          categories={categories.length ? categories : ["Materials", "Labor", "Equipment", "Flat rate"]}
          defaults={{
            category: category ?? "",
            name: "",
            description: null,
            kind: "material",
            unit: "each",
            unitCostCents: 0,
            markupPct: null,
          }}
        />
      </div>
    </main>
  );
}
