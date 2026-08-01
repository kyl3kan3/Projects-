/**
 * Firm settings: the defaults, and the reader that fills gaps in a stored
 * jsonb blob so an older row can never make a screen throw.
 *
 * Two of these defaults are product positions rather than arbitrary numbers:
 *
 *  - `lateFeeMention: false`. A late-fee sentence in a follow-up is a
 *    relationship decision the firm must make deliberately, so it ships off.
 *  - `partialFloorCents: 5000`. The portal accepts part payments, because $4,000
 *    towards a $12,400 invoice today beats nothing this month — but not $2, which
 *    costs more in card fees and bookkeeping than it collects.
 */

import type { FirmSettings, Firm } from "@/db/schema";

export const DEFAULT_FIRM_SETTINGS: FirmSettings = {
  defaultTermsDays: 30,
  partialFloorCents: 5_000,
  lateFeeMention: false,
  lateFeeCopy:
    "Our terms allow a 1.5% monthly charge on balances past 30 days; I would much rather not apply it.",
  signature: "",
};

export function firmSettings(firm: Pick<Firm, "settings">): FirmSettings {
  return { ...DEFAULT_FIRM_SETTINGS, ...(firm.settings ?? {}) };
}

/** The late-fee sentence, or undefined when the firm has it switched off. */
export function lateFeeSentence(firm: Pick<Firm, "settings">): string | undefined {
  const settings = firmSettings(firm);
  return settings.lateFeeMention && settings.lateFeeCopy.trim()
    ? settings.lateFeeCopy.trim()
    : undefined;
}
