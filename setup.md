# Setup

## Purpose

This document is the implementation checklist for bootstrapping the monorepo.
It is ordered so a human or coding agent can execute it step by step.
Each section includes goals, concrete tasks, and completion criteria.

This setup assumes:

- separate deployment for frontend and backend
- token-based authentication
- AG-UI and A2UI integration for agent UX
- PostgreSQL in Docker for local development
- Drizzle as the ORM and migration toolchain
- shadcn/ui as an internal design system

---

## Phase 0 - repository baseline

### Goal

Create a clean monorepo foundation with the right package manager, task runner, and TypeScript baseline.

### Todo

- [ ] initialize the repository with `pnpm`
- [ ] create the root `package.json`
- [ ] create `pnpm-workspace.yaml`
- [ ] install and configure `turbo`
- [ ] add a root `.gitignore`
- [ ] add a root `.editorconfig`
- [ ] add a root `.nvmrc` or tool-version file for the selected Node.js LTS
- [ ] define root scripts:
  - [ ] `dev`
  - [ ] `build`
  - [ ] `typecheck`
  - [ ] `lint`
  - [ ] `test`
- [ ] create root directories:
  - [ ] `apps/`
  - [ ] `packages/`
  - [ ] `tests/`
  - [ ] `infra/`

### Implementation details

- use `pnpm` workspaces and reference internal packages with `workspace:*`
- keep all shared configuration centralized where it reduces duplication
- use TypeScript strict mode everywhere from the start
- do not add convenience aliases that bypass workspace package boundaries

### Completion criteria

- root install works
- `pnpm -r exec node -v` resolves correctly in workspaces
- `turbo run build` can execute without unresolved workspace configuration

---

## Phase 1 - shared configuration packages

### Goal

Create reusable configuration packages for TypeScript, linting, and optionally shared test settings.

### Todo

- [ ] create `packages/config-typescript`
- [ ] add base TypeScript config
- [ ] add specialized configs for:
  - [ ] frontend/browser packages
  - [ ] backend/node packages
  - [ ] shared libraries
- [ ] create `packages/config-eslint`
- [ ] add base ESLint config for TypeScript
- [ ] add config extensions for Next.js and Hono projects
- [ ] optionally create `packages/config-testing` for shared Vitest helpers

### Implementation details

- expose config packages through package exports
- keep `tsconfig.json` files small in apps and packages by extending shared presets
- split server and browser TypeScript configs to prevent accidental environment leakage

### Completion criteria

- all apps and packages can extend shared config packages
- `typecheck` and `lint` run from the root without local config duplication everywhere

---

## Phase 2 - workspace applications and packages

### Goal

Create the target monorepo shape before implementation begins.

### Todo

- [ ] create `apps/web`
- [ ] create `apps/api`
- [ ] create `packages/ui`
- [ ] create `packages/contracts`
- [ ] create `packages/db`
- [ ] ensure each workspace has:
  - [ ] `package.json`
  - [ ] `tsconfig.json`
  - [ ] `src/`
  - [ ] sensible `exports` if it is a package

### Implementation details

- do not add extra packages until there is a real ownership reason
- use package names consistently, for example `@repo/ui`, `@repo/contracts`, `@repo/db`
- add package `exports` early to harden public surfaces

### Completion criteria

- all workspaces install correctly
- each workspace can be imported where allowed
- no workspace depends on unpublished relative cross-package paths

---

## Phase 3 - frontend app bootstrap (`apps/web`)

### Goal

Create the Next.js frontend with App Router and prepare it to consume internal packages and remote backend APIs.

### Todo

- [ ] scaffold a Next.js application with App Router
- [ ] keep React Server Components as default
- [ ] configure TypeScript and ESLint using shared configs
- [ ] add Tailwind CSS
- [ ] add environment variable loading for public frontend config
- [ ] configure `transpilePackages` for internal workspace packages used by the web app
- [ ] create base app structure:
  - [ ] `src/app`
  - [ ] `src/components`
  - [ ] `src/lib/api`
  - [ ] `src/lib/auth`
  - [ ] `src/lib/ag-ui`
  - [ ] `src/lib/a2ui`
  - [ ] `src/hooks`
- [ ] add a minimal home page and health/readiness UI state

### Implementation details

- keep backend calls behind a small API client layer
- do not couple components directly to fetch logic when a reusable adapter is better
- create a single source for backend base URL resolution
- explicitly separate server-only and client-only utilities

### Completion criteria

