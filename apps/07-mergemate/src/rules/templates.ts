/**
 * Rulebook starter templates.
 *
 * Embedded as strings rather than shipped as files so they survive `tsc` to
 * dist/ and so a unit test can assert every template still validates against the
 * current schema — a starter template that fails validation is the worst
 * possible first impression.
 *
 * Each is a real, opinionated config: the rules are ones a team would plausibly
 * argue about in a PR, not filler.
 */

export type TemplateId = "typescript" | "python" | "go";

export interface RulebookTemplate {
  id: TemplateId;
  label: string;
  /** One line for the dashboard's template picker. */
  blurb: string;
  yaml: string;
}

const typescript = `# MergeMate rulebook — TypeScript / Node
# Committed to the default branch. Every change creates a new immutable version,
# and every finding records the version that produced it.
version: 1

categories:
  bug: true
  security: true
  standards: true

confidence:
  # Findings below this confidence are recorded in the dashboard and never
  # posted to the pull request. Raise it if the bot is still too chatty.
  threshold: 0.8
  max_comments_per_pr: 6

# on_findings: no summary comment on a clean PR. Silence is the signal.
summary: on_findings
suggested_patches: true

paths:
  exclude:
    - "**/*.generated.ts"
    - "**/*.d.ts"
    - "dist/**"
    - "coverage/**"
    - "**/__snapshots__/**"

rules:
  - id: no-raw-sql
    category: security
    severity: high
    description: >-
      SQL must be built with the parameterised query helper. Flag string
      interpolation or template literals inside sql\`\` or db.query() calls.
    pattern: "(sql\`|db\\\\.query\\\\()"
    confidence_floor: 0.85
    paths: ["src/**/*.ts"]

  - id: validate-handler-input
    category: bug
    severity: high
    description: >-
      Every HTTP handler and server action must validate its input with a zod
      schema before using it. Flag a handler that reads request body or params
      and passes them on unvalidated.
    paths: ["src/app/**/route.ts", "src/app/**/actions.ts", "src/server/**/*.ts"]

  - id: no-floating-promise
    category: bug
    severity: medium
    description: >-
      An async call whose promise is neither awaited nor explicitly handled will
      swallow its errors. Flag calls to async functions used as statements.

  - id: no-console-in-server
    category: standards
    severity: low
    description: >-
      Server code logs through the structured logger, not console.*, so lines
      stay queryable in production.
    pattern: "console\\\\.(log|info|warn|error)"
    paths: ["src/server/**/*.ts", "src/lib/**/*.ts"]
`;

const python = `# MergeMate rulebook — Python
version: 1

categories:
  bug: true
  security: true
  standards: true

confidence:
  threshold: 0.8
  max_comments_per_pr: 6

summary: on_findings
suggested_patches: true

paths:
  exclude:
    - "**/migrations/**"
    - "**/*_pb2.py"
    - ".venv/**"
    - "build/**"

rules:
  - id: no-string-sql
    category: security
    severity: high
    description: >-
      Database queries must use bound parameters. Flag f-strings, % formatting
      or .format() used to build SQL passed to execute() or raw().
    pattern: "(execute\\\\(|\\\\.raw\\\\()"
    confidence_floor: 0.85

  - id: no-mutable-default-arg
    category: bug
    severity: medium
    description: >-
      A list, dict or set as a default argument value is shared across calls.
      Flag def signatures with a mutable literal default.

  - id: no-bare-except
    category: standards
    severity: medium
    description: >-
      "except:" and "except Exception:" without a re-raise hide real failures.
      Flag handlers that swallow every exception.

  - id: requests-need-timeout
    category: bug
    severity: high
    description: >-
      Every outbound HTTP call must pass an explicit timeout, or a hung
      dependency hangs the worker with it.
    pattern: "requests\\\\.(get|post|put|patch|delete)\\\\("
`;

const go = `# MergeMate rulebook — Go
version: 1

categories:
  bug: true
  security: true
  standards: true

confidence:
  threshold: 0.8
  max_comments_per_pr: 6

summary: on_findings
suggested_patches: true

paths:
  exclude:
    - "**/*_gen.go"
    - "**/*.pb.go"
    - "vendor/**"

rules:
  - id: check-error-return
    category: bug
    severity: high
    description: >-
      A returned error must be handled or explicitly ignored with a comment
      saying why. Flag assignments that discard err with _.

  - id: no-sql-concat
    category: security
    severity: high
    description: >-
      Build queries with placeholders and Query/Exec arguments. Flag string
      concatenation or fmt.Sprintf used to assemble SQL.
    pattern: "(fmt\\\\.Sprintf|db\\\\.(Query|Exec))"
    confidence_floor: 0.85

  - id: context-first-arg
    category: standards
    severity: low
    description: >-
      Exported functions that do I/O take context.Context as their first
      parameter, so callers can cancel them.

  - id: no-goroutine-leak
    category: bug
    severity: high
    description: >-
      A goroutine started without a way to stop it leaks. Flag "go func()" with
      no context, done channel or WaitGroup in scope.
`;

export const RULEBOOK_TEMPLATES: Record<TemplateId, RulebookTemplate> = {
  typescript: {
    id: "typescript",
    label: "TypeScript / Node",
    blurb: "Parameterised SQL, zod-validated handlers, no floating promises.",
    yaml: typescript,
  },
  python: {
    id: "python",
    label: "Python",
    blurb: "Bound query parameters, no mutable defaults, timeouts on every call.",
    yaml: python,
  },
  go: {
    id: "go",
    label: "Go",
    blurb: "Errors handled, placeholders in SQL, context first, no leaked goroutines.",
    yaml: go,
  },
};

export const TEMPLATE_IDS: TemplateId[] = ["typescript", "python", "go"];
