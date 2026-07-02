# Scaffold Conventions

Every app folder under `apps/` follows the same conventions so that any of them can be extracted into a fresh repo and built independently.

## Self-containment rules

1. **No cross-references.** An app folder never imports from, links to, or depends on files outside itself (this guide and the root README are the only exceptions, and they're informational only).
2. **Own ignore file.** Each folder ships its own `.gitignore` appropriate to its stack.
3. **Own env contract.** `.env.example` lists every environment variable the finished app will need, with comments explaining where to obtain each value.
4. **Valid manifests.** `package.json` / `requirements.txt` / `Cargo.toml` are syntactically valid and list the real dependencies the architecture calls for — so `npm install` (etc.) works on day one of the build.

## Documentation set (every app)

| File | Contents |
|------|----------|
| `README.md` | Product spec: one-liner, problem, target user, market & profitability evidence, monetization & pricing, MVP feature list, differentiation, go-to-market, competition, risks |
| `ARCHITECTURE.md` | Tech stack + rationale, system diagram (Mermaid), data model, key flows, third-party services, estimated running costs |
| `ROADMAP.md` | Phase 0 (setup) → Phase 1 (MVP) → Phase 2 (v1 launch) → Phase 3 (growth), with acceptance criteria per phase |

## Source stubs

- The `src/` tree mirrors the real intended structure of the finished app.
- Every stub file starts with a header comment stating **what the module does** and a **TODO list** of what to implement.
- **No business logic is implemented anywhere.** Stubs exist so the builder starts from an agreed structure, not a blank page.

## Stacks used

| Platform | Default stack |
|----------|---------------|
| Web SaaS | Next.js 15 (App Router) + TypeScript + Postgres (Drizzle) + Stripe + Tailwind |
| Mobile | Expo (React Native) + TypeScript + RevenueCat |
| API product | Python FastAPI (or Node Fastify) + usage-metered billing |
| Chrome extension | Manifest V3 + TypeScript + small Node backend for auth/billing |
| Desktop | Tauri (Rust shell + web frontend) + local SQLite |
| Background workers | Node worker processes or serverless queues (per app, see its ARCHITECTURE.md) |

Deviations from the defaults are called out and justified in each app's `ARCHITECTURE.md`.
