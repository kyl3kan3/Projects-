"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { workspaces } from "@/db/schema";
import { clearSession, requireUser } from "@/lib/auth";
import { plan } from "@/lib/plans";
import {
  checkDomainCname,
  checkEmailDns,
  dnsStateComplete,
  domainCnameRecord,
  normalizeHost,
  validateBranding,
  validateCustomDomain,
} from "@/lib/whitelabel";
import { createCheckoutSession, createConnectOnboardingLink, createPortalSession } from "@/lib/billing";
import { env } from "@/lib/env";
import type { ActionState } from "../portals/actions";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

function fail(err: unknown): ActionState {
  return { error: err instanceof Error ? err.message : "That didn't work" };
}

/* -------------------------------------------------------------- branding --- */

export async function saveBrandingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { workspace } = await requireUser();
  try {
    if (!plan(workspace.plan).branding) return { error: "Branding isn't on your plan" };
    const branding = validateBranding(
      {
        band: str(formData, "band"),
        accent: str(formData, "accent"),
        displayFont: str(formData, "displayFont"),
        logoSvg: formData.has("logoSvg") ? str(formData, "logoSvg") : undefined,
      },
      workspace.branding,
    );
    const name = str(formData, "name") || workspace.name;
    const db = getDb();
    await db.update(workspaces).set({ branding, name }).where(eq(workspaces.id, workspace.id));
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/settings");
  return { ok: "Saved. Every portal re-themed." };
}

/* --------------------------------------------------------- custom domain --- */

export async function saveDomainAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { workspace } = await requireUser();
  try {
    if (!plan(workspace.plan).customDomain) {
      return { error: "Custom domains start on Solo — $29/mo, per business." };
    }
    const raw = str(formData, "customDomain");
    const db = getDb();
    if (!raw) {
      await db
        .update(workspaces)
        .set({ customDomain: null, customDomainVerifiedAt: null })
        .where(eq(workspaces.id, workspace.id));
      revalidatePath("/settings");
      return { ok: "Custom domain removed — portals go back to the ClientDock address." };
    }
    const host = validateCustomDomain(raw);
    // Changing the hostname always clears verification: the new name has not been
    // proved, and serving a portal on an unproved hostname is the whole risk.
    await db
      .update(workspaces)
      .set({ customDomain: host, customDomainVerifiedAt: null })
      .where(eq(workspaces.id, workspace.id));
    revalidatePath("/settings");
    const record = domainCnameRecord(host, env.appUrl);
    return { ok: `Saved. Add a CNAME on ${record.host} pointing at ${record.value}, then verify.` };
  } catch (err) {
    return fail(err);
  }
}

export async function verifyDomainAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const { workspace } = await requireUser();
  if (!workspace.customDomain) return { error: "Add a domain first" };
  const record = domainCnameRecord(workspace.customDomain, env.appUrl);
  const ok = await checkDomainCname(workspace.customDomain, record.value);
  const db = getDb();
  await db
    .update(workspaces)
    .set({ customDomainVerifiedAt: ok ? new Date() : null })
    .where(eq(workspaces.id, workspace.id));
  revalidatePath("/settings");
  return ok
    ? { ok: `${workspace.customDomain} is live. Portals now open on your domain.` }
    : {
        error: `No CNAME from ${normalizeHost(workspace.customDomain)} to ${record.value} yet. DNS can take an hour — nothing serves on that hostname until it resolves.`,
      };
}

/* ---------------------------------------------------- agency-domain email --- */

export async function saveEmailDomainAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { workspace } = await requireUser();
  try {
    if (!plan(workspace.plan).agencyEmail) {
      return { error: "Sending from your own domain is on Agency — $79/mo, per business." };
    }
    const address = str(formData, "emailFromAddress").toLowerCase();
    const db = getDb();
    if (!address) {
      await db
        .update(workspaces)
        .set({ emailFromAddress: null, emailDomainVerifiedAt: null, emailDnsState: null })
        .where(eq(workspaces.id, workspace.id));
      revalidatePath("/settings");
      return { ok: "Removed. Notifications go out from ClientDock again." };
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
      return { error: "That needs to be a full address, like updates@youragency.com" };
    }
    await db
      .update(workspaces)
      .set({
        emailFromAddress: address,
        emailFromName: str(formData, "emailFromName") || workspace.name,
        // A new address is unverified by definition.
        emailDomainVerifiedAt: null,
        emailDnsState: null,
      })
      .where(eq(workspaces.id, workspace.id));
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/settings");
  return { ok: "Saved. Add the three DNS records below, then verify." };
}

export async function verifyEmailDnsAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const { workspace } = await requireUser();
  if (!workspace.emailFromAddress) return { error: "Add a sending address first" };
  const domain = workspace.emailFromAddress.split("@")[1];
  const state = await checkEmailDns(domain);
  const complete = dnsStateComplete(state);
  const db = getDb();
  await db
    .update(workspaces)
    .set({ emailDnsState: state, emailDomainVerifiedAt: complete ? new Date() : null })
    .where(eq(workspaces.id, workspace.id));
  revalidatePath("/settings");
  if (complete) return { ok: `${domain} verified. Notifications now come from your domain.` };
  const missing = Object.entries(state)
    .filter(([, ok]) => !ok)
    .map(([k]) => k.toUpperCase())
    .join(", ");
  return {
    error: `Still waiting on ${missing}. Until all three pass, mail goes from ClientDock — sending from an unverified domain would hurt your deliverability.`,
  };
}

/* ------------------------------------------------------------- the account --- */

export async function signOutAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  await clearSession();
  redirect("/");
}

/* --------------------------------------------------------------- billing --- */

export async function checkoutAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, workspace } = await requireUser();
  const planId = str(formData, "plan");
  if (planId !== "solo" && planId !== "agency" && planId !== "studio") {
    return { error: "Unknown plan" };
  }
  let url: string;
  try {
    url = await createCheckoutSession(workspace, user.email, planId);
  } catch (err) {
    return fail(err);
  }
  redirect(url);
}

export async function billingPortalAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const { user, workspace } = await requireUser();
  let url: string;
  try {
    url = await createPortalSession(workspace, user.email);
  } catch (err) {
    return fail(err);
  }
  redirect(url);
}

export async function connectStripeAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const { workspace } = await requireUser();
  if (!plan(workspace.plan).stripeInvoices) {
    return { error: "The Stripe invoice embed is on Agency — $79/mo, per business." };
  }
  let url: string;
  try {
    url = await createConnectOnboardingLink(workspace);
  } catch (err) {
    return fail(err);
  }
  redirect(url);
}
