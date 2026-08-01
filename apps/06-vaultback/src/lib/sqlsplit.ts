/**
 * SQL statement splitter.
 *
 * A restore is "read the dump and execute it", and the only hard part is knowing
 * where one statement ends. Splitting on `;` is wrong in six ways that all appear
 * in real Postgres dumps: semicolons inside string literals, inside dollar-quoted
 * function bodies, inside quoted identifiers, inside line comments, inside block
 * comments, and psql meta-command lines that carry no semicolon at all. Getting
 * this wrong on a restore means a half-restored database, so it is its own module
 * with its own tests.
 *
 * The splitter is a streaming state machine. Two invariants make it safe across
 * chunk boundaries, and both were bugs before they were invariants:
 *
 *  1. **Scan position is preserved.** `buffer` holds the statement built so far
 *     plus everything unscanned; `pos` is where scanning resumes. A drain that
 *     restarted at index 0 while still inside a string literal would reinterpret
 *     already-scanned text and split `'x;y'` in half.
 *  2. **An ambiguous character is never consumed.** When the buffer ends on
 *     something whose meaning depends on the next character (`'` that might be
 *     `''`, `$` that might open a dollar quote, `\` on a line with no newline
 *     yet), the loop stops on it and waits.
 */

type Mode =
  | { kind: "sql" }
  | { kind: "single" } // '...'
  | { kind: "escape" } // E'...' — backslash escapes are live
  | { kind: "quoted" } // "identifier"
  | { kind: "dollar"; tag: string } // $tag$ ... $tag$
  | { kind: "line" } // -- comment
  | { kind: "block"; depth: number }; // /* nesting is legal in Postgres */

export class StatementSplitter {
  /** Statement text so far, plus any not-yet-scanned input. */
  private buffer = "";
  /** Where scanning resumes inside `buffer`. */
  private pos = 0;
  private mode: Mode = { kind: "sql" };
  /** True when the next character begins a line — needed to spot `\restrict`. */
  private atLineStart = true;

  /** Feed a chunk; get back every complete statement it finished. */
  push(chunk: string): string[] {
    this.buffer += chunk;
    return this.drain();
  }

  /** Whatever is left when the stream ends — a trailing statement without `;`. */
  end(): string[] {
    if (this.mode.kind !== "sql" && this.mode.kind !== "line") {
      throw new Error(`Dump ended inside an unterminated ${this.mode.kind} literal`);
    }
    const tail = this.buffer.trim();
    this.buffer = "";
    this.pos = 0;
    return tail ? [tail] : [];
  }

  /** Emit everything up to (not including) `end`, and drop it from the buffer. */
  private cut(out: string[], end: number, resumeAt: number): void {
    const statement = this.buffer.slice(0, end).trim();
    if (statement) out.push(statement);
    this.buffer = this.buffer.slice(resumeAt);
    this.pos = 0;
  }