- `apps/web` runs locally
- internal packages can be imported successfully
- frontend can read its required public configuration

---

## Phase 4 - backend app bootstrap (`apps/api`)

### Goal

Create the Hono API with clean route registration, middleware, and a feature-oriented structure.

### Todo

- [ ] scaffold a Hono application for Node.js
- [ ] add `src/app.ts` and `src/server.ts`
- [ ] create folders:
  - [ ] `src/middleware`
  - [ ] `src/features`
  - [ ] `src/services`
  - [ ] `src/domain`
  - [ ] `src/repositories`
  - [ ] `src/lib`
- [ ] add baseline middleware:
  - [ ] request logging
  - [ ] error handling
  - [ ] request validation
  - [ ] auth token parsing
- [ ] add a `/health` endpoint
- [ ] add a versioned API prefix

### Implementation details

- route handlers should remain thin
- business logic belongs in services/domain modules
- repositories should be the main consumers of the DB package
- do not let Hono route files talk directly to Drizzle unless there is a deliberate exception

### Completion criteria

- `apps/api` runs locally
- `/health` returns success
- middleware stack is wired and tested at least minimally

---

## Phase 5 - local PostgreSQL with Docker

### Goal

Provide a reproducible local database environment.

### Todo

- [ ] create `infra/docker/compose.yaml`
- [ ] add a PostgreSQL service with a pinned version
- [ ] add a named volume for persistence
- [ ] add a healthcheck
- [ ] define local environment variables for DB user, password, database, and port
- [ ] document startup commands in the repo README or developer docs

### Implementation details

- prefer a pinned PostgreSQL image version over `latest`
- keep database credentials in local env files and never commit secrets
- if local API-in-Docker is added later, connect both services through the same Docker network

### Completion criteria

- local database starts with one command
- data persists across container restarts
- the DB reports healthy state before dependent setup proceeds

---

## Phase 6 - database package (`packages/db`)

### Goal

Create the shared Drizzle-based database layer.

### Todo

- [ ] install Drizzle ORM, Drizzle Kit, and PostgreSQL driver dependencies
- [ ] create `packages/db/src/schema`
- [ ] create `packages/db/src/client`
- [ ] create `packages/db/src/repositories`
- [ ] add `drizzle.config.ts`
- [ ] create migration output folder
- [ ] define database connection factory and pooling setup
- [ ] export only the public DB surface from `index.ts`

### Implementation details

- keep schema definitions grouped by domain where practical
- keep migrations committed to git
- create a minimal repository abstraction for common data access patterns
- avoid leaking low-level DB details into unrelated packages

### Completion criteria

- DB package can connect to local PostgreSQL
- migrations can be generated and run
- at least one repository test passes against a real DB

---

## Phase 7 - initial schema and migration workflow

### Goal

Establish the canonical DB workflow before building features.

### Todo

- [ ] define initial tables for agent/chat requirements:
  - [ ] `chat_sessions`
  - [ ] `chat_messages`
  - [ ] `agent_runs`
  - [ ] `tool_calls`
  - [ ] `tool_results`
- [ ] generate the initial migration
- [ ] apply the migration to local PostgreSQL
- [ ] add root scripts:
  - [ ] `db:generate`
  - [ ] `db:migrate`
  - [ ] `db:push` for optional local-only usage
  - [ ] `db:studio`
- [ ] document the difference between migration-based and push-based workflows

### Implementation details

- use committed migrations as the normal team workflow
- reserve push-based workflows for rapid local iteration only
- model enough metadata to support persistence, debugging, and tool auditability

### Completion criteria

- local DB can be recreated from migrations alone
- schema changes are reproducible in CI and on other machines

---

## Phase 8 - contracts package (`packages/contracts`)

### Goal

Create a shared schema package that defines transport-safe contracts and protocol schemas.

### Todo

- [ ] install Zod and any minimal schema helpers
- [ ] create folders for:
  - [ ] HTTP contracts
  - [ ] domain DTOs
  - [ ] AG-UI protocol helpers
  - [ ] A2UI schemas
- [ ] define initial request/response schemas for health and chat endpoints
- [ ] define A2UI versioned schema envelopes
- [ ] define normalized tool input/output types where useful

### Implementation details

- keep the package runtime-agnostic
- do not import React, Hono, or Drizzle
- use discriminated unions for protocol payload families
- version protocol payloads explicitly

### Completion criteria

- both frontend and backend can import shared contracts safely
- schemas can validate example payloads in tests

---

## Phase 9 - design system package (`packages/ui`)

