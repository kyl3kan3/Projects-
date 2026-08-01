/**
 * The little glob matcher the rulebook's path filters use.
 *
 * A dependency for this would be reasonable, but the semantics of path filters
 * are load-bearing (an over-broad `exclude` silently disables review of a whole
 * tree), so they are spelled out here and tested rather than inherited.
 *
 * Supported, and nothing else:
 *   `*`   any run of characters except `/`
 *   `**`  any run of characters including `/`; `a/**\/b` also matches `a/b`
 *   `?`   exactly one character except `/`
 *   `{a,b}` alternation
 *   a trailing `/` means "everything under this directory"
 *
 * Patterns are matched against a repo-relative POSIX path with no leading slash.
 */

const cache = new Map<string, RegExp>();

export function globToRegExp(pattern: string): RegExp {
  const cached = cache.get(pattern);
  if (cached) return cached;

  let p = pattern.trim();
  if (p.startsWith("./")) p = p.slice(2);
  if (p.startsWith("/")) p = p.slice(1);
  // "dist/" is shorthand for "dist/**".
  if (p.endsWith("/")) p += "**";

  let out = "";
  for (let i = 0; i < p.length; i++) {
    const c = p[i] as string;
    if (c === "*") {
      const doubled = p[i + 1] === "*";
      if (doubled) {
        // `a/**/b` must also match `a/b`, so the separator is absorbed.
        if (p[i + 2] === "/") {
          out += "(?:.*/)?";
          i += 2;
        } else {
          out += ".*";
          i += 1;
        }
      } else {
        out += "[^/]*";
      }
      continue;
    }
    if (c === "?") {
      out += "[^/]";
      continue;
    }
    if (c === "{") {
      const close = p.indexOf("}", i);
      if (close > i) {
        const alts = p.slice(i + 1, close).split(",");
        out += `(?:${alts.map(escapeLiteral).join("|")})`;
        i = close;
        continue;
      }
    }
    out += escapeLiteral(c);
  }

  const re = new RegExp(`^${out}$`);
  cache.set(pattern, re);
  return re;
}

function escapeLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchesGlob(path: string, pattern: string): boolean {
  return globToRegExp(pattern).test(normalise(path));
}

export function matchesAny(path: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => matchesGlob(path, p));
}

function normalise(path: string): string {
  let p = path.replace(/\\/g, "/").trim();
  if (p.startsWith("./")) p = p.slice(2);
  if (p.startsWith("/")) p = p.slice(1);
  return p;
}

/**
 * The include/exclude decision for one file path.
 *
 * `include` empty means "everything". `exclude` always wins, so a team can add
 * a generated tree to `exclude` without auditing their includes.
 */
export function pathAllowed(
  path: string,
  include: readonly string[],
  exclude: readonly string[],
): boolean {
  if (exclude.length > 0 && matchesAny(path, exclude)) return false;
  if (include.length === 0) return true;
  return matchesAny(path, include);
}
