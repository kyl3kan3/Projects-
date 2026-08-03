"use client";

import { useTransition } from "react";
import { IconBook } from "@/components/icons";
import { seedStarterAction } from "./actions";

export function SeedStarterButton({ trade }: { trade: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      className="btn btn-primary"
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => void (await seedStarterAction()))}
    >
      <IconBook size={18} />
      {pending ? "Seeding…" : `Use the ${trade.toLowerCase()} starter book`}
    </button>
  );
}