### Goal

Set up an internal design system based on shadcn/ui.

### Todo

- [ ] initialize shadcn/ui in a way that supports the monorepo package layout
- [ ] configure Tailwind/theme integration for package consumption
- [ ] add foundational components:
  - [ ] button
  - [ ] input
  - [ ] textarea
  - [ ] card
  - [ ] badge
  - [ ] dialog
  - [ ] scroll area
  - [ ] separator
- [ ] add chat-oriented reusable components only if they are truly shared
- [ ] export components through a stable package entrypoint

### Implementation details

- do not move every app component into `packages/ui`
- keep app-specific feature views in `apps/web`
- extract only primitives and real design-system composites
- keep package styling predictable and documented

### Completion criteria

- frontend can render package components without local hacks
- base design-system primitives are available for feature work

---

## Phase 10 - boundary enforcement

### Goal

Prevent architecture drift before feature work expands.

### Todo

- [ ] add `eslint-plugin-boundaries`
- [ ] define element categories for:
  - [ ] `web`
  - [ ] `api`
  - [ ] `ui`
  - [ ] `db`
  - [ ] `contracts`
  - [ ] backend sublayers if used (`routes`, `services`, `repositories`, `domain`, `tools`)
- [ ] add forbidden import rules
- [ ] add `dependency-cruiser`
- [ ] create CI-enforced dependency rules for:
  - [ ] no `web -> db`
  - [ ] no cross-app imports
  - [ ] no circular dependencies
  - [ ] no missing declared dependencies
- [ ] add root `depcruise` script

### Implementation details

- use ESLint boundaries for fast feedback in editors and local runs
- use dependency-cruiser for non-bypassable repo checks in CI
- do not write custom ESLint rules unless the generic tools cannot express the rule cleanly

### Completion criteria

- illegal imports fail locally
- dependency rule violations fail in CI

---

## Phase 11 - auth foundation

### Goal

Implement the token-based auth baseline.

### Todo

- [ ] define token format and validation strategy
- [ ] implement backend auth middleware
- [ ] define frontend token storage and injection strategy
- [ ] create auth-aware API client helpers in `apps/web`
- [ ] add unauthorized and expired-token handling patterns
- [ ] document required environment variables

### Implementation details

- centralize token parsing and validation
- do not duplicate auth checks in random route files
- ensure streaming endpoints and AG-UI endpoints use the same auth model

### Completion criteria

- protected backend route rejects missing/invalid token
- frontend can call protected routes with a valid token

---

## Phase 12 - AI SDK and agent foundation

### Goal

Create the minimal backend-owned agent architecture.

### Todo

- [ ] install AI SDK dependencies in `apps/api`
- [ ] create `features/agents`
- [ ] define agent entrypoints and orchestration modules
- [ ] define a tool registry structure
- [ ] create at least one example read-only tool with schema-validated input
- [ ] add persistence hooks for chat sessions and messages
- [ ] add environment variables for provider keys

### Implementation details

- agent orchestration belongs in the backend only
- tools should have explicit input validation and auditable outputs
- provider selection should be centralized, not scattered across routes
- persistence should start early, not after the chat product becomes complex

### Completion criteria

- backend can run a minimal agent flow locally
- a tool can be invoked through the orchestration layer
- agent output can be persisted at least minimally

---

## Phase 13 - AG-UI integration

### Goal

Expose an agent event stream that the frontend can consume safely.

### Todo

- [ ] define AG-UI endpoint(s) in `apps/api`
- [ ] wire AG-UI events to agent lifecycle stages
- [ ] add auth handling for AG-UI requests
- [ ] create frontend AG-UI client/adapters in `apps/web`
- [ ] model reconnect/resume behavior if required
- [ ] add protocol tests for event ordering and auth handling

### Implementation details

- keep AG-UI concerns in protocol-specific modules, not mixed into generic UI components
- normalize internal agent events before exposing them to the frontend
- make event naming and payloads explicit and testable

### Completion criteria

- frontend receives AG-UI events from the backend
- auth failures are handled cleanly
- protocol tests validate the baseline event contract

---

## Phase 14 - A2UI integration

### Goal

Render structured agent UI safely through a deterministic frontend registry.

### Todo

- [ ] define initial A2UI schema envelopes in `packages/contracts`
- [ ] create backend A2UI payload builders in `apps/api`
- [ ] create frontend renderer registry in `apps/web`
- [ ] map approved A2UI surface types to known UI adapters
- [ ] add validation before rendering A2UI payloads
- [ ] add tests for valid and invalid payload handling

