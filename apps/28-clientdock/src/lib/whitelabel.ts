/**
 * White-label plumbing.
 *
 * Three jobs, all of them about protecting somebody:
 *
 *  1. **Theme validation.** An agency picks `--wl-brand` and `--wl-accent`. The
 *     colour law (DESIGN.md v5) is enforced on their input, not just on ours:
 *     purple-family hues (~250–310°) are rejected outright, and the accent must
 *     clear 3:1 contrast on ivory or the client's portal becomes unreadable.
 *  2. **Custom domains.** A host maps to a workspace only when the CNAME has
 *     actually been observed, so an unverified domain can never serve a portal.
 *  3. **Agency-domain email.** Sending from someone else's domain before DKIM and
 *     SPF verify burns their deliverability and ours. `canSendFromAgencyDomain`
 *     is the only gate, and it defaults closed.
 *
 * The DNS check itself lives in `checkEmailDns` / `checkDomainCname` and needs
 * outbound DNS; every caller treats a failure as "not verified", never as an
 * error the agency has to understand.
 */

import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { workspaces, DEFAULT_BRANDING, type Branding, type Workspace } from "@/db/schema";
import { plan } from "@/lib/plans";

export class WhiteLabelError extends Error {}

/* --------------------------------------------------------------- colours --- */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const IVORY: Rgb = { r: 0xf4, g: 0xf1, b: 0xea };

