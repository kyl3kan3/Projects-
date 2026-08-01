/**
 * IBKR Flex statements in XML — what the Flex Web Service returns, and what
 * IBKR's "download" button hands a user who picks XML instead of CSV.
 *
 * The `<Trade …/>` attributes are the same fields as the CSV export, spelled
 * `assetCategory`/`buySell`/`putCall` instead of `AssetClass`/`Buy/Sell`/
 * `Put/Call`. Column lookup ignores case and punctuation, so both spellings
 * resolve to the same field and **one row parser serves both paths** — an XML
 * import and a CSV import of the same week cannot disagree.
 */

import { parseFlexRecords } from "@/lib/parsers/ibkr";
import { noSection } from "@/lib/parsers/run";
import type { BrokerParser, ParseOptions, ParseResult } from "@/lib/parsers/types";

const ID = "ibkr-flex-xml";
const VERSION = "1";

export class FlexError extends Error {}

/** Pull the text of the first `<tag>…</tag>` out of a small XML document. */
export function tagText(xml: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>([^<]*)</${tag}>`, "i").exec(xml);
  return match ? match[1].trim() : null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Every attribute of every `<Trade …/>` element, as name→value records. */
export function flexTradeRecords(xml: string): Record<string, string>[] {
  const records: Record<string, string>[] = [];
  for (const element of xml.matchAll(/<Trade\b([^>]*?)\/?>/gi)) {
    const attrs: Record<string, string> = {};
    for (const attr of element[1].matchAll(/([A-Za-z_][\w.:-]*)\s*=\s*"([^"]*)"/g)) {
      attrs[attr[1]] = decodeEntities(attr[2]);
    }
    if (Object.keys(attrs).length) records.push(attrs);
  }
  return records;
}

/**
 * Turn a Flex statement into canonical executions. Throws `FlexError` when the
 * document is an IBKR error response rather than a statement — that is a
 * configuration problem the user must see, not an empty import.
 */
export function parseFlexStatement(xml: string, opts: ParseOptions): ParseResult {
  const errorCode = tagText(xml, "ErrorCode");
  if (errorCode) {
    throw new FlexError(
      `IBKR refused the request (code ${errorCode}): ${tagText(xml, "ErrorMessage") ?? "no message"}`,
    );
  }
  if (!/<FlexQueryResponse/i.test(xml) && !/<Trade\b/i.test(xml)) {
    throw new FlexError("That response is not a Flex statement.");
  }
  return parseFlexRecords(flexTradeRecords(xml), opts);
}

export const ibkrFlexXml: BrokerParser = {
  id: ID,
  label: "Interactive Brokers (Flex XML)",
  version: VERSION,
  hint: "The XML a Flex Query downloads, or what the Flex Web Service returns to a sync.",
  detect(text) {
    return /<FlexQueryResponse/i.test(text) || (/<Trade\b/i.test(text) && /tradePrice=/i.test(text));
  },
  parse(text, opts): ParseResult {
    try {
      const result = parseFlexStatement(text, opts);
      return { ...result, parserId: ID, parserVersion: VERSION };
    } catch (err) {
      return noSection(
        ID,
        VERSION,
        err instanceof Error ? err.message : "Unreadable Flex statement",
        text,
      );
    }
  },
};