### Implementation details

- never let the agent emit arbitrary JSX or component references
- use a whitelist-based registry
- version A2UI payloads and plan for backward compatibility if the protocol evolves

### Completion criteria

- backend can emit a simple structured UI payload
- frontend can render that payload through approved components only

---

## Phase 15 - chat feature skeleton

### Goal

Create the first end-to-end vertical slice.

### Todo

- [ ] add a chat page in `apps/web`
- [ ] add input composer and message list UI
- [ ] connect chat submit flow to backend agent endpoint
- [ ] persist new session/message records
- [ ] display streamed output
- [ ] display at least one tool event or tool result
- [ ] render at least one A2UI surface

### Implementation details

- keep the first slice intentionally small and representative
- use this slice to validate architecture, not to optimize for product completeness
- avoid adding many tools before the event and persistence model is stable

### Completion criteria

- one authenticated user flow works from prompt submission to rendered output
- the full path exercises frontend, backend, DB, AG-UI, and A2UI

---

## Phase 16 - testing foundation

### Goal

Install and configure the full testing stack at the right scopes.

### Todo

- [ ] install Vitest at the root or shared config level
- [ ] configure frontend test setup with React Testing Library
- [ ] configure backend tests and Hono test helpers
- [ ] create shared test utilities where useful
- [ ] add Playwright
- [ ] add Testcontainers for DB integration tests
- [ ] define root scripts:
  - [ ] `test:unit`
  - [ ] `test:integration`
  - [ ] `test:protocol`
  - [ ] `test:e2e`

### Implementation details

- use Vitest for most tests across the monorepo
- use Playwright for real browser flows and API-level E2E
- use ephemeral PostgreSQL containers for integration tests instead of the local dev DB

### Completion criteria

- all test runners execute from the root
- each test type has at least one working representative test

---

## Phase 17 - frontend unit and integration tests

### Goal

Cover the deterministic frontend behavior without over-testing implementation details.

### Todo

- [ ] add tests for client-side components
- [ ] add tests for hooks
- [ ] add tests for API-client helpers
- [ ] add tests for A2UI renderer adapters
- [ ] add tests for token injection and unauthorized state handling

### Implementation details

- prefer behavior-oriented tests
- avoid large snapshot suites
- keep async Server Component behavior in E2E unless a narrower test is clearly stable

### Completion criteria

- critical frontend adapters and auth-aware flows have baseline coverage

---

## Phase 18 - backend unit and integration tests

### Goal

Validate routes, services, tools, and auth behavior.

### Todo

- [ ] add route tests for `/health`
- [ ] add auth middleware tests
- [ ] add service tests for the agent orchestration layer
- [ ] add tool tests with deterministic mocks
- [ ] add repository integration tests against Testcontainers PostgreSQL
- [ ] add migration verification tests

### Implementation details

- keep route tests thin and typed
- mock provider/model behavior where appropriate
- test tool success and failure paths
- verify repository behavior against real PostgreSQL behavior, not in-memory substitutes

### Completion criteria

- backend baseline behavior is covered at route, service, and repository levels

---

## Phase 19 - protocol tests

### Goal

Protect AG-UI and A2UI from accidental drift.

### Todo

- [ ] add AG-UI tests for:
  - [ ] event ordering
  - [ ] auth rejection
  - [ ] auth success
  - [ ] reconnect or resume if supported
- [ ] add A2UI tests for:
  - [ ] schema validation
  - [ ] unsupported surface rejection
  - [ ] renderer mapping compatibility
  - [ ] malformed payload handling

### Implementation details

- keep protocol tests separate from UI tests where possible
- use example fixtures for valid and invalid payloads
- treat protocol schemas as versioned contracts

### Completion criteria

- protocol regressions fail in automated tests before UI bugs reach production

---

## Phase 20 - end-to-end tests

### Goal

Validate the real user journey from the browser and the API.

### Todo

- [ ] configure Playwright web server orchestration for local/CI runs
- [ ] add browser E2E tests for:
  - [ ] login or token bootstrap
  - [ ] open chat page
  - [ ] submit a prompt
  - [ ] receive streamed agent output
  - [ ] see tool activity reflected in UI
  - [ ] render an A2UI surface
  - [ ] handle unauthorized state
- [ ] add API E2E tests for protected backend endpoints

### Implementation details

- prefer testing against production-like builds where practical
- keep E2E fixtures deterministic enough to avoid flaky AI-dependent assertions
- assert structural outcomes and protocol/UI milestones, not fragile full text output

