# Coding Conventions

## File and directory naming

- **Files**: `kebab-case.ts` / `kebab-case.tsx`
- **Directories**: `kebab-case/`
- **Test files**: colocated as `<name>.test.ts` / `<name>.test.tsx`
- **Barrel exports**: `index.ts` per directory

## TypeScript

- Strict mode everywhere (enforced by shared tsconfig presets)
- Use `type` imports for type-only imports: `import type { Foo } from "..."`
- Prefer interfaces for object shapes, type aliases for unions/intersections
- No `any` — use `unknown` and narrow

## Module system

- All packages use ESM (`"type": "module"`)
- Use `.js` extensions in relative imports (TypeScript resolves `.ts` → `.js`)
- Package exports use the `exports` field in `package.json`

## Backend (apps/api)

### Layering

```
routes → services → repositories → @repo/db
```

- **Routes** (`src/features/<name>/route.ts`): Hono route handlers, request validation, response shaping
- **Services** (`src/services/<name>.ts`): business logic, orchestration
- **Repositories**: accessed via `@repo/db` repository factories
- Routes must not import Drizzle schema/client directly

### Adding a new feature

1. Create `src/features/<name>/route.ts` with a `Hono` instance
2. Create `src/services/<name>.ts` if business logic is needed
3. Register the route in `src/app.ts` under the `api` router
4. Add request/response schemas to `@repo/contracts`

### Error handling

- Use Hono's built-in error responses for HTTP errors
- The global error handler catches unhandled exceptions and returns 500

### Logging

- Structured JSON logging via the request logger middleware
- Each request gets a UUID via the `x-request-id` header

## Frontend (apps/web)

### Component organization

- **Page components**: `src/app/<route>/page.tsx` (Server Components by default)
- **Feature components**: `src/components/<name>.tsx`
- **Hooks**: `src/hooks/<name>.ts`
- **API functions**: `src/lib/api/<name>.ts`

### Server vs Client Components

- Default to Server Components
- Add `"use client"` only for interactivity, browser APIs, or local state
- Keep client components focused — extract server logic out

### Styling

- Tailwind CSS with design system tokens from `globals.css`
- Use `@repo/ui` components for shared primitives
- Follow the design system color palette (zinc-based dark theme)

## Database (packages/db)

### Adding a new table

1. Create `src/schema/<name>.ts` with Drizzle table definition
2. Export from `src/schema/index.ts`
3. Run `pnpm db:generate` to create migration
4. Run `pnpm db:migrate` to apply to local DB
5. Create `src/repositories/<name>.ts` with a repository factory
6. Export from `src/repositories/index.ts`

### Schema conventions

- UUID primary keys with `defaultRandom()`
- `created_at` and `updated_at` timestamps with timezone
- Snake_case column names in SQL, camelCase in TypeScript

## Contracts (packages/contracts)

### Adding a new schema

1. Domain DTOs in `src/domain/<name>.ts`
2. HTTP request/response schemas in `src/http/<name>.ts`
3. Export from barrel files
4. Use Zod for all schemas

## UI (packages/ui)

### Adding a new component

1. Create `src/components/<name>.tsx` following shadcn/ui patterns
2. Use `cn()` utility for class merging
3. Use `React.forwardRef` for all components
4. Export from `src/index.ts`

## Testing

- **Unit/integration**: Vitest everywhere
- **Frontend**: React Testing Library + jsdom
- **Backend**: Hono's `app.request()` test helper
- **Database**: Testcontainers with PostgreSQL
- Test files colocated with source

## Import boundaries

Enforced by eslint-plugin-boundaries and dependency-cruiser:

- `apps/web` → `@repo/ui`, `@repo/contracts` only
- `apps/api` → `@repo/contracts`, `@repo/db`, `@repo/tmdb-client` only
- `packages/contracts` → no internal package imports
- `packages/ui` → no backend/db imports
