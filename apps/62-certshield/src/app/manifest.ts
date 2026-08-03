import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CertShield",
    short_name: "CertShield",
    description:
      "Certificate-of-insurance tracking for property managers and GCs — expired COIs caught before the claim.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f1f2f0",
    theme_color: "#f1f2f0",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
