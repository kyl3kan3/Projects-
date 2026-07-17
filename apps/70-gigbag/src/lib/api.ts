/**
 * src/lib/api.ts — typed client for the GigBag server.
 *
 * TODO: fetch wrapper (session token from expo-secure-store,
 * EXPO_PUBLIC_API_URL, zod-validated); endpoints: auth, gigs CRUD +
 * advance, songs/setlists, plots, payments/splits, members; offline
 * reads fall back to cache.ts.
 */

export interface GigSummary {
  id: string;
  title: string;
  date: string;
  status: "inquiry" | "hold" | "confirmed" | "played" | "paid" | "cancelled";
  feeCents: number;
}

export async function listGigs(): Promise<GigSummary[]> {
  throw new Error("Not implemented");
}