export function parseHex(input: string): Rgb | null {
  const raw = input.trim().replace(/^#/, "");
  const hex =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

export function normalizeHex(input: string): string | null {
  const rgb = parseHex(input);
  if (!rgb) return null;
  return (
    "#" +
    [rgb.r, rgb.g, rgb.b]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

/** Hue in degrees, 0–360. Grey returns 0. */
export function hue({ r, g, b }: Rgb): number {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  if (delta === 0) return 0;
  let h: number;
  if (max === rn) h = ((gn - bn) / delta) % 6;
  else if (max === gn) h = (bn - rn) / delta + 2;
  else h = (rn - gn) / delta + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/** Saturation of the HSL model, 0–1. */
export function saturation({ r, g, b }: Rgb): number {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return 0;
  return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
}

function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(rgb: Rgb): number {
  return (
    0.2126 * channelLuminance(rgb.r) +
    0.7152 * channelLuminance(rgb.g) +
    0.0722 * channelLuminance(rgb.b)
  );
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * A purple-family hue is banned outright — DESIGN_LANGUAGE rule 11. Near-grey
 * colours are exempt: #2A2A2E is not "purple" in any meaningful sense, and
 * refusing it would be a bug an agency could not talk their way out of.
 */
export function isBannedHue(rgb: Rgb): boolean {
  if (saturation(rgb) < 0.12) return false;
  const h = hue(rgb);
  return h >= 250 && h <= 310;
}

export interface BrandingInput {
  band?: string;
  accent?: string;
  displayFont?: string;
  logoSvg?: string | null;
}

/**
 * Validate and normalise an agency's theme. Throws `WhiteLabelError` with a
 * message written for the agency owner, not for a log file.
 */
export function validateBranding(input: BrandingInput, current = DEFAULT_BRANDING): Branding {
  const band = input.band?.trim() ? normalizeHex(input.band) : current.band;
  if (!band) throw new WhiteLabelError("The welcome-band colour needs to be a hex value like #1E4D3B");

  const accent = input.accent?.trim() ? normalizeHex(input.accent) : current.accent;
  if (!accent) throw new WhiteLabelError("The accent colour needs to be a hex value like #A8843F");

  const bandRgb = parseHex(band)!;
  const accentRgb = parseHex(accent)!;

  if (isBannedHue(bandRgb) || isBannedHue(accentRgb)) {
    throw new WhiteLabelError(
      "Purple, violet and lavender are out of the system by design — pick a hue outside 250–310°.",
    );
  }

  // The accent carries links and signage on the ivory ground; below 3:1 it stops
  // being legible for the client, who is the only person who matters here.
  const accentContrast = contrastRatio(accentRgb, IVORY);
  if (accentContrast < 3) {
    throw new WhiteLabelError(
      `That accent only reaches ${accentContrast.toFixed(1)}:1 on the portal's ivory ground. It needs 3:1 — try something darker.`,
    );
  }

  // The band carries ivory type at display size; it must be dark enough to read.
  const bandContrast = contrastRatio(bandRgb, IVORY);
  if (bandContrast < 3) {
    throw new WhiteLabelError(
      `The welcome band needs to be dark enough for ivory type — ${bandContrast.toFixed(1)}:1 is not enough, aim for 3:1.`,
    );
  }

  const displayFont = input.displayFont === "inter" ? "inter" : "playfair";

  let logoSvg: string | null = current.logoSvg;
  if (input.logoSvg !== undefined) {
    logoSvg = input.logoSvg ? sanitizeLogoSvg(input.logoSvg) : null;
  }

  return { band, accent, displayFont, logoSvg };
}

/**
 * The logo is rendered inline on a page a client trusts, so it is treated as
 * hostile input: only an `<svg>` root, and nothing that can execute.
 */
export function sanitizeLogoSvg(input: string): string {
  const svg = input.trim();
  if (!/^<svg[\s>]/i.test(svg) || !/<\/svg>\s*$/i.test(svg)) {
    throw new WhiteLabelError("Paste the whole SVG file, starting with <svg and ending with </svg>");
  }
  if (svg.length > 20_000) {
    throw new WhiteLabelError("That SVG is over 20KB — export it without embedded rasters");
  }
  if (/<script|<foreignObject|<use[^>]+href\s*=\s*["']?https?:|on[a-z]+\s*=|javascript:/i.test(svg)) {
    throw new WhiteLabelError("That SVG contains scripting or a remote reference, so it can't be used");
  }
  return svg;
}

/** CSS custom properties for a portal's theme — the only themeable surface. */
export function themeVars(branding: Branding): Record<string, string> {
  return {
    "--wl-brand": branding.band,
    "--wl-accent": branding.accent,
    "--wl-display-font":
      branding.displayFont === "inter" ? "var(--font-sans)" : "var(--font-display)",
  };
}

/* -------------------------------------------------------- custom domains --- */

/** Strip scheme, path, port and case so a host compares cleanly. */
export function normalizeHost(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
}

export function validateCustomDomain(input: string): string {
  const host = normalizeHost(input);
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) {
    throw new WhiteLabelError("That doesn't look like a hostname — try portal.youragency.com");
  }
  if (host.split(".").length < 3) {
    throw new WhiteLabelError(
      "Use a subdomain like portal.youragency.com — an apex domain can't take the CNAME we need.",
    );
  }
  return host;
}

/** The DNS record an agency has to add. Shown by the wizard verbatim. */
export function domainCnameRecord(host: string, appHost: string) {
  return {
    type: "CNAME" as const,
    name: host.split(".")[0],
    host,
    value: `portals.${appHost.replace(/^https?:\/\//, "").replace(/:\d+$/, "")}`,
  };
}

/**
 * Resolve a request host to a workspace, but only when the domain is verified.
 * An unverified domain returns null, so a half-finished DNS setup can never serve
 * a portal on a hostname the agency doesn't actually control.
 */
export async function workspaceForHost(host: string): Promise<Workspace | null> {
  const normalized = normalizeHost(host);
  if (!normalized) return null;
  const db = getDb();
  const [row] = await db
    .select()
    .from(workspaces)
    .where(
      and(
        eq(workspaces.customDomain, normalized),
        isNotNull(workspaces.customDomainVerifiedAt),
      ),
    );
  return row ?? null;
}

/* ------------------------------------------------------- agency-domain email --- */

export interface DnsRecord {
  kind: "TXT" | "CNAME" | "MX";
  name: string;
  value: string;
  purpose: "spf" | "dkim" | "return-path";
}

/** The DKIM/SPF records the wizard asks for, derived from the sending domain. */
export function emailDnsRecords(sendingDomain: string): DnsRecord[] {
  const domain = normalizeHost(sendingDomain);
  return [
    {
      kind: "TXT",
      name: domain,
      value: "v=spf1 include:clientdock.email ~all",
      purpose: "spf",
    },
    {
      kind: "TXT",
      name: `cd._domainkey.${domain}`,
      value: "v=DKIM1; k=rsa; p=<the public key on your settings page>",
      purpose: "dkim",
    },
    {
      kind: "CNAME",
      name: `bounces.${domain}`,
      value: "feedback.clientdock.email",
      purpose: "return-path",
    },
  ];
}

/**
 * Look the records up for real. Anything that isn't a clean pass — including no
 * outbound DNS at all — reads as "not verified": the failure mode has to be
 * "we didn't send from your domain", never "we sent anyway".
 */
export async function checkEmailDns(sendingDomain: string): Promise<Record<string, boolean>> {
  const domain = normalizeHost(sendingDomain);
  const dns = await import("node:dns/promises");
  const state: Record<string, boolean> = { spf: false, dkim: false, "return-path": false };

  try {
    const txt = await dns.resolveTxt(domain);
    state.spf = txt.some((chunks) => chunks.join("").includes("clientdock.email"));
  } catch {
    /* no record, or no DNS at all — stays false */
  }
  try {
    const txt = await dns.resolveTxt(`cd._domainkey.${domain}`);
    state.dkim = txt.some((chunks) => chunks.join("").toLowerCase().includes("v=dkim1"));
  } catch {
    /* stays false */
  }
  try {
    const cname = await dns.resolveCname(`bounces.${domain}`);
    state["return-path"] = cname.some((c) => c.toLowerCase().endsWith("clientdock.email"));
  } catch {
    /* stays false */
  }
  return state;
}

export async function checkDomainCname(host: string, expected: string): Promise<boolean> {
  try {
    const dns = await import("node:dns/promises");
    const cname = await dns.resolveCname(normalizeHost(host));
    return cname.some((c) => normalizeHost(c) === normalizeHost(expected));
  } catch {
    return false;
  }
}

export function dnsStateComplete(state: Record<string, boolean> | null | undefined): boolean {
  if (!state) return false;
  return Boolean(state.spf && state.dkim && state["return-path"]);
}

/**
 * The sender for a portal notification. Falls back to ClientDock's own domain
 * unless the plan allows agency sending *and* DNS actually verified.
 */
export function senderFor(
  workspace: Pick<
    Workspace,
    "plan" | "emailFromName" | "emailFromAddress" | "emailDomainVerifiedAt" | "name"
  >,
  fallback: string,
): string {
  const allowed =
    plan(workspace.plan).agencyEmail &&
    Boolean(workspace.emailDomainVerifiedAt) &&
    Boolean(workspace.emailFromAddress);
  if (!allowed) return fallback;
  const name = workspace.emailFromName?.trim() || workspace.name;
  return `${name} <${workspace.emailFromAddress}>`;
}

export function canSendFromAgencyDomain(
  workspace: Pick<Workspace, "plan" | "emailDomainVerifiedAt" | "emailFromAddress">,
): boolean {
  return (
    plan(workspace.plan).agencyEmail &&
    Boolean(workspace.emailDomainVerifiedAt) &&
    Boolean(workspace.emailFromAddress)
  );
}
