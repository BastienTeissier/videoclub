# Architecture

## Purpose

This document is the source of truth for the monorepo architecture.
It is written for humans and coding agents so new features can be implemented without guessing about repository structure, package boundaries, runtime ownership, testing strategy, or integration patterns.

The goals of this architecture are:

- keep the frontend and backend operationally independent
- keep domain logic and agent logic on the backend
- preserve strict import boundaries in the monorepo
- make UI composition predictable and safe
- keep infrastructure and local development reproducible
- make testing and CI first-class from day one

---

## Product and runtime model

### High-level system

The system is composed of:

- a **Next.js** frontend application
- a **Hono** backend API deployed separately
- a **PostgreSQL** database for local development via Docker and a managed PostgreSQL database in deployed environments
- a shared monorepo with reusable packages for UI, contracts, and database access
- an AI agent layer implemented with **Vercel AI SDK** on the backend
- an event protocol layer using **AG-UI**
- a structured UI payload layer using **A2UI**

### Deployment model

The frontend and backend are deployed separately.

- `apps/web` is deployed as the frontend application
- `apps/api` is deployed as the backend API
- the frontend never embeds or owns agent orchestration logic
- the backend is the only deployable unit that owns tool execution, model calls, and privileged integrations

### Authentication model

Authentication is **token-based**.

Implications:

- the frontend stores and sends bearer tokens using secure application patterns
- the backend validates tokens for all protected routes
- AG-UI and any streaming endpoints must support bearer-token authentication
- backend tools must execute only after auth and authorization checks are complete

---

## Tech stack

### Core platform

- **Node.js**: current LTS in the repo toolchain
- **pnpm**: package manager and workspace manager
- **Turborepo**: task orchestration, caching, workspace pipeline
- **TypeScript**: strict mode everywhere

### Frontend

- **Next.js** with **App Router**
- **React**
- **shadcn/ui** as the internal design-system foundation
- **Tailwind CSS** for styling
- frontend integration for **AG-UI** and **A2UI** rendering

### Backend

- **Hono** running on Node.js
- **Vercel AI SDK** for agents, tools, generation, streaming, and test utilities
- **Zod** as the default schema language for request validation, contracts, tool inputs, and structured payloads

### Data

- **PostgreSQL**
- **Drizzle ORM**
- **Drizzle Kit** for migrations and schema workflows

### Testing

- **Vitest** for unit and most integration tests
- **React Testing Library** for frontend component tests
- **Playwright** for browser E2E and API E2E
- **Testcontainers** for ephemeral PostgreSQL integration tests

### Architecture enforcement

- **eslint-plugin-boundaries** for local import-boundary feedback
- **dependency-cruiser** for CI-level dependency rules and architecture checks

---

## Monorepo structure

```text
.
├─ apps/
│  ├─ web/                    # Next.js frontend
│  └─ api/                    # Hono backend
├─ packages/
│  ├─ ui/                     # internal design system built on shadcn/ui
│  ├─ contracts/              # shared schemas, DTOs, protocol types
│  ├─ db/                     # Drizzle schema, migrations, DB client, repositories
│  ├─ config-typescript/      # shared tsconfig presets
│  ├─ config-eslint/          # shared eslint config
│  └─ config-testing/         # optional shared test config/helpers
├─ tests/
│  ├─ e2e/
│  │  ├─ web/
│  │  └─ api/
│  └─ protocol/
│     ├─ ag-ui/
│     └─ a2ui/
├─ infra/
│  └─ docker/
│     └─ compose.yaml         # local postgres and optional local services
├─ turbo.json
├─ pnpm-workspace.yaml
├─ package.json
└─ .github/
   └─ workflows/
```

### Ownership rules

- `apps/web` owns frontend routing, rendering, page composition, chat UX, and protocol consumers
- `apps/api` owns request handling, auth validation, domain services, AI orchestration, tools, and persistence
- `packages/ui` owns reusable presentational and composable UI primitives
- `packages/contracts` owns shared schema definitions and transport-safe types
- `packages/db` owns schema, migrations, DB connection factory, and repository helpers
- `tests` owns cross-application and protocol-level validation that should not live inside one app

---

## Architectural principles

### 1. Backend owns all privileged logic

The backend owns:

- agent orchestration
- tool registration and execution
- provider keys and model selection
- persistence
- business workflows
- auth and authorization
- rate limiting and safety policies

The frontend must not call providers directly and must not run privileged tools.