### Completion criteria

- one full happy path passes in CI
- one auth failure path passes in CI

---

## Phase 21 - observability and developer ergonomics

### Goal

Make the system operable and maintainable during development.

### Todo

- [ ] add structured backend logging
- [ ] add request IDs or correlation IDs
- [ ] log tool execution lifecycle events
- [ ] add a developer-friendly `README.md`
- [ ] document local startup order
- [ ] document common scripts and troubleshooting

### Implementation details

- logs should be useful for debugging agent and tool flows
- avoid leaking secrets into logs
- include examples for running frontend, backend, DB, and tests together

### Completion criteria

- a new developer can start the stack and understand the main commands quickly

---

## Phase 22 - CI pipeline

### Goal

Require the architectural and quality gates on every change.

### Todo

- [ ] create CI workflow(s)
- [ ] cache pnpm dependencies
- [ ] run in CI:
  - [ ] `typecheck`
  - [ ] `lint`
  - [ ] `depcruise`
  - [ ] `test:unit`
  - [ ] `test:integration`
  - [ ] `test:protocol`
  - [ ] `test:e2e`
- [ ] add migration validation step
- [ ] define branch protection rules for required checks

### Implementation details

- fail fast on architecture and dependency violations
- make test execution explicit by layer so failures are easy to interpret
- only add coverage thresholds after the baseline suite is stable

### Completion criteria

- merge to the protected branch requires passing checks
- CI can validate a fresh clone without hidden local assumptions

---

## Recommended implementation order summary

Use this order unless there is a strong reason to change it:

1. repository baseline
2. shared configuration packages
3. workspace apps and packages
4. frontend bootstrap
5. backend bootstrap
6. local PostgreSQL
7. DB package and migrations
8. contracts package
9. UI package
10. boundary enforcement
11. auth foundation
12. AI SDK and tools foundation
13. AG-UI integration
14. A2UI integration
15. first chat vertical slice
16. testing foundation
17. protocol and integration hardening
18. E2E and CI

---

## Definition of done for the setup

The monorepo setup is complete when all of the following are true:

- frontend and backend run locally as separate applications
- local PostgreSQL runs in Docker and migrations are reproducible
- DB access is isolated in `packages/db`
- contracts are isolated in `packages/contracts`
- UI primitives are isolated in `packages/ui`
- boundary enforcement blocks illegal imports
- token auth works on protected API routes and agent endpoints
- the backend can run an agent with at least one tool
- AG-UI events reach the frontend
- A2UI payloads render through a safe registry
- unit, integration, protocol, and E2E tests all exist and run from the root
- CI enforces the required checks

---

## Change-control rule

If setup work introduces a new package, runtime responsibility, protocol, or environment variable, update:

- `architecture.md`
- this `setup.md`
- the root README or developer docs if the change affects daily workflows

-------------

# Monorepo Setup Plan

Source of truth: `docs/architecture.md`
Adjusted for: hybrid package structure (adding `packages/tmdb-client`), merged domain+agent schema, dedicated TMDb and jobs phases.

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

- [ ] `apps/web` — `package.json` (`@repo/web`), tsconfig extends nextjs preset
- [ ] `apps/api` — `package.json` (`@repo/api`), tsconfig extends node preset
- [ ] `packages/ui` — `package.json` (`@repo/ui`), tsconfig extends library preset, exports `./src/index.ts`
- [ ] `packages/contracts` — `package.json` (`@repo/contracts`), tsconfig extends library preset, exports `./src/index.ts`
- [ ] `packages/db` — `package.json` (`@repo/db`), tsconfig extends node preset, exports `./src/index.ts`
- [ ] `packages/tmdb-client` — `package.json` (`@repo/tmdb-client`), tsconfig extends node preset, exports `./src/index.ts`
- [ ] Each shell gets a placeholder `src/index.ts`
- [ ] Wire internal deps with `workspace:*` where needed:
  - `apps/web` → `@repo/ui`, `@repo/contracts`
  - `apps/api` → `@repo/contracts`, `@repo/db`, `@repo/tmdb-client`

**Done when**: `pnpm install` resolves all workspaces, `turbo run typecheck` passes.

**Commit**: `init: workspace app and package shells`

---

## Phase 3 — Frontend bootstrap (`apps/web`)

**Goal**: Running Next.js app with App Router, Tailwind, internal package imports.

