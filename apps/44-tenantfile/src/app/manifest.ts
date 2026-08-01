import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TenantFile",
    short_name: "TenantFile",
    description: "The whole tenancy in one file: listings, applications, lease e-sign, rent ledger, maintenance.",
    start_url: "/units",
    display: "standalone",
    background_color: "#f5f6f2",
    theme_color: "#f5f6f2",
  };
}
