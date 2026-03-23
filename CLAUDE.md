## Projects

- This project is for the handling movies watchlist and reviews

## Stack

### Backend
- Hono for the web server and API
- Drizzle ORM for database interactions
- PostgreSQL as the database

### Frontend
- NextJS for the React framework
- Shadcn UI for the component library and design system

### Testing
- Vitest for unit and integration tests
- React Testing Library for frontend component tests
- Testcontainers for database integration tests

## Documentation

- `docs/architecture.md` — System architecture and principles
- `docs/design.md` — Design system specification
- `docs/conventions.md` — Coding patterns and how to add features
- `docs/packages.md` — Per-package reference and public API

## Monorepo structure

```
.
├─ apps/
│  ├─ web/              # Next.js frontend (port 3000)
│  └─ api/              # Hono backend (port 3001)
├─ packages/
│  ├─ ui/               # internal design system (shadcn/ui)
│  ├─ contracts/        # shared Zod schemas and DTOs
│  ├─ db/               # Drizzle schema, migrations, DB client
│  ├─ tmdb-client/      # typed TMDb API wrapper
│  ├─ config-typescript/ # shared tsconfig presets
│  └─ config-eslint/    # shared eslint flat configs
├─ tests/               # cross-app and protocol tests (empty)
├─ infra/
│  └─ docker/
│     └─ compose.yaml   # local PostgreSQL 16
├─ plans/               # implementation plans
├─ docs/                # architecture and design docs
├─ turbo.json
├─ pnpm-workspace.yaml
└─ package.json
```

### Internal dependency graph

- `apps/web` → `@repo/ui`, `@repo/contracts`
- `apps/api` → `@repo/contracts`, `@repo/db`, `@repo/tmdb-client`

### Forbidden imports

- `apps/web` must never import `@repo/db`
- `apps/api` must never import `@repo/ui`

Enforced by eslint-plugin-boundaries (editor feedback) and dependency-cruiser (CI).

## Commands

### Root scripts (run from repo root with `pnpm`)

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all apps in dev mode (turbo) |
| `pnpm build` | Build all packages and apps |
| `pnpm typecheck` | Run TypeScript checks across all workspaces |
| `pnpm lint` | Run ESLint across all workspaces |
| `pnpm test` | Run tests across all workspaces |
| `pnpm depcruise` | Check dependency boundaries |
| `pnpm db:up` | Start local PostgreSQL via Docker Compose |
| `pnpm db:down` | Stop local PostgreSQL |
| `pnpm db:generate` | Generate Drizzle migration |
| `pnpm db:migrate` | Apply migrations to local DB |
| `pnpm db:push` | Push schema to DB (no migration file) |
| `pnpm db:studio` | Open Drizzle Studio |

### Local development startup

1. `pnpm db:up` — Start PostgreSQL
2. `pnpm db:migrate` — Apply migrations
3. `pnpm dev` — Start frontend + backend

### Per-app scripts

| Command | Description |
|---------|-------------|
| `pnpm --filter @repo/web dev` | Start Next.js dev server (port 3000) |
| `pnpm --filter @repo/web build` | Build Next.js production bundle |
| `pnpm --filter @repo/api dev` | Start Hono dev server with tsx watch (port 3001) |

## TypeScript config presets

Shared presets in `packages/config-typescript/`:
- `base.json` — strict mode, ESNext, bundler resolution
- `nextjs.json` — extends base, JSX, Next.js plugin
- `node.json` — extends base, Node types
- `library.json` — extends base, declaration emit

## ESLint config presets

Shared flat configs in `packages/config-eslint/`:
- `base` — TypeScript + recommended rules
- `nextjs` — extends base with browser globals
- `node` — extends base with Node globals
- `boundaries` — eslint-plugin-boundaries import enforcement

## Expected Agent Behaviour

- When external tools fail 3 times, stop retrying. Ask me for an alternative approach - I can paste content, describe requirements, or we can skip that step.
- When implementing from a plan file, after completing each phase: 1) summarize what was done, 2) list files changed, 3) note any issues, 4) confirm before starting next phase
- Read `docs/conventions.md` before adding new features — it documents the patterns for routes, schemas, tables, and components

## Git usage
- When implementing features from a plan, make commits with short single-line messages (no body text)
