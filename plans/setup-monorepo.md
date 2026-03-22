# Monorepo Setup Plan

Source of truth: `docs/architecture.md`
Goal: working frontend → backend → DB vertical slice (movie title search) with best DX.

---

## Phase 0 — Repository baseline

**Goal**: Clean monorepo foundation with pnpm, turbo, TypeScript.

- [ ] `pnpm init` → root `package.json` (private, `@repo` scope)
- [ ] Create `pnpm-workspace.yaml` listing `apps/*`, `packages/*`, `tests/*`
- [ ] `pnpm add -Dw turbo` → configure `turbo.json` with pipelines: `build`, `dev`, `typecheck`, `lint`, `test`
- [ ] Root `.gitignore` (node_modules, dist, .turbo, .env, .next, drizzle meta)
- [ ] Root `.editorconfig`
- [ ] `.nvmrc` → `24`
- [ ] Root scripts in package.json: `dev`, `build`, `typecheck`, `lint`, `test`
- [ ] Create empty dirs: `apps/`, `packages/`, `tests/`, `infra/`

**Done when**: `pnpm install` works, `turbo run build` runs without config errors.

**Commit**: `init: repository baseline with pnpm and turbo`

---

## Phase 1 — Shared config packages

**Goal**: Reusable TypeScript and ESLint presets.

- [ ] `packages/config-typescript/`
  - `base.json` (strict mode, ESNext, bundler resolution)
  - `nextjs.json` (extends base, JSX, Next.js plugin)
  - `node.json` (extends base, Node types)
  - `library.json` (extends base, declaration emit)
  - `package.json` with exports
- [ ] `packages/config-eslint/`
  - Base flat config for TypeScript
  - Next.js extension
  - Node/Hono extension
  - `package.json` with exports

**Done when**: downstream packages can extend these configs.

**Commit**: `init: shared typescript and eslint config packages`

---

## Phase 2 — Workspace apps and packages (shells)

**Goal**: Create all workspaces as empty shells with `package.json`, `tsconfig.json`, `src/`.

- [ ] `apps/web` — `@repo/web`, tsconfig extends nextjs preset
- [ ] `apps/api` — `@repo/api`, tsconfig extends node preset
- [ ] `packages/ui` — `@repo/ui`, tsconfig extends library preset, exports `./src/index.ts`
- [ ] `packages/contracts` — `@repo/contracts`, tsconfig extends library preset, exports `./src/index.ts`
- [ ] `packages/db` — `@repo/db`, tsconfig extends node preset, exports `./src/index.ts`
- [ ] `packages/tmdb-client` — `@repo/tmdb-client`, tsconfig extends node preset, exports `./src/index.ts`
- [ ] Each shell gets a placeholder `src/index.ts`
- [ ] Wire internal deps with `workspace:*`:
  - `apps/web` → `@repo/ui`, `@repo/contracts`
  - `apps/api` → `@repo/contracts`, `@repo/db`, `@repo/tmdb-client`

**Done when**: `pnpm install` resolves all workspaces, `turbo run typecheck` passes.

**Commit**: `init: workspace app and package shells`

---

## Phase 3 — Frontend bootstrap (`apps/web`)

**Goal**: Running Next.js app with App Router, Tailwind, internal package imports.

- [ ] `pnpm --filter @repo/web add next react react-dom`
- [ ] `pnpm --filter @repo/web add -D @types/react @types/react-dom tailwindcss @tailwindcss/postcss postcss`
- [ ] `next.config.ts` with `transpilePackages: ['@repo/ui', '@repo/contracts']`
- [ ] `postcss.config.mjs`
- [ ] Create structure: `src/app/` (layout.tsx, page.tsx, globals.css), `src/components/`, `src/lib/api/`, `src/hooks/`
- [ ] Minimal home page
- [ ] `.env.example` with `NEXT_PUBLIC_API_URL`

**Done when**: `pnpm --filter @repo/web dev` serves the app, internal package imports resolve.

**Commit**: `init: nextjs frontend with app router and tailwind`

---

## Phase 4 — Backend bootstrap (`apps/api`)

