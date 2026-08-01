/**
 * Fixture loading for the diff tests and the golden-set harness.
 *
 * The `.patch` files in ./fixtures are real GitHub patch bodies — two of them
 * fetched from a live pull request (`real-*.patch`) and the rest written to cover
 * the cases that break anchoring: renames, hunks with no changed lines, CRLF line
 * endings, "\ No newline at end of file", and several hunks in one file.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileFromGithubEntry, type DiffFile, type GithubFileEntry } from "./parse";

const DIR = join(__dirname, "fixtures");

/**
 * Secret-shaped strings used by the credential tests, assembled at runtime.
 *
 * MergeMate detects committed credentials, so its fixtures have to contain things
 * that look exactly like credentials — which makes the repository itself
 * indistinguishable from one that leaked a key. GitHub's push protection rightly
 * refuses such a file, so no fixture holds a literal: the prefix is split here and
 * `.patch` files carry a placeholder that is substituted on load.
 *
 * None of these are real. They exist to be recognised, never to authenticate.
 */
export const FAKE_SECRETS = {
  __FAKE_STRIPE_LIVE_KEY__: "sk_" + "live_" + "51Hh8ZqCZ6qsJlKmNb2Vx9Yt",
  __FAKE_STRIPE_SESSION_KEY__: "sk_" + "live_" + "9f2c4b8e1d7a6053f4b2c8e1",
  __FAKE_GITHUB_PAT__: "ghp_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6",
  __FAKE_SLACK_BOT_TOKEN__: "xoxb" + "-2934721-9182734-AbCdEfGhIjKlMnOp",
};

/** Replace every `__FAKE_*__` placeholder with its assembled value. */
export function substituteFakeSecrets(text: string): string {
  let out = text;
  for (const [placeholder, value] of Object.entries(FAKE_SECRETS)) {
    out = out.split(placeholder).join(value);
  }
  return out;
}

export function loadPatch(name: string): string {
  return substituteFakeSecrets(readFileSync(join(DIR, `${name}.patch`), "utf8"));
}

export interface FixtureFileSpec {
  path: string;
  patch: string;
  status?: GithubFileEntry["status"];
  previousPath?: string | null;
}

/** Build the DiffFile the pipeline would see, counting additions itself. */
export function fixtureFile(spec: FixtureFileSpec): DiffFile {
  const lines = spec.patch.split("\n");
  const additions = lines.filter((l) => l.startsWith("+")).length;
  const deletions = lines.filter((l) => l.startsWith("-")).length;
  return fileFromGithubEntry({
    filename: spec.path,
    patch: spec.patch,
    status: spec.status ?? "modified",
    previous_filename: spec.previousPath ?? null,
    additions,
    deletions,
  });
}

export function fixtureEntry(spec: FixtureFileSpec): GithubFileEntry {
  const lines = spec.patch.split("\n");
  return {
    filename: spec.path,
    patch: spec.patch,
    status: spec.status ?? "modified",
    previous_filename: spec.previousPath ?? null,
    additions: lines.filter((l) => l.startsWith("+")).length,
    deletions: lines.filter((l) => l.startsWith("-")).length,
  };
}
