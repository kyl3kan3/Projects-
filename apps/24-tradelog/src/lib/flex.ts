/**
 * IBKR Flex Web Service — the one broker in the MVP list with an API a retail
 * customer can turn on themselves.
 *
 * It is two requests: `SendRequest` with the token and query id returns a
 * reference code, then the returned URL with that code returns the statement XML.
 * Parsing lives in lib/parsers/ibkr-xml.ts, which is fixture-tested; this module
 * is only the network, and is deliberately thin because it cannot be exercised
 * without a real IBKR account.
 *
 * The token never leaves this module in plaintext: it is stored encrypted
 * (lib/secrets.ts) and decrypted only to make the request.
 */

import { FlexError, tagText } from "@/lib/parsers/ibkr-xml";

const SEND_URL =
  "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest";
const VERSION = "3";

export { FlexError, parseFlexStatement, flexTradeRecords } from "@/lib/parsers/ibkr-xml";

export async function fetchFlexStatement(
  token: string,
  queryId: string,
  signal?: AbortSignal,
): Promise<string> {
  const sent = await fetch(
    `${SEND_URL}?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}&v=${VERSION}`,
    { signal, headers: { "User-Agent": "TradeLog/1.0" } },
  );
  if (!sent.ok) throw new FlexError(`IBKR SendRequest failed with HTTP ${sent.status}`);
  const handshake = await sent.text();

  const errorCode = tagText(handshake, "ErrorCode");
  if (errorCode) {
    throw new FlexError(
      `IBKR refused the request (code ${errorCode}): ${tagText(handshake, "ErrorMessage") ?? "no message"}`,
    );
  }
  const reference = tagText(handshake, "ReferenceCode");
  const url = tagText(handshake, "Url");
  if (!reference || !url) throw new FlexError("IBKR did not return a statement reference.");

  const statement = await fetch(
    `${url}?q=${encodeURIComponent(reference)}&t=${encodeURIComponent(token)}&v=${VERSION}`,
    { signal, headers: { "User-Agent": "TradeLog/1.0" } },
  );
  if (!statement.ok) {
    throw new FlexError(`IBKR GetStatement failed with HTTP ${statement.status}`);
  }
  return statement.text();
}