**Goal**: Running Hono app with middleware, health endpoint.

- [ ] `pnpm --filter @repo/api add hono @hono/node-server`
- [ ] `pnpm --filter @repo/api add -D tsx`
- [ ] `src/app.ts` — Hono app with middleware + route registration
- [ ] `src/server.ts` — Node.js HTTP server entry
- [ ] Directories: `src/middleware/`, `src/features/health/`, `src/services/`, `src/repositories/`, `src/lib/`
- [ ] Middleware: request logger, global error handler, request-id, CORS
- [ ] `GET /health` → `{ status: "ok" }`
- [ ] Versioned API prefix: `/api/v1`
- [ ] `dev` script using `tsx watch`
- [ ] `.env.example` with `PORT`, `DATABASE_URL`

**Done when**: `pnpm --filter @repo/api dev` runs, `curl localhost:3001/health` returns ok.

**Commit**: `init: hono backend with middleware and health endpoint`

---

## Phase 5 — Local PostgreSQL with Docker

**Goal**: One-command local DB.

- [ ] `infra/docker/compose.yaml` — PostgreSQL 16, named volume, healthcheck, port 5432
- [ ] `infra/docker/.env.example` with local creds
- [ ] Root scripts: `db:up`, `db:down`

**Done when**: `pnpm db:up` starts postgres, `pg_isready` succeeds.

**Commit**: `init: local postgresql with docker compose`

---

## Phase 6 — Database package (`packages/db`)

**Goal**: Drizzle-based DB layer with connection, schema dir, migration tooling.

- [ ] `pnpm --filter @repo/db add drizzle-orm postgres`
- [ ] `pnpm --filter @repo/db add -D drizzle-kit`
- [ ] `src/client/` — connection factory with `postgres` driver + drizzle wrapper
- [ ] `src/schema/` — empty, ready for table definitions
- [ ] `src/repositories/` — empty
- [ ] `drizzle.config.ts`
- [ ] Export from `src/index.ts`

**Done when**: package builds, drizzle config resolves.

**Commit**: `init: database package with drizzle and postgres driver`

---

## Phase 7 — Movies table and migration

**Goal**: `movies` table only. Other domain/agent tables added when needed.

- [ ] `src/schema/movies.ts` — id, tmdb_id (unique), title, year, synopsis, genres (text[]), cast (text[]), directors (text[]), runtime, language, poster_url, backdrop_url, popularity, release_date, created_at, updated_at
- [ ] Generate first migration with `drizzle-kit generate`
- [ ] Apply migration to local DB
- [ ] `src/repositories/movies.ts` — `searchByTitle(query)`, `upsertFromTmdb(movie)`
- [ ] Root scripts: `db:generate`, `db:migrate`, `db:push`, `db:studio`

**Done when**: local DB has `movies` table, migration committed, repository can query by title.

**Commit**: `init: movies table schema and migration`

---

## Phase 8 — Contracts package (`packages/contracts`)

**Goal**: Shared Zod schemas scoped to what's needed now (movie search).

- [ ] `pnpm --filter @repo/contracts add zod`
- [ ] `src/http/` — movie search request/response schemas
- [ ] `src/domain/` — Movie DTO schema
- [ ] Export from `src/index.ts`

**Done when**: both apps can import and validate movie search contracts.

**Commit**: `init: contracts package with movie search schemas`

---

## Phase 9 — TMDb client package (`packages/tmdb-client`)

**Goal**: Typed TMDb API wrapper, no domain logic.

- [ ] `pnpm --filter @repo/tmdb-client add zod`
- [ ] `src/client.ts` — fetch-based TMDb API client
- [ ] `src/types.ts` — TMDb response types
- [ ] `src/endpoints/` — `searchMovies`, `getMovieDetails`
- [ ] Config via `TMDB_API_KEY` env var
- [ ] Export from `src/index.ts`

**Done when**: client can call TMDb search endpoint with valid API key.

**Commit**: `init: tmdb client package`

---

## Phase 10 — UI package (`packages/ui`)

**Goal**: shadcn/ui-based design system for monorepo consumption.

