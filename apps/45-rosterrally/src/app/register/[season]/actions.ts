"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/ActionForm";
import { getPublicSeason, registerChildren } from "@/lib/registration";
import { findScholarshipCode, quoteCart } from "@/lib/pricing";
import { env } from "@/lib/env";
import { todayIso } from "@/lib/time";

/**
 * The public registration action.
 *
 * Deliberately the only write reachable without a session, and it takes a season
 * *slug* rather than any id: nothing a parent submits can address another club's
 * rows. All validation is `registerSchema` inside the domain function, so the same
 * rules apply whoever calls it.
 */
export async function registerAction(_prev: FormState, form: FormData): Promise<FormState> {
  const slug = String(form.get("slug") ?? "");
  const count = Math.min(6, Math.max(1, Number(form.get("childCount") ?? 1)));

  const children = [];
  for (let i = 0; i < count; i++) {
    const firstName = String(form.get(`child-${i}-firstName`) ?? "").trim();
    if (!firstName) continue;
    children.push({
      firstName,
      lastName: String(form.get(`child-${i}-lastName`) ?? "").trim(),
      birthdate: String(form.get(`child-${i}-birthdate`) ?? ""),
      divisionId: String(form.get(`child-${i}-divisionId`) ?? ""),
      medicalNotes: String(form.get(`child-${i}-medicalNotes`) ?? ""),
      emergencyName: String(form.get(`child-${i}-emergencyName`) ?? ""),
      emergencyPhone: String(form.get(`child-${i}-emergencyPhone`) ?? ""),
      emergencyRelationship: String(form.get(`child-${i}-emergencyRelationship`) ?? ""),
      answers: {},
    });
  }
  if (children.length === 0) return { error: "Add at least one child" };

  let checkoutUrl: string | null = null;
  let doneUrl = "";
  try {
    const result = await registerChildren(slug, {
      contactName: String(form.get("contactName") ?? ""),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      smsConsent: form.get("smsConsent") === "on",
      scholarshipCode: String(form.get("scholarshipCode") ?? ""),
      waiverAccepted: form.get("waiverAccepted") === "on" ? true : (false as unknown as true),
      payPlan: form.get("payPlan") === "installments" ? "installments" : "full",
      children,
    });
    checkoutUrl = result.checkoutUrl;
    doneUrl = `/register/${slug}/done?h=${encodeURIComponent(result.householdToken)}`;
  } catch (err) {
    if (err && typeof err === "object" && "issues" in err) {
      const issues = (err as { issues: { message: string }[] }).issues;
      return { error: issues.map((i) => i.message).join(" · ") };
    }
    return { error: err instanceof Error ? err.message : "Could not complete that registration" };
  }

  redirect(checkoutUrl ?? doneUrl);
}

/**
 * Price the cart before anyone types a card number, so the summary the parent
 * approves is the summary they are charged. Returns a message rather than a
 * partial state — the form keeps what they typed.
 */
export async function quoteAction(_prev: FormState, form: FormData): Promise<FormState> {
  const slug = String(form.get("slug") ?? "");
  const view = await getPublicSeason(slug);
  if (!view) return { error: "That registration link is not valid" };

  const count = Math.min(6, Math.max(1, Number(form.get("childCount") ?? 1)));
  const items = [];
  for (let i = 0; i < count; i++) {
    const divisionId = String(form.get(`child-${i}-divisionId`) ?? "");
    const division = view.divisions.find((d) => d.id === divisionId);
    if (!division) continue;
    items.push({
      ref: `c${i}`,
      divisionId,
      divisionName: division.name,
      playerName: String(form.get(`child-${i}-firstName`) ?? `Child ${i + 1}`),
      feeCents: division.feeCents,
      earlyBird: division.earlyBird ?? null,
      waitlisted: division.spotsLeft <= 0,
    });
  }
  if (items.length === 0) return { error: "Pick a division for each child to see the fees" };

  const code = findScholarshipCode(
    view.season.settings.scholarshipCodes ?? [],
    String(form.get("scholarshipCode") ?? ""),
  );
  if (code.error) return { error: code.error };

  const quote = quoteCart(items, view.season.settings, {
    scholarship: code.code,
    asOf: todayIso(),
    plan: view.club.plan,
    applicationFeeCents: env.applicationFeeCents,
  });

  const lines = quote.lines.map((l) => {
    const discounts = l.discounts.map((d) => `${d.label} −$${(d.amountCents / 100).toFixed(2)}`);
    return `${l.playerName || "Child"} · ${l.divisionName}: $${(l.amountCents / 100).toFixed(2)}${
      discounts.length ? ` (${discounts.join(", ")})` : ""
    }${l.waitlisted ? " — waitlist, nothing charged now" : ""}`;
  });

  return {
    ok: `${lines.join(" | ")} — total now $${(quote.totalCents / 100).toFixed(2)}${
      quote.platformFeeCents > 0 && !view.season.settings.absorbPlatformFee
        ? ` including $${(quote.platformFeeCents / 100).toFixed(2)} RosterRally fee`
        : ""
    }`,
  };
}
