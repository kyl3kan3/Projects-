import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { ScreenHeader } from "@/components/ScreenHeader";
import { NewTalkForm } from "./NewTalkForm";

export const metadata: Metadata = { title: "Add a talk" };

export default async function NewTalkPage() {
  await requireUser();
  return (
    <main className="screen">
      <ScreenHeader
        label="Custom talk"
        title="Add your own talk"
        back={{ href: "/talks/library", label: "Library" }}
      />
      <p className="t-secondary">
        Paste the talk you already use. It sits beside the seeded library and goes into the
        rotation the same way. Headings starting with ## become section labels; lines
        starting with - become bullets.
      </p>
      <NewTalkForm />
    </main>
  );
}