- [ ] Init shadcn/ui for monorepo package layout
- [ ] Dependencies: react, tailwindcss, class-variance-authority, clsx, tailwind-merge, lucide-react
- [ ] Add components: button, input, card, badge, scroll-area, separator
- [ ] `src/lib/utils.ts` — cn helper
- [ ] Stable export entrypoint

**Done when**: `apps/web` can render `@repo/ui` components.

**Commit**: `init: ui package with shadcn components`

---

## Phase 11 — Movie search vertical slice

**Goal**: End-to-end feature — search bar in frontend → API endpoint → DB query → results displayed.

Backend:
- [ ] `src/features/movies/` — movie search route `GET /api/v1/movies/search?q=`
- [ ] `src/services/movie-search.ts` — calls `@repo/tmdb-client` for external search, upserts results into DB via `@repo/db`, returns matches
- [ ] Request/response validated with `@repo/contracts` schemas

Frontend:
- [ ] Search bar component on home page using `@repo/ui` input
- [ ] `src/lib/api/client.ts` — typed fetch wrapper with base URL from env
- [ ] `src/lib/api/movies.ts` — `searchMovies(query)` function
- [ ] Movie search results displayed as cards using `@repo/ui` card component
- [ ] Debounced search, loading/empty/error states

**Done when**: user types in search bar, sees movie results from the API, data persisted in DB.

**Commit**: `init: movie search vertical slice`

---

## Phase 12 — Boundary enforcement

**Goal**: Prevent architecture drift.

- [ ] `eslint-plugin-boundaries` in `packages/config-eslint`:
  - Element categories: web, api, ui, db, contracts, tmdb-client
  - Forbidden: web→db, web→api, api→ui, ui→db, contracts→framework code
- [ ] `dependency-cruiser` at root:
  - `.dependency-cruiser.cjs` with forbidden rules
  - No circular deps, no missing deps, no cross-app imports
- [ ] Root script: `depcruise`

**Done when**: illegal imports fail lint, `pnpm depcruise` catches violations.

**Commit**: `init: boundary enforcement`

---

## Phase 13 — Testing foundation

**Goal**: Full testing stack configured with representative tests for the search feature.

- [ ] `pnpm add -Dw vitest`
- [ ] Frontend: React Testing Library — test for search bar component
- [ ] Backend: Hono test helpers — test for movie search route
- [ ] DB: Testcontainers — test for movies repository
- [ ] Root scripts: `test:unit`, `test:integration`
- [ ] One passing test per layer

**Done when**: `pnpm test` runs all tests from root, all green.

**Commit**: `init: testing foundation`

---

## Phase 14 — DX and documentation

**Goal**: Smooth developer experience. Docs written for humans AND coding agents.

- [ ] Structured backend logging (request IDs)
- [ ] `pnpm dev` runs both frontend and backend concurrently via turbo
- [ ] Document: `pnpm db:up` → `pnpm db:migrate` → `pnpm dev`
- [ ] Developer README: startup order, scripts, troubleshooting
- [ ] Update `docs/architecture.md` to reflect actual state post-setup (remove speculative sections, add concrete paths/scripts)
- [ ] `docs/conventions.md` — coding patterns established during setup: naming, file layout, import style, error handling, how to add a new feature/route/schema/table/UI component. Written so a coding agent can follow them without guessing.
- [ ] `docs/packages.md` — per-package reference: purpose, public API surface, exports, usage examples, how to extend
- [ ] Update `CLAUDE.md` with pointers to new docs and any agent-specific instructions learned during setup

**Done when**: new developer or coding agent can start the full stack, add a feature, and follow conventions from docs alone.

**Commit**: `init: developer documentation and DX`

---

## Phase 15 — CI pipeline

**Goal**: Quality gates on every push.

- [ ] `.github/workflows/ci.yml`
- [ ] Cache pnpm deps
- [ ] Steps: `typecheck`, `lint`, `depcruise`, `test:unit`, `test:integration`
- [ ] Migration validation step

**Done when**: CI runs all checks on push.

**Commit**: `init: ci pipeline`