- [ ] `pnpm --filter @repo/web add next react react-dom`
- [ ] `pnpm --filter @repo/web add -D @types/react @types/react-dom tailwindcss @tailwindcss/postcss postcss`
- [ ] Configure `next.config.ts` with `transpilePackages: ['@repo/ui', '@repo/contracts']`
- [ ] `tailwind.config.ts` scanning `./src/**`, `../../packages/ui/src/**`
- [ ] `postcss.config.mjs`
- [ ] Create directory structure:
  - `src/app/` (layout.tsx, page.tsx, globals.css)
  - `src/components/`
  - `src/lib/api/`
  - `src/lib/auth/`
  - `src/lib/ag-ui/`
  - `src/lib/a2ui/`
  - `src/hooks/`
- [ ] Minimal home page with health status text
- [ ] `.env.example` with `NEXT_PUBLIC_API_URL`

**Done when**: `pnpm --filter @repo/web dev` serves the app, internal package imports resolve.

**Commit**: `init: nextjs frontend with app router and tailwind`

---

## Phase 4 — Backend bootstrap (`apps/api`)

**Goal**: Running Hono app with middleware, health endpoint, feature-oriented structure.

- [ ] `pnpm --filter @repo/api add hono @hono/node-server`
- [ ] `pnpm --filter @repo/api add -D tsx`
- [ ] Create `src/app.ts` — Hono app with middleware stack and route registration
- [ ] Create `src/server.ts` — Node.js HTTP server entry
- [ ] Create directories:
  - `src/middleware/` (auth, logging, error-handler, validation)
  - `src/features/` (health/)
  - `src/services/`
  - `src/domain/`
  - `src/repositories/`
  - `src/lib/`
- [ ] Middleware: request logger, global error handler, auth token parser (placeholder), request-id
- [ ] `GET /health` → `{ status: "ok" }`
- [ ] Versioned API prefix: `/api/v1`
- [ ] `dev` script using `tsx watch`
- [ ] `.env.example` with `PORT`, `DATABASE_URL`, `JWT_SECRET`

**Done when**: `pnpm --filter @repo/api dev` runs, `curl localhost:3001/health` returns ok.

**Commit**: `init: hono backend with middleware and health endpoint`

---

## Phase 5 — Local PostgreSQL with Docker

**Goal**: One-command local DB.

- [ ] `infra/docker/compose.yaml`:
  - PostgreSQL 16 (pinned)
  - Named volume `pgdata`
  - Healthcheck (`pg_isready`)
  - Ports: `5432:5432`
  - Env: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- [ ] `infra/docker/.env` (gitignored) with local creds
- [ ] `.env.example` at infra level
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
- [ ] `src/repositories/` — empty, ready for repo helpers
- [ ] `drizzle.config.ts` pointing to schema dir, migration output `src/migrations/`
- [ ] Export client, schema, and repository surfaces from `src/index.ts`

**Done when**: package builds, drizzle config resolves, `drizzle-kit generate` can run (even with empty schema).

**Commit**: `init: database package with drizzle and postgres driver`

---

## Phase 7 — Initial schema and migrations

**Goal**: Define all initial tables (agent + domain), generate and apply first migration.

Tables:
- [ ] `movies` — id, tmdb_id, title, year, synopsis, genres, cast, directors, runtime, language, poster_url, backdrop_url, popularity, release_date, created_at, updated_at
- [ ] `watchlist_items` — id, user_id, movie_id (FK), added_at. Unique(user_id, movie_id)
- [ ] `super_watchlist_items` — id, user_id, movie_id (FK), added_at, expires_at, status (active/watched/expired/removed). Index on (user_id, status), (expires_at)
- [ ] `watched_items` — id, user_id, movie_id (FK), watched_at, note, rating, created_from, created_at
- [ ] `agent_sessions` — id, user_id, last_resolved_movie_id, context (jsonb), created_at, updated_at
- [ ] `chat_messages` — id, session_id (FK), role, content, metadata (jsonb), created_at
- [ ] `agent_runs` — id, session_id (FK), status, started_at, finished_at, metadata (jsonb)
- [ ] `tool_calls` — id, run_id (FK), tool_name, input (jsonb), output (jsonb), status, created_at
- [ ] `tool_results` — id, tool_call_id (FK), result (jsonb), error, created_at

Scripts:
- [ ] `drizzle-kit generate` → first migration
- [ ] `drizzle-kit migrate` → apply to local DB
- [ ] Root scripts: `db:generate`, `db:migrate`, `db:push`, `db:studio`

**Done when**: local DB has all tables, migration is committed, can recreate from scratch.