### 2. Frontend is server-first but thin

The Next.js app should prefer Server Components by default.
Client Components should exist only where needed for:

- interactivity
- browser APIs
- local UI state
- streaming consumers
- real-time protocol adapters

### 3. Shared packages must remain environment-safe

A shared package must be safe for every environment that imports it.
That means:

- `packages/contracts` must not import Node-only or browser-only runtime code
- `packages/ui` must not import backend-only code
- `packages/db` must never be imported by the frontend

### 4. Contracts are explicit

Every boundary should be typed and validated:

- HTTP requests and responses
- AG-UI events
- A2UI payloads
- tool inputs and outputs
- persistence DTOs where needed

### 5. Prefer deterministic adapters over dynamic magic

The agent may emit structured UI data, but the frontend should render it through a deterministic adapter layer.
The agent must not control raw React component selection directly.

---

## Application architecture

## `apps/web` frontend

### Responsibilities

- page routing and layouts
- chat UI and interaction flows
- token-aware API client usage
- AG-UI client/event consumption
- A2UI renderer integration
- rendering design-system components from `packages/ui`
- frontend-only view state

### Non-responsibilities

- no database access
- no direct provider SDK calls for AI features
- no tool execution
- no backend business logic
- no privileged secrets

### Suggested internal structure

```text
apps/web/
├─ src/
│  ├─ app/
│  ├─ components/
│  │  ├─ features/
│  │  ├─ layout/
│  │  └─ adapters/
│  ├─ lib/
│  │  ├─ api/
│  │  ├─ auth/
│  │  ├─ ag-ui/
│  │  └─ a2ui/
│  ├─ hooks/
│  └─ styles/
├─ public/
└─ tests/
```

### Frontend rendering rules

- use Server Components by default
- isolate AG-UI subscriptions and A2UI streaming rendering inside client-side adapters
- keep view components free of networking logic where possible
- use `packages/ui` for reusable primitives and design-system-level composites
- do not place app-specific domain logic inside `packages/ui`

---

## `apps/api` backend

### Responsibilities

- Hono route definitions
- token authentication and authorization middleware
- domain services
- AI agent lifecycle and orchestration
- tool registry and tool execution
- AG-UI server endpoint(s)
- A2UI payload generation
- persistence through `packages/db`
- observability and audit logging

### Suggested internal structure

```text
apps/api/
├─ src/
│  ├─ app.ts
│  ├─ server.ts
│  ├─ middleware/
│  │  ├─ auth/
│  │  ├─ logging/
│  │  ├─ rate-limit/
│  │  └─ validation/
│  ├─ features/
│  │  ├─ health/
│  │  ├─ auth/
│  │  ├─ chat/
│  │  ├─ agents/
│  │  └─ tools/
│  ├─ services/
│  ├─ domain/
│  ├─ repositories/
│  └─ lib/
└─ tests/
```

### Backend layering rules

Recommended dependency direction:

- `routes` → `services` → `repositories`
- `routes` may call `services`
- `services` may call `repositories`, `domain`, and `tools`
- `repositories` may call `packages/db`
- `domain` should remain framework-agnostic

Disallowed:

- routes directly importing Drizzle schema/client
- frontend packages importing backend services
- domain layer importing Hono-specific objects

---

## AI and agent architecture

### Ownership model

The AI agent is backend-owned.
The backend uses AI SDK to:

- register models
- define and validate tools
- control multi-step execution
- transform output into AG-UI events and A2UI payloads
- persist runs and messages

### AG-UI responsibilities

AG-UI is the transport/event contract between frontend and backend.
Use it for:

- request lifecycle events
- agent step updates
- tool call lifecycle events
- streaming assistant output
- resumability and reconnect-aware flows

### A2UI responsibilities

A2UI is the structured UI payload protocol.
Use it for:

- creating UI surfaces
- updating UI surfaces
- attaching data models
- rendering structured task results

### A2UI rendering policy

The frontend must implement a **strict renderer registry**.
That registry maps approved A2UI surface/component types to known UI adapters built with `packages/ui`.

Rules:

- never render arbitrary JSX from the agent
- never allow the agent to reference private frontend internals
- only render whitelisted surface/component kinds
- version the A2UI payload schema
- validate payloads before rendering

### Tool execution policy

All tools must:

- have explicit input schemas
- have explicit output schemas or normalized output contracts
- be auditable
- be authorized per request context where relevant
- fail in a typed and user-safe way

