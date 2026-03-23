# Package Reference

## apps/web (`@repo/web`)

**Purpose**: Next.js frontend application

**Port**: 3000

**Key exports**: None (application, not a library)

**Internal dependencies**: `@repo/ui`, `@repo/contracts`

**Structure**:
- `src/app/` — Next.js App Router pages and layouts
- `src/components/` — React components
- `src/hooks/` — Custom React hooks
- `src/lib/api/` — API client and endpoint functions

**Scripts**:
- `dev` — Start dev server with Turbopack
- `build` — Production build
- `test` — Run Vitest tests
- `typecheck` — TypeScript check
- `lint` — ESLint with boundary rules

---

## apps/api (`@repo/api`)

**Purpose**: Hono backend API server

**Port**: 3001

**Key exports**: None (application, not a library)

**Internal dependencies**: `@repo/contracts`, `@repo/db`, `@repo/tmdb-client`

**Structure**:
- `src/app.ts` — Hono app with middleware and route registration
- `src/server.ts` — Node.js HTTP server entry point
- `src/features/<name>/route.ts` — Feature route handlers
- `src/services/` — Business logic services
- `src/middleware/` — Request middleware (logger, error handler, request-id, CORS)
- `src/lib/` — Shared utilities (db client singleton)

**Scripts**:
- `dev` — Start with tsx watch
- `test` — Run Vitest tests
- `typecheck` — TypeScript check
- `lint` — ESLint with boundary rules

**Endpoints**:
- `GET /health` — Health check
- `GET /api/v1/movies/search?q=<query>` — Search movies by title

---

## packages/ui (`@repo/ui`)

**Purpose**: Internal design system built on shadcn/ui

**Exports**: `@repo/ui` → `src/index.ts`

**Public API**:
- `cn()` — Tailwind class merging utility
- `Button`, `buttonVariants` — Button component with variants
- `Input` — Text input component
- `Card`, `CardHeader`, `CardContent`, `CardFooter`, `CardTitle`, `CardDescription` — Card components
- `Badge`, `badgeVariants` — Badge component with variants
- `ScrollArea`, `ScrollBar` — Scrollable container
- `Separator` — Visual separator

**How to extend**: Add new components in `src/components/`, export from `src/index.ts`

---

## packages/contracts (`@repo/contracts`)

**Purpose**: Shared Zod schemas and DTOs used by both frontend and backend

**Exports**: `@repo/contracts` → `src/index.ts`

**Public API**:
- `movieSchema`, `MovieDto` — Movie domain DTO
- `movieSearchRequestSchema`, `MovieSearchRequest` — Search request validation
- `movieSearchResponseSchema`, `MovieSearchResponse` — Search response shape

**Rules**: No React, Hono, Node, or DB imports allowed

**How to extend**: Add domain DTOs in `src/domain/`, HTTP schemas in `src/http/`

---

## packages/db (`@repo/db`)

**Purpose**: Drizzle ORM schema, migrations, and repository helpers

**Exports**: `@repo/db` → `src/index.ts`

**Public API**:
- `createDb(connectionString)` — Create database connection, returns `{ db, client }`
- `Database` — TypeScript type for the drizzle instance
- `movies`, `Movie`, `NewMovie` — Movies table schema and types
- `moviesRepository(db)` — Factory returning `{ searchByTitle, upsertFromTmdb }`

**How to extend**: Add schema in `src/schema/`, repository in `src/repositories/`, run `pnpm db:generate`

---

## packages/tmdb-client (`@repo/tmdb-client`)

**Purpose**: Typed TMDb API wrapper (not yet implemented)

**Status**: Empty shell, ready for implementation

---

## packages/config-typescript (`@repo/config-typescript`)

**Purpose**: Shared TypeScript configuration presets

**Exports**:
- `base.json` — Strict mode, ESNext, bundler resolution
- `nextjs.json` — Extends base, JSX, Next.js plugin
- `node.json` — Extends base, Node types
- `library.json` — Extends base, declaration emit

---

## packages/config-eslint (`@repo/config-eslint`)

**Purpose**: Shared ESLint flat configurations

**Exports**:
- `./base` — TypeScript + recommended rules
- `./nextjs` — Base + browser globals
- `./node` — Base + Node globals
- `./boundaries` — eslint-plugin-boundaries rules for import enforcement