**Commit**: `init: initial database schema and migration`

---

## Phase 8 — Contracts package (`packages/contracts`)

**Goal**: Shared Zod schemas for HTTP, domain DTOs, AG-UI, A2UI.

- [ ] `pnpm --filter @repo/contracts add zod`
- [ ] `src/http/` — health request/response schemas, orchestrator request/response schemas
- [ ] `src/domain/` — Movie, WatchlistItem, SuperWatchlistItem, WatchedItem, AgentSession DTOs
- [ ] `src/intents/` — Intent union type, UserInteraction schema
- [ ] `src/ag-ui/` — AG-UI event type helpers
- [ ] `src/a2ui/` — A2UI component type enum, versioned payload envelope schemas
- [ ] `src/tools/` — tool input/output schemas (SearchMovies, GetMovieDetails, AddToWatchlist, etc.)
- [ ] All exported from `src/index.ts`

**Done when**: both `apps/web` and `apps/api` can import and use shared schemas.

**Commit**: `init: contracts package with zod schemas`

---

## Phase 9 — TMDb client package (`packages/tmdb-client`)

**Goal**: Typed TMDb API wrapper, no domain logic.

- [ ] `pnpm --filter @repo/tmdb-client add zod`
- [ ] `src/client.ts` — TMDb API client (fetch-based, typed responses)
- [ ] `src/types.ts` — TMDb response types (search/movie, movie/details, credits)
- [ ] `src/endpoints/` — `searchMovies`, `getMovieDetails`, `getMovieCredits`
- [ ] Config via env var `TMDB_API_KEY`
- [ ] Export from `src/index.ts`

**Done when**: client can call TMDb search endpoint with valid API key, types are clean.

**Commit**: `init: tmdb client package`

---

## Phase 10 — UI package (`packages/ui`)

**Goal**: shadcn/ui-based design system for monorepo consumption.

- [ ] Init shadcn/ui for monorepo package layout
- [ ] `pnpm --filter @repo/ui add react react-dom tailwindcss class-variance-authority clsx tailwind-merge lucide-react`
- [ ] Configure Tailwind/theme integration
- [ ] Add foundational components: button, input, textarea, card, badge, dialog, scroll-area, separator
- [ ] Stable export entrypoint from `src/index.ts`
- [ ] `src/lib/utils.ts` — cn helper

**Done when**: `apps/web` can render `@repo/ui` components without hacks.

**Commit**: `init: ui package with shadcn components`

---

## Phase 11 — Boundary enforcement

**Goal**: Prevent architecture drift.

- [ ] `eslint-plugin-boundaries` config in `packages/config-eslint`:
  - Element categories: web, api, ui, db, contracts, tmdb-client
  - Forbidden: web→db, web→api, api→ui, ui→db, contracts→framework code
- [ ] `dependency-cruiser` at root:
  - `.dependency-cruiser.cjs` with forbidden rules
  - No circular deps, no missing deps, no cross-app imports
- [ ] Root script: `depcruise`

**Done when**: illegal imports fail lint, `pnpm depcruise` catches violations.

**Commit**: `init: boundary enforcement with eslint-boundaries and dependency-cruiser`

---

## Phase 12 — Auth foundation

**Goal**: Token-based auth baseline.

- [ ] Backend: JWT middleware in `apps/api/src/middleware/auth/`
  - Token parsing, validation, user extraction
  - Reject missing/invalid/expired tokens
- [ ] Frontend: token storage strategy in `apps/web/src/lib/auth/`
  - API client injects bearer token
  - Unauthorized/expired handling (redirect or state)
- [ ] Shared auth-related schemas in `packages/contracts` if needed
- [ ] Document required env vars: `JWT_SECRET`, `JWT_ISSUER`

**Done when**: protected backend route rejects bad tokens, frontend can call protected routes.

**Commit**: `init: token-based auth foundation`

---

## Phase 13 — AI SDK and agent foundation

**Goal**: Minimal backend-owned agent architecture.

- [ ] `pnpm --filter @repo/api add ai @ai-sdk/openai` (or provider of choice)
- [ ] `src/features/agents/` — agent entrypoint, orchestrator module
- [ ] `src/features/tools/` — tool registry structure
- [ ] One example read-only tool (`searchMovies`) with schema-validated input using `@repo/tmdb-client`
- [ ] Persistence hooks for sessions and messages via `@repo/db`
- [ ] Env vars: `OPENAI_API_KEY` (or equivalent provider key)

