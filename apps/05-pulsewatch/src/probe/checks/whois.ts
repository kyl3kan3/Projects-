/**
 * Domain expiry via WHOIS.
 *
 * WHOIS is a plain TCP/43 line protocol, so this speaks it directly rather than
 * taking on a dependency. Two hops: ask IANA which server is authoritative for
 * the TLD, then ask that server about the domain and parse the expiry line.
 *
 * Registrar output is not standardised, so parsing is deliberately forgiving
 * about labels and strict about the date: an unparseable response reports an
 * error rather than a guess. Nobody should get a false "your domain expires
 * tomorrow" page.
 */

import { Socket } from "node:net";

export interface WhoisOutcome {
  ok: boolean;
  expiresAt: Date | null;
  registrar: string | null;
  errorKind: string | null;
  errorDetail: string | null;
}

const IANA_WHOIS = "whois.iana.org";

function ask(server: string, query: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let out = "";
    let settled = false;

    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve(out);
    };

    socket.setTimeout(timeoutMs);
    socket.once("timeout", () => done(new Error(`WHOIS timeout talking to ${server}`)));
    socket.once("error", done);
    socket.once("close", () => done());
    socket.on("data", (chunk) => {
      out += chunk.toString("utf8");
      // Guard against a hostile or broken server streaming forever.
      if (out.length > 256 * 1024) done();
    });
    socket.connect(43, server, () => socket.write(`${query}\r\n`));
  });
}

/** Pull "whois: whois.nic.dev" out of an IANA TLD record. */
function refersTo(text: string): string | null {
  const match = text.match(/^\s*(?:whois|refer):\s*(\S+)\s*$/im);
  return match ? match[1].toLowerCase() : null;
}

const EXPIRY_LABELS = [
  "registry expiry date",
  "registrar registration expiration date",
  "expiration date",
  "expiration time",
  "expires on",
  "expiry date",
  "expire date",
  "paid-till",
  "renewal date",
  "expires",
];

export function parseExpiry(text: string): Date | null {
  for (const line of text.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const label = line.slice(0, idx).trim().toLowerCase();
    if (!EXPIRY_LABELS.includes(label)) continue;
    const value = line.slice(idx + 1).trim();
    if (!value) continue;
    // Normalise the two shapes registries actually emit that Date rejects:
    // "2027.04.11" and "11-Apr-2027".
    const normalized = /^\d{4}\.\d{2}\.\d{2}/.test(value)
      ? value.slice(0, 10).replace(/\./g, "-")
      : value;
    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

export function parseRegistrar(text: string): string | null {
  const match = text.match(/^\s*registrar:\s*(.+?)\s*$/im);
  return match ? match[1] : null;
}

/** Reduce a hostname to the registrable domain WHOIS will answer about. */
export function registrableDomain(host: string): string {
  const parts = host.toLowerCase().replace(/\.$/, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  // Handle the common two-label public suffixes (co.uk, com.au, ...) without
  // shipping the whole public-suffix list; anything else takes the last two.
  const twoLabel = /^(co|com|net|org|gov|edu|ac)\.[a-z]{2}$/;
  const lastTwo = parts.slice(-2).join(".");
  return twoLabel.test(lastTwo) ? parts.slice(-3).join(".") : lastTwo;
}

export async function runWhoisCheck(host: string, timeoutMs = 10_000): Promise<WhoisOutcome> {
  const domain = registrableDomain(host);
  const tld = domain.split(".").pop() ?? "";

  try {
    const ianaRecord = await ask(IANA_WHOIS, tld, timeoutMs);
    const server = refersTo(ianaRecord);
    if (!server) {
      return {
        ok: false,
        expiresAt: null,
        registrar: null,
        errorKind: "whois_no_server",
        errorDetail: `No WHOIS server published for .${tld}`,
      };
    }

    let record = await ask(server, domain, timeoutMs);
    // Thin registries (.com/.net) point at the registrar for the real dates.
    const referral = refersTo(record);
    if (referral && referral !== server && !parseExpiry(record)) {
      try {
        record = await ask(referral, domain, timeoutMs);
      } catch {
        // Keep the thin record; it usually still carries Registry Expiry Date.
      }
    }

    const expiresAt = parseExpiry(record);
    if (!expiresAt) {
      return {
        ok: false,
        expiresAt: null,
        registrar: parseRegistrar(record),
        errorKind: "whois_unparsed",
        errorDetail: "Could not find an expiry date in the WHOIS response",
      };
    }

    return {
      ok: expiresAt.getTime() > Date.now(),
      expiresAt,
      registrar: parseRegistrar(record),
      errorKind: null,
      errorDetail: null,
    };
  } catch (err) {
    return {
      ok: false,
      expiresAt: null,
      registrar: null,
      errorKind: "whois_error",
      errorDetail: err instanceof Error ? err.message : String(err),
    };
  }
}
