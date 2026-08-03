/**
 * "Which month does this document belong to?" — asked in SQL, in one place.
 *
 * Three fallbacks, in order:
 *
 *  1. **The date on the document**, which is the only answer that is ever right for an
 *     expense. A receipt photographed on 2 April for a 31 March purchase is March's.
 *  2. **The date on the document it duplicates.** Merging a duplicate deletes its own
 *     line item, and without this a March duplicate would silently reappear in April's
 *     document count.
 *  3. **The day it arrived**, for a document nothing could be read from at all. An
 *     unreadable scan still has to appear somewhere, or it is invisible.
 *
 * Written as a fragment rather than duplicated at each call site because the inbox
 * header, the close gate and the package summary all have to agree — a document that is
 * in March's inbox and not in March's close is a support ticket.
 */

import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { periodEnd, periodStart, type Period } from "@/lib/dates";
import { documents } from "@/db/schema";

export function effectiveDateBetween(
  ownDocDate: AnyPgColumn,
  duplicatedDocDate: AnyPgColumn,
  period: Period,
): SQL {
  return sql`coalesce(${ownDocDate}::text, ${duplicatedDocDate}::text, to_char(${documents.receivedAt}, 'YYYY-MM-DD')) between ${periodStart(period)} and ${periodEnd(period)}`;
}

/** The same expression, for grouping documents into periods. */
export function effectivePeriodExpr(
  ownDocDate: AnyPgColumn,
  duplicatedDocDate: AnyPgColumn,
): SQL<string> {
  return sql<string>`substring(coalesce(${ownDocDate}::text, ${duplicatedDocDate}::text, to_char(${documents.receivedAt}, 'YYYY-MM-DD')), 1, 7)`;
}
