/**
 * TLS certificate inspection for SSL expiry monitoring.
 *
 * A bare handshake, not a request: we want the peer certificate's validity
 * window, and we want it even when the certificate has already expired — so
 * `rejectUnauthorized` is off and validity is judged from the dates we read.
 */

import { connect } from "node:tls";

export interface TlsCheckOutcome {
  ok: boolean;
  latencyMs: number | null;
  notAfter: Date | null;
  issuer: string | null;
  subject: string | null;
  errorKind: string | null;
  errorDetail: string | null;
}

/** A certificate DN field can repeat; take the first value. */
function first(value: string | string[] | undefined): string | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function runTlsCheck(host: string, timeoutMs = 10_000): Promise<TlsCheckOutcome> {
  return new Promise((resolve) => {
    const startedAt = performance.now();
    let settled = false;

    const finish = (outcome: TlsCheckOutcome) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(outcome);
    };

    const socket = connect({
      host,
      port: 443,
      servername: host,
      // We are inspecting the certificate, not trusting it.
      rejectUnauthorized: false,
      timeout: timeoutMs,
    });

    socket.once("secureConnect", () => {
      const latencyMs = Math.round(performance.now() - startedAt);
      const cert = socket.getPeerCertificate();
      if (!cert || !cert.valid_to) {
        finish({
          ok: false,
          latencyMs,
          notAfter: null,
          issuer: null,
          subject: null,
          errorKind: "no_certificate",
          errorDetail: "Peer presented no certificate",
        });
        return;
      }
      const notAfter = new Date(cert.valid_to);
      finish({
        ok: notAfter.getTime() > Date.now(),
        latencyMs,
        notAfter: Number.isNaN(notAfter.getTime()) ? null : notAfter,
        // Node types these DN fields as string | string[] (repeated RDNs).
        issuer: first(cert.issuer?.O) ?? first(cert.issuer?.CN),
        subject: first(cert.subject?.CN) ?? host,
        errorKind: notAfter.getTime() > Date.now() ? null : "certificate_expired",
        errorDetail:
          notAfter.getTime() > Date.now() ? null : `Certificate expired ${cert.valid_to}`,
      });
    });

    socket.once("timeout", () =>
      finish({
        ok: false,
        latencyMs: timeoutMs,
        notAfter: null,
        issuer: null,
        subject: null,
        errorKind: "timeout",
        errorDetail: "TLS handshake timed out",
      }),
    );

    socket.once("error", (err: Error) =>
      finish({
        ok: false,
        latencyMs: null,
        notAfter: null,
        issuer: null,
        subject: null,
        errorKind: "tls",
        errorDetail: err.message,
      }),
    );
  });
}
