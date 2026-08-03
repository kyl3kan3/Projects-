import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { defaultReportingYear, requireUser } from "@/lib/auth";
import { OnboardingWizard } from "./OnboardingWizard";

export const metadata: Metadata = { title: "Setup" };

export default async function OnboardingPage() {
  const { org } = await requireUser();
  if (org.onboardedAt) redirect("/footprint");
  return <OnboardingWizard orgName={org.name} defaultYear={defaultReportingYear()} />;
}
