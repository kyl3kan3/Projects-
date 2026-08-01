/**
 * Custom Drizzle column types, so the fixed-point discipline of money.ts reaches
 * all the way into Postgres and back out again.
 *
 * Without these, every read would hand the app a `string` (postgres numeric) or
 * a lossy `number` (int8 through some drivers) and every call site would have to
 * remember to convert. With them, a `Qty` column reads as a `Qty` and writes as
 * a `Qty`, and there is no place for a float to sneak in.
 *
 * | Type       | Postgres         | TypeScript                      |
 * |------------|------------------|---------------------------------|
 * | `cents()`  | `bigint`         | `Cents` — whole cents           |
 * | `qty()`    | `numeric(28,8)`  | `Qty` — units × 1e8             |
 * | `price()`  | `numeric(28,8)`  | `Price` — dollars × 1e8         |
 * | `money()`  | `numeric(38,19)` | `Money` — dollars × 1e19, exact |
 * | `scaled4()`| `numeric(14,4)`  | R-multiples etc. × 1e4          |
 *
 * `money()` stores nineteen decimal places on purpose: it is the exact width of
 * the internal money unit, so a per-fill fee round-trips through the database
 * without losing a fraction of a cent. Postgres `numeric` is arbitrary
 * precision, so the width costs nothing but bytes.
 */

import { customType } from "drizzle-orm/pg-core";
import { formatScaled, parseDecimal, type Cents, type Money, type Price, type Qty } from "@/lib/money";

type Driver = string | number | bigint;

function fixed(name: string, precision: number, scale: number) {
  return customType<{ data: bigint; driverData: string }>({
    dataType() {
      return `numeric(${precision}, ${scale})`;
    },
    fromDriver(value: Driver): bigint {
      return parseDecimal(String(value), scale);
    },
    toDriver(value: bigint): string {
      return formatScaled(value, scale, { minDecimals: scale });
    },
  })(name);
}

/** Whole cents. Every stored and displayed money figure. */
export const cents = (name: string) =>
  customType<{ data: Cents; driverData: string }>({
    dataType() {
      return "bigint";
    },
    fromDriver(value: Driver): Cents {
      return BigInt(value);
    },
    toDriver(value: Cents): string {
      return value.toString();
    },
  })(name);

/** Quantity: shares, contracts or coins, to eight decimal places. */
export const qty = (name: string) => fixed(name, 28, 8) as ReturnType<typeof fixed> & { _: { data: Qty } };

/** Price per unit, to eight decimal places. */
export const price = (name: string) => fixed(name, 28, 8) as ReturnType<typeof fixed> & { _: { data: Price } };

/** An exact money value at the internal scale — used for per-fill fees. */
export const money = (name: string) => fixed(name, 38, 19) as ReturnType<typeof fixed> & { _: { data: Money } };

/** A ratio or multiple scaled by 1e4: R-multiples, profit factor snapshots. */
export const scaled4 = (name: string) => fixed(name, 14, 4);
