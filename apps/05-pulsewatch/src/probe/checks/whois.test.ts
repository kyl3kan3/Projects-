import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseExpiry, parseRegistrar, registrableDomain } from "@/probe/checks/whois";

const day = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;

describe("parseExpiry", () => {
  it("reads the Verisign thin-registry field", () => {
    assert.equal(day(parseExpiry("   Registry Expiry Date: 2027-08-13T04:00:00Z")), "2027-08-13");
  });

  it("reads the fat-registrar field", () => {
    assert.equal(
      day(parseExpiry("Registrar Registration Expiration Date: 2026-11-02T09:15:00Z")),
      "2026-11-02",
    );
  });

  it("normalises dotted dates", () => {
    assert.equal(day(parseExpiry("paid-till: 2027.04.11")), "2027-04-11");
  });

  it("accepts dd-Mon-yyyy", () => {
    assert.equal(day(parseExpiry("Expiry date: 11-Apr-2027")), "2027-04-11");
  });

  it("is case-insensitive about the label", () => {
    assert.equal(day(parseExpiry("EXPIRES ON: 2028-01-05")), "2028-01-05");
  });

  it("returns null rather than guessing", () => {
    // Never invent a date: a wrong one pages someone about a healthy domain.
    assert.equal(parseExpiry("Domain Name: example.com\nDNSSEC: unsigned"), null);
    assert.equal(parseExpiry("Expiry date: whenever"), null);
  });

  it("ignores unrelated dates", () => {
    assert.equal(parseExpiry("Updated Date: 2025-01-01T00:00:00Z"), null);
  });
});

describe("parseRegistrar", () => {
  it("extracts the registrar name", () => {
    assert.equal(parseRegistrar("Registrar: Gandi SAS"), "Gandi SAS");
  });

  it("returns null when absent", () => {
    assert.equal(parseRegistrar("Domain Name: example.com"), null);
  });
});

describe("registrableDomain", () => {
  it("keeps a two-label domain as-is", () => {
    assert.equal(registrableDomain("example.com"), "example.com");
  });

  it("strips subdomains", () => {
    assert.equal(registrableDomain("api.shop.example.com"), "example.com");
  });

  it("handles two-label public suffixes", () => {
    assert.equal(registrableDomain("shop.bbc.co.uk"), "bbc.co.uk");
    assert.equal(registrableDomain("www.example.com.au"), "example.com.au");
  });

  it("lowercases and drops a trailing dot", () => {
    assert.equal(registrableDomain("WWW.Example.COM."), "example.com");
  });
});