**Done when**: backend can run a minimal agent flow locally, tool is callable, output persists.

**Commit**: `init: ai sdk agent foundation with tool registry`

---

## Phase 14 — AG-UI integration

**Goal**: Streaming agent events to frontend.

- [ ] Backend: AG-UI endpoint(s) in `apps/api`
- [ ] Wire AG-UI events to agent lifecycle stages
- [ ] Auth handling for AG-UI requests
- [ ] Frontend: AG-UI client/adapters in `apps/web/src/lib/ag-ui/`
- [ ] Reconnect/resume handling if needed

**Done when**: frontend receives AG-UI events from backend, auth failures handled.

**Commit**: `init: ag-ui streaming integration`

---

## Phase 15 — A2UI integration

**Goal**: Structured UI rendering through safe registry.

- [ ] Backend: A2UI payload builders in `apps/api`
- [ ] Frontend: renderer registry in `apps/web/src/lib/a2ui/`
- [ ] Map approved surface types to UI adapters (movie_search_results, movie_detail_card, etc.)
- [ ] Validation before rendering

**Done when**: backend emits structured UI payload, frontend renders through approved components only.

**Commit**: `init: a2ui renderer registry`

---

## Phase 16 — Background job infrastructure

**Goal**: Recurring job capability for super watchlist expiry.

- [ ] `apps/api/src/jobs/` — job runner infrastructure (simple cron-like or interval-based)
- [ ] `expireSuperWatchlistItems` job:
  - Find active items with `expires_at < now()`
  - Mark as expired
  - Remove related watchlist item
- [ ] `POST /api/v1/jobs/expire-super-watchlist` internal endpoint
- [ ] Configurable interval (default: hourly)

**Done when**: expiry job runs, correctly cascades state changes.

**Commit**: `init: background job infrastructure with super watchlist expiry`

---

## Phase 17 — Chat feature skeleton (vertical slice)

**Goal**: First end-to-end flow from input to rendered output.

- [ ] Chat page in `apps/web` — input composer + message list
- [ ] Connect chat submit to backend orchestrator endpoint
- [ ] Persist session/messages
- [ ] Display streamed output
- [ ] Display at least one tool event
- [ ] Render at least one A2UI surface (e.g. movie_search_results)

**Done when**: user can type a query, get agent response with tool results and UI blocks.

**Commit**: `init: chat feature vertical slice`

---

## Phase 18 — Testing foundation

**Goal**: Full testing stack configured.

- [ ] `pnpm add -Dw vitest`
- [ ] Frontend: React Testing Library setup
- [ ] Backend: Hono test helpers
- [ ] `pnpm add -Dw playwright @playwright/test`
- [ ] `pnpm --filter @repo/db add -D testcontainers @testcontainers/postgresql`
- [ ] Root scripts: `test:unit`, `test:integration`, `test:protocol`, `test:e2e`
- [ ] One representative test per category

**Done when**: all test runners execute from root with at least one passing test each.

**Commit**: `init: testing foundation with vitest and playwright`

---

## Phase 19 — Observability and DX

**Goal**: Operable system, smooth onboarding.

- [ ] Structured backend logging (request IDs, tool lifecycle)
- [ ] Developer README with startup order, scripts, troubleshooting
- [ ] Document local startup: `pnpm db:up` → `pnpm db:migrate` → `pnpm dev`

**Done when**: new developer can start the full stack from README.

**Commit**: `init: observability and developer documentation`

---

## Phase 20 — CI pipeline

**Goal**: All quality gates enforced on every push.

- [ ] `.github/workflows/ci.yml`
- [ ] Cache pnpm deps
- [ ] Steps: `typecheck`, `lint`, `depcruise`, `test:unit`, `test:integration`, `test:protocol`, `test:e2e`
- [ ] Migration validation step
- [ ] Branch protection rules on main

**Done when**: merge to main requires all checks green.

**Commit**: `init: ci pipeline with all quality gates`

---

## Summary of changes vs original setup.md

| Change | Reason |
|---|---|
| Added `packages/tmdb-client` | Hybrid approach — pure external API wrapper |
| Merged domain tables into Phase 7 | MVP needs domain tables from the start |
| Added Phase 9 (TMDb client) | scope.md requires TMDb for movie search |
| Added Phase 16 (Background jobs) | scope.md requires super watchlist expiry |
| Removed redundant Phase 17-20 (per-layer test phases) | Consolidated into single testing foundation phase |
| Reduced from 22 to 20 phases | Less overhead, same coverage |