Suggested tool categories:

- pure read tools
- write tools with idempotency safeguards
- external integration tools
- workflow tools that call internal services

### Persistence model for agent features

At minimum, persist:

- chat sessions
- chat messages
- agent runs
- tool calls
- tool results or tool event summaries
- resumable stream metadata if needed

---

## Data architecture

## `packages/db`

### Responsibilities

- Drizzle schema definitions
- migration files
- migration runner helpers
- DB client and pooling factory
- repository-level helpers
- optional seed utilities

### Suggested structure

```text
packages/db/
├─ src/
│  ├─ client/
│  ├─ schema/
│  ├─ repositories/
│  ├─ migrations/
│  ├─ seeds/
│  └─ index.ts
├─ drizzle.config.ts
└─ tests/
```

### Database design rules

- schema definitions are the source of truth
- migration files are committed to git
- repository helpers should not leak arbitrary SQL into unrelated packages
- do not import DB client directly in `apps/web`

### Initial tables to plan for

The exact schema may evolve, but the initial design should anticipate:

- `users` or auth subject mapping table if needed
- `chat_sessions`
- `chat_messages`
- `agent_runs`
- `tool_calls`
- `tool_results`
- domain-specific business tables

### Local database

Local development uses PostgreSQL in Docker with:

- pinned image version
- named volume for persistence
- healthcheck
- isolated Docker network if needed

---

## Contracts and validation

## `packages/contracts`

### Responsibilities

- shared request/response schemas
- shared DTOs
- AG-UI event schemas used internally for validation/testing helpers
- A2UI payload schemas and version metadata
- public-safe enums and discriminated unions

### Rules

- no React imports
- no Hono imports
- no database imports
- no Node-only runtime assumptions
- prefer Zod schemas as the canonical representation

### Why this matters

One schema system should drive:

- route validation
- internal service validation where useful
- tool input validation
- frontend parsing of structured payloads
- protocol tests

---

## UI architecture

## `packages/ui`

### Responsibilities

- design tokens and theme glue
- shared shadcn/ui-based components
- approved high-value composites used in multiple pages or flows
- A2UI renderer target components when they are truly reusable

### Non-responsibilities

- page-specific business logic
- backend data fetching
- protocol parsing
- domain services

### Suggested structure

```text
packages/ui/
├─ src/
│  ├─ components/
│  ├─ composites/
│  ├─ primitives/
│  ├─ icons/
│  └─ index.ts
└─ tests/
```

### Design system rules

- keep the design system internal to the monorepo
- do not optimize for external distribution yet
- prefer composition over excessively abstract generic components
- extract to `packages/ui` only when a component is reusable or part of the design language

---

## Boundaries and enforcement

## Allowed dependency map

### Apps

- `apps/web` may import:
  - `packages/ui`
  - `packages/contracts`
  - safe client helpers in its own app
- `apps/api` may import:
  - `packages/contracts`
  - `packages/db`
  - backend-local features and services

### Packages

- `packages/ui` may import:
  - React
  - styling libs
  - `packages/contracts` only if the imported symbols are transport-safe and UI-safe
- `packages/contracts` may import:
  - schema utilities only
- `packages/db` may import:
  - database and server-only libraries
  - `packages/contracts` only when it improves shared domain typing without introducing coupling

## Forbidden dependency map

- `apps/web` → `packages/db`
- `apps/web` → `apps/api`
- `apps/api` → `packages/ui`
- `packages/ui` → `packages/db`
- `packages/contracts` → framework-specific runtime code
- route handlers → direct DB schema/client imports

## Enforcement tools

### ESLint boundaries

Use `eslint-plugin-boundaries` for:

- immediate editor feedback
- illegal import detection during local development
- enforcing layer-to-layer import rules

### dependency-cruiser

Use `dependency-cruiser` in CI for:

- forbidden cross-package imports
- circular dependency detection
- orphan detection where useful
- missing dependency declarations
- app/package architecture reports

### Compile-time hardening

Also use:

- package `exports`
- strict TypeScript project references or split tsconfigs where appropriate
- server-only and client-only runtime guards where useful

---

## Environment and configuration

### Principles

- no secrets committed to git
- root `.env.example` documents required variables
- each app documents its own environment variables
- only public frontend values use `NEXT_PUBLIC_` prefixes
- backend secrets remain backend-only

### Expected environment categories

#### Frontend