  private drain(): string[] {
    const out: string[] = [];

    for (;;) {
      const s = this.buffer;
      if (this.pos >= s.length) return out;
      const i = this.pos;
      const c = s[i];

      switch (this.mode.kind) {
        case "sql": {
          /**
           * psql meta-commands. Since the 2025 security release, pg_dump wraps
           * its output in `\restrict <token>` / `\unrestrict <token>` — psql
           * directives, not SQL, and with no terminating semicolon, so a naive
           * splitter glues them onto the next statement and the restore dies on
           * `syntax error at or near "\"`. They become their own statements,
           * which `isExecutable` then drops.
           */
          if (c === "\\" && this.atLineStart) {
            const newline = s.indexOf("\n", i);
            if (newline === -1) return out; // wait for the rest of the line
            this.cut(out, i, newline + 1);
            this.atLineStart = true;
            continue;
          }

          if (c === "'") {
            // E'' strings treat backslash as an escape; plain ones do not.
            const prev = i > 0 ? s[i - 1] : "";
            this.mode = prev === "E" || prev === "e" ? { kind: "escape" } : { kind: "single" };
            this.pos = i + 1;
            this.atLineStart = false;
            continue;
          }
          if (c === '"') {
            this.mode = { kind: "quoted" };
            this.pos = i + 1;
            this.atLineStart = false;
            continue;
          }
          if (c === "-" && s[i + 1] === "-") {
            this.mode = { kind: "line" };
            this.pos = i + 2;
            this.atLineStart = false;
            continue;
          }
          if (c === "-" && i === s.length - 1) return out; // might become "--"
          if (c === "/" && s[i + 1] === "*") {
            this.mode = { kind: "block", depth: 1 };
            this.pos = i + 2;
            this.atLineStart = false;
            continue;
          }
          if (c === "/" && i === s.length - 1) return out; // might become "/*"
          if (c === "$") {
            const tag = matchDollarTag(s, i);
            if (tag === undefined) return out; // ran out of input inside the tag
            if (tag === null) {
              // A lone $ (e.g. $1) — ordinary character.
              this.pos = i + 1;
              this.atLineStart = false;
              continue;
            }
            this.mode = { kind: "dollar", tag };
            this.pos = i + tag.length;
            this.atLineStart = false;
            continue;
          }
          if (c === ";") {
            this.cut(out, i, i + 1);
            this.atLineStart = false;
            continue;
          }
          this.pos = i + 1;
          this.atLineStart = c === "\n";
          continue;
        }

        case "single":
        case "escape": {
          if (this.mode.kind === "escape" && c === "\\") {
            if (i + 1 >= s.length) return out; // the escaped character is next chunk
            this.pos = i + 2;
            continue;
          }
          if (c === "'") {
            if (i + 1 >= s.length) return out; // could still turn out to be ''
            if (s[i + 1] === "'") {
              this.pos = i + 2;
              continue;
            }
            this.mode = { kind: "sql" };
            this.pos = i + 1;
            continue;
          }
          this.pos = i + 1;
          continue;
        }

        case "quoted": {
          if (c === '"') {
            if (i + 1 >= s.length) return out; // could still turn out to be ""
            if (s[i + 1] === '"') {
              this.pos = i + 2;
              continue;
            }
            this.mode = { kind: "sql" };
            this.pos = i + 1;
            continue;
          }
          this.pos = i + 1;
          continue;
        }

        case "dollar": {
          const tag = this.mode.tag;
          const at = s.indexOf(tag, i);
          if (at === -1) {
            // Nothing here can be the tag except a partial one at the very end.
            this.pos = Math.max(i, s.length - tag.length + 1);
            return out;
          }
          this.mode = { kind: "sql" };
          this.pos = at + tag.length;
          continue;
        }

        case "line": {
          if (c === "\n") {
            this.mode = { kind: "sql" };
            this.atLineStart = true;
          }
          this.pos = i + 1;
          continue;
        }

        case "block": {
          if (c === "/" && s[i + 1] === "*") {
            this.mode = { kind: "block", depth: this.mode.depth + 1 };
            this.pos = i + 2;
            continue;
          }
          if (c === "*" && s[i + 1] === "/") {
            const depth = this.mode.depth - 1;
            this.mode = depth <= 0 ? { kind: "sql" } : { kind: "block", depth };
            this.pos = i + 2;
            continue;
          }
          if ((c === "/" || c === "*") && i === s.length - 1) return out;
          this.pos = i + 1;
          continue;
        }
      }
    }
  }
}

/**
 * If a dollar quote opens at `i`, return its tag ("$$" or "$body$").
 * `null` means it is not a dollar quote; `undefined` means the input ended
 * mid-tag and the caller must wait for more.
 */
function matchDollarTag(s: string, i: number): string | null | undefined {
  let j = i + 1;
  while (j < s.length && /[A-Za-z_0-9]/.test(s[j])) j++;
  if (j >= s.length) return undefined;
  if (s[j] !== "$") return null;
  return s.slice(i, j + 1);
}

/** Convenience for whole strings — used by tests and small dumps. */
export function splitStatements(sql: string): string[] {
  const splitter = new StatementSplitter();
  const out = splitter.push(sql);
  return [...out, ...splitter.end()];
}

/**
 * psql meta-commands (`\restrict`, `\connect`, `\.`) are not SQL and cannot be
 * sent to the server. Skipping them is correct; skipping them *knowingly* is why
 * this is a function.
 */
export function isExecutable(statement: string): boolean {
  const trimmed = statement.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("\\")) return false;
  // A statement that is nothing but comments has no effect.
  const stripped = trimmed
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .trim();
  return stripped.length > 0;
}
