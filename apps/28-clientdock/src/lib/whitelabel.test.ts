import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  WhiteLabelError,
  canSendFromAgencyDomain,
  contrastRatio,
  dnsStateComplete,
  domainCnameRecord,
  hue,
  isBannedHue,
  normalizeHex,
  normalizeHost,
  parseHex,
  sanitizeLogoSvg,
  senderFor,
  validateBranding,
  validateCustomDomain,
} from "@/lib/whitelabel";
import { DEFAULT_BRANDING } from "@/db/schema";

const FALLBACK = "ClientDock <portals@clientdock.app>";

describe("colour parsing", () => {
  it("reads three- and six-digit hex, with or without the hash", () => {
    assert.deepEqual(parseHex("#A8843F"), { r: 168, g: 132, b: 63 });
    assert.deepEqual(parseHex("a8843f"), { r: 168, g: 132, b: 63 });
    assert.deepEqual(parseHex("#fff"), { r: 255, g: 255, b: 255 });
    assert.equal(parseHex("#12345"), null);
    assert.equal(parseHex("rebeccapurple"), null);
    assert.equal(normalizeHex(" #a8843f "), "#A8843F");
  });

  it("computes hue for the palette's own colours", () => {
    assert.ok(Math.abs(hue({ r: 0x1e, g: 0x4d, b: 0x3b }) - 157) < 2); // club green
    assert.ok(Math.abs(hue({ r: 0xa8, g: 0x84, b: 0x3f }) - 39.4) < 2); // brass
  });

  it("computes WCAG contrast the standard way", () => {
    const white = { r: 255, g: 255, b: 255 };
    const black = { r: 0, g: 0, b: 0 };
    assert.ok(Math.abs(contrastRatio(white, black) - 21) < 0.01);
    assert.ok(Math.abs(contrastRatio(white, white) - 1) < 0.01);
  });
});

describe("the colour law", () => {
  it("bans purple, violet and lavender outright", () => {
    for (const purple of ["#8B5CF6", "#7C3AED", "#A855F7", "#6D28D9", "#9F7AEA"]) {
      assert.equal(isBannedHue(parseHex(purple)!), true, purple);
    }
  });

  it("allows the hues on either side of the banned band", () => {
    assert.equal(isBannedHue(parseHex("#1E4D3B")!), false); // green
    assert.equal(isBannedHue(parseHex("#A8843F")!), false); // brass
    assert.equal(isBannedHue(parseHex("#1F4E79")!), false); // cobalt, 210deg
    assert.equal(isBannedHue(parseHex("#8A1F4E")!), false); // wine, 330deg
  });

  it("exempts near-greys, which are not meaningfully purple", () => {
    // #2A2A2E computes to a blue-violet hue but has almost no saturation; refusing
    // it would be a bug an agency could never argue their way out of.
    assert.equal(isBannedHue(parseHex("#2A2A2E")!), false);
  });
});

describe("branding validation", () => {
  it("normalises a valid theme", () => {
    const branding = validateBranding({ band: "#1f4e79", accent: "#8a5a00" });
    assert.equal(branding.band, "#1F4E79");
    assert.equal(branding.accent, "#8A5A00");
    assert.equal(branding.displayFont, "playfair");
  });

  it("refuses a purple band or accent", () => {
    assert.throws(() => validateBranding({ band: "#7C3AED" }), WhiteLabelError);
    assert.throws(() => validateBranding({ accent: "#8B5CF6" }), WhiteLabelError);
  });

  it("refuses an accent that can't reach 3:1 on ivory", () => {
    // A pale gold reads beautifully in Figma and is invisible on the portal.
    assert.throws(() => validateBranding({ accent: "#E8D9A0" }), /3:1/);
  });

  it("refuses a welcome band too light to carry ivory type", () => {
    assert.throws(() => validateBranding({ band: "#F0EDE4" }), /welcome band/i);
  });

  it("keeps the current values for fields that aren't supplied", () => {
    const current = { ...DEFAULT_BRANDING, logoSvg: "<svg viewBox='0 0 10 10'></svg>" };
    const branding = validateBranding({ accent: "#8A5A00" }, current);
    assert.equal(branding.band, current.band);
    assert.equal(branding.logoSvg, current.logoSvg);
  });

  it("clears the logo when an empty string is supplied", () => {
    const current = { ...DEFAULT_BRANDING, logoSvg: "<svg viewBox='0 0 10 10'></svg>" };
    assert.equal(validateBranding({ logoSvg: "" }, current).logoSvg, null);
  });

  it("only accepts inter or playfair as the display face", () => {
    assert.equal(validateBranding({ displayFont: "inter" }).displayFont, "inter");
    assert.equal(validateBranding({ displayFont: "Comic Sans" }).displayFont, "playfair");
  });
});

