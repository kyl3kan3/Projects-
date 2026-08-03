import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Server-only packages, left unbundled.
   *
   * `unpdf` and `mammoth` are the document readers: both resolve their own internals at
   * runtime (pdf.js does it through a computed require), which webpack can only warn
   * about. Externalising them removes the warning and, more usefully, keeps a PDF parser
   * out of the client graph entirely. `postgres` must never reach a browser bundle.
   */
  serverExternalPackages: ["postgres", "unpdf", "mammoth"],
};

export default nextConfig;
