"use server";

/**
 * Provider detection for the connect screen.
 *
 * It runs as a server action rather than in the browser so the pattern table and
 * the guidance copy live in exactly one place — a second copy in client code is
 * how a "Supabase detected" chip ends up disagreeing with what the backup
 * actually does. Nothing here touches the network or stores anything.
 */

import {
  PROVIDER_GUIDANCE,
  PROVIDER_LABELS,
  detectPooled,
  detectProvider,
  parseConnectionString,
} from "@/lib/providers";
import type { ProviderHint } from "./ConnectForm";

export async function detectProviderAction(connectionString: string): Promise<ProviderHint | null> {
  try {
    const parsed = parseConnectionString(connectionString);
    const provider = detectProvider(parsed.host);
    const pooled = detectPooled(parsed.host, parsed.port);
    return {
      provider,
      label: PROVIDER_LABELS[provider].toUpperCase(),
      pooled,
      poolerAdvice: PROVIDER_GUIDANCE[provider].poolerAdvice,
      note: PROVIDER_GUIDANCE[provider].note,
      host: parsed.host,
      database: parsed.database,
    };
  } catch {
    // A half-typed connection string is not an error worth showing yet.
    return null;
  }
}