- public API base URL
- auth configuration safe for frontend usage
- optional frontend analytics flags

#### Backend

- database URL
- token verification secrets or issuer/audience settings
- AI provider keys
- external integration keys
- observability settings

#### Local Docker

- postgres user
- postgres password
- postgres database
- port mapping if non-default

---

## Testing architecture

### Goals

The test strategy must validate:

- local logic correctness
- route correctness
- database correctness
- protocol correctness
- browser behavior
- architecture invariants

### Unit testing

Use Vitest for:

- utility functions
- domain logic
- schema transformations
- UI component logic
- tool normalization logic
- auth helper logic

### Frontend tests

Use Vitest and React Testing Library for:

- client components
- hooks
- view-model utilities
- A2UI rendering adapters where deterministic

Do not rely on unit tests for complex async Server Component behavior.
Use E2E for those flows.

### Backend tests

Use Vitest and Hono test helpers for:

- route handlers
- middleware behavior
- auth behavior
- service orchestration
- tool wrappers

### Database integration tests

Use Testcontainers with PostgreSQL for:

- migration verification
- repository behavior
- transaction-sensitive logic
- realistic DB integration

Do not couple tests to the developer's local Compose database.

### Protocol tests

Maintain dedicated tests for:

- AG-UI event ordering and payload shape
- AG-UI auth behavior
- stream reconnect or resume behavior if implemented
- A2UI schema validation
- renderer compatibility between payload types and component registry

### End-to-end tests

Use Playwright for:

- login/token bootstrap
- open chat flow
- prompt submission
- streamed agent response
- tool event visibility
- A2UI surface rendering
- unauthorized and expired token flows
- recovery/reload flows

### API E2E

Use Playwright API testing for:

- backend endpoint validation
- auth failure/success cases
- agent endpoint response contracts
- non-browser transport checks

---

## Observability and operational concerns

### Logging

At minimum, the backend should log:

- request metadata
- auth failures
- tool execution lifecycle
- model/provider failures
- persistence errors
- protocol-level errors

### Tracing and metrics

Plan for later addition of:

- route latency
- tool latency
- agent step counts
- token usage and provider cost metrics
- A2UI render error counters

### Auditability

For agent/tool features, persist enough metadata to answer:

- who initiated the request
- what tools ran
- what external systems were touched
- what UI surfaces were emitted
- what failed

---

## CI requirements

The main branch should require green results for:

- `typecheck`
- `lint`
- `depcruise`
- `test:unit`
- `test:integration`
- `test:protocol`
- `test:e2e`
- migration validity checks

Optional later gates:

- coverage thresholds
- visual-regression approval checks
- bundle-size checks for the frontend

---

## Coding standards for future feature work

A coding agent implementing new features must follow these rules:

1. do not introduce new cross-package imports unless they respect the dependency map
2. do not place backend logic in the frontend app
3. do not place page-specific logic in `packages/ui`
4. validate all external input
5. define schemas before wiring routes or tools
6. write tests at the correct level, not just unit snapshots
7. prefer extending existing feature folders over creating parallel abstractions
8. keep agent output structured and renderer-safe
9. persist important agent state transitions
10. document any new package, protocol, or environment variable in this file

---

## Non-goals

The initial setup does not aim to:

- support multi-tenant plugin execution from day one
- distribute the design system externally
- allow arbitrary frontend component generation by the agent
- share runtime code between frontend and backend without explicit contracts
- collapse frontend and backend into one deployment target

---

## Decision summary

### Chosen

- separate `web` and `api` deployables
- token-based authentication
- backend-owned agent and tool execution
- AG-UI for event transport
- A2UI for structured UI payloads
- shadcn/ui as internal design system foundation
- Drizzle + PostgreSQL
- pnpm + Turborepo + TypeScript strict mode
- boundary enforcement with ESLint and dependency-cruiser
- testing with Vitest, Playwright, and Testcontainers

### Explicitly rejected

- direct DB access from the frontend
- agent execution in the browser
- custom ESLint rules as the first boundary-enforcement mechanism
- unbounded dynamic UI generation without adapter control

---

## Maintenance instructions

Update this file when any of the following changes:

- repository structure
- package ownership
- runtime ownership
- auth strategy
- agent protocol strategy
- tool execution model
- testing stack
- CI gates
- boundary rules
- environment categories

When in doubt, prefer keeping this file short, explicit, and operationally useful rather than encyclopedic.