describe("logo sanitising", () => {
  it("accepts a plain SVG", () => {
    const svg = "<svg viewBox='0 0 120 28'><path d='M0 0h10v10H0z'/></svg>";
    assert.equal(sanitizeLogoSvg(svg), svg);
  });

  it("refuses anything that isn't an svg root", () => {
    assert.throws(() => sanitizeLogoSvg("<img src=x>"), WhiteLabelError);
    assert.throws(() => sanitizeLogoSvg("<svg><path/>"), WhiteLabelError);
  });

  it("refuses script, event handlers and remote references", () => {
    assert.throws(() => sanitizeLogoSvg("<svg><script>alert(1)</script></svg>"), WhiteLabelError);
    assert.throws(() => sanitizeLogoSvg("<svg onload='alert(1)'></svg>"), WhiteLabelError);
    assert.throws(
      () => sanitizeLogoSvg("<svg><use href='https://evil.example/x.svg#a'/></svg>"),
      WhiteLabelError,
    );
    assert.throws(
      () => sanitizeLogoSvg("<svg><a href='javascript:alert(1)'>x</a></svg>"),
      WhiteLabelError,
    );
  });
});

describe("custom domains", () => {
  it("normalises hosts from whatever the agency pastes", () => {
    assert.equal(normalizeHost("HTTPS://Portal.Agency.com/path"), "portal.agency.com");
    assert.equal(normalizeHost("portal.agency.com:3028"), "portal.agency.com");
  });

  it("requires a subdomain, because an apex can't take the CNAME", () => {
    assert.equal(validateCustomDomain("portal.agency.com"), "portal.agency.com");
    assert.throws(() => validateCustomDomain("agency.com"), /subdomain/);
    assert.throws(() => validateCustomDomain("not a host"), WhiteLabelError);
  });

  it("derives the CNAME target from the app host, port stripped", () => {
    const record = domainCnameRecord("portal.agency.com", "http://localhost:3028");
    assert.equal(record.host, "portal.agency.com");
    assert.equal(record.name, "portal");
    assert.equal(record.value, "portals.localhost");
  });
});

describe("agency-domain sending", () => {
  const base = {
    name: "Northbeam Studio",
    emailFromName: "Northbeam Studio",
    emailFromAddress: "updates@northbeam.studio",
  };

  it("stays closed until DKIM, SPF and the return path all pass", () => {
    assert.equal(dnsStateComplete({ spf: true, dkim: true, "return-path": true }), true);
    assert.equal(dnsStateComplete({ spf: true, dkim: true, "return-path": false }), false);
    assert.equal(dnsStateComplete(null), false);
    assert.equal(dnsStateComplete({}), false);
  });

  it("refuses to send from an unverified domain even on Agency", () => {
    assert.equal(
      canSendFromAgencyDomain({ ...base, plan: "agency", emailDomainVerifiedAt: null }),
      false,
    );
    assert.equal(
      senderFor({ ...base, plan: "agency", emailDomainVerifiedAt: null }, FALLBACK),
      FALLBACK,
    );
  });

  it("refuses to send from the agency domain on a plan without the feature", () => {
    const verified = { ...base, plan: "solo" as const, emailDomainVerifiedAt: new Date() };
    assert.equal(canSendFromAgencyDomain(verified), false);
    assert.equal(senderFor(verified, FALLBACK), FALLBACK);
  });

  it("sends from the agency domain once the plan and DNS both allow it", () => {
    const ok = { ...base, plan: "agency" as const, emailDomainVerifiedAt: new Date() };
    assert.equal(canSendFromAgencyDomain(ok), true);
    assert.equal(senderFor(ok, FALLBACK), "Northbeam Studio <updates@northbeam.studio>");
  });

  it("falls back to the workspace name when no from-name is set", () => {
    const ok = {
      name: "Northbeam Studio",
      emailFromName: null,
      emailFromAddress: "updates@northbeam.studio",
      plan: "studio" as const,
      emailDomainVerifiedAt: new Date(),
    };
    assert.equal(senderFor(ok, FALLBACK), "Northbeam Studio <updates@northbeam.studio>");
  });
});
