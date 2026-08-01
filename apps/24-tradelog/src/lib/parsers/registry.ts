/**
 * The parser registry — the moat, per ARCHITECTURE.md.
 *
 * One module per broker export format, each fixture-tested and versioned. Two
 * rules that keep it from rotting:
 *
 * - **Detection is per-parser and structural**, based on the header a format
 *   actually writes, never on the filename. A user who renames a file still gets
 *   the right parser; a user who exports the wrong report gets told so.
 * - **The version is recorded on every import batch.** When a broker changes its
 *   columns, the batches parsed by the old version are identifiable, which is the
 *   only way to re-run an import correctly after fixing a drift.
 */

import { binance } from "@/lib/parsers/binance";
import { ibkrFlex } from "@/lib/parsers/ibkr";
import { ibkrFlexXml } from "@/lib/parsers/ibkr-xml";
import { thinkorswim } from "@/lib/parsers/thinkorswim";
import { tradovate } from "@/lib/parsers/tradovate";
import type { BrokerParser, ParseOptions, ParseResult } from "@/lib/parsers/types";

export const PARSERS: readonly BrokerParser[] = [
  thinkorswim,
  ibkrFlex,
  ibkrFlexXml,
  tradovate,
  binance,
];

export function parserById(id: string): BrokerParser | null {
  return PARSERS.find((p) => p.id === id) ?? null;
}

/**
 * Which parser claims this file? Returns null when none do, which the import
 * screen reports as "we don't recognise this export" alongside the list of
 * formats we do — never as a generic failure.
 */
export function detectParser(text: string): BrokerParser | null {
  for (const parser of PARSERS) {
    try {
      if (parser.detect(text)) return parser;
    } catch {
      // A parser that throws while sniffing simply does not claim the file.
    }
  }
  return null;
}

/** Detect and parse in one step; null when no parser recognises the file. */
export function parseUnknown(text: string, opts: ParseOptions): ParseResult | null {
  const parser = detectParser(text);
  if (!parser) return null;
  return parser.parse(text, opts);
}

export { thinkorswim, ibkrFlex, ibkrFlexXml, tradovate, binance };
export type { BrokerParser, ParseOptions, ParseResult };
