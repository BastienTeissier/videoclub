# Tech Improvement: Zod Environment Variable Validation

## Problem

All env vars accessed via raw `process.env.*` with inline defaults scattered across files. No startup validation — misconfigurations surface as runtime errors.

## Decision Summary

- **Schema location**: per-app `src/env.ts` (no shared package)
- **Validation timing**: eager at module load (fail-fast)
- **Web approach**: plain Zod (no @t3-oss/env-nextjs — only 1 var)
- **Conditional AI vars**: Zod discriminated union on `USE_LOCAL_MODEL`

## Scope

| App/Package | Env file | Vars |
|---|---|---|
| `apps/api` | `src/env.ts` | `PORT`, `DATABASE_URL`, `USE_LOCAL_MODEL`, `OLLAMA_BASE_URL`, `LOCAL_MODEL_NAME`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` |
| `apps/web` | `src/env.ts` | `NEXT_PUBLIC_API_URL` |
| `packages/db` | `src/env.ts` | `TMDB_API_KEY`, `DATABASE_URL` (seed script only) |

**Out of scope**: `infra/docker/.env` vars (handled by Docker Compose, not Node).

## Implementation

### Step 1 — `apps/api/src/env.ts`

Create schema with two sections: base vars + AI provider discriminated union.

```ts
import { z } from "zod";

const booleanString = z.enum(["true", "false"]).default("false");

const localModelEnv = z.object({
  USE_LOCAL_MODEL: z.literal("true"),
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434/api"),
  LOCAL_MODEL_NAME: z.string().default("llama3"),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().optional(),
});

const cloudModelEnv = z.object({
  USE_LOCAL_MODEL: z.literal("false").default("false"),
  OPENROUTER_API_KEY: z.string().min(1, "OPENROUTER_API_KEY is required when USE_LOCAL_MODEL is not 'true'"),
  OPENROUTER_MODEL: z.string().default("google/gemini-2.5-flash-preview"),
  OLLAMA_BASE_URL: z.string().optional(),
  LOCAL_MODEL_NAME: z.string().optional(),
});

const aiEnvSchema = z.discriminatedUnion("USE_LOCAL_MODEL", [
  localModelEnv,
  cloudModelEnv,
]);

const baseEnvSchema = z.object({
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().default("postgresql://videoclub:videoclub@localhost:5432/videoclub"),
});

export const env = {
  ...baseEnvSchema.parse(process.env),
  ...aiEnvSchema.parse({
    USE_LOCAL_MODEL: process.env.USE_LOCAL_MODEL ?? "false",
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
    LOCAL_MODEL_NAME: process.env.LOCAL_MODEL_NAME,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
  }),
};
```

> **Note**: discriminated union needs explicit field pass-through since `process.env` is `Record<string, string | undefined>` and Zod v4 strips unknown keys. Pass only the relevant fields.

### Step 2 — Update `apps/api` consumers

Replace all `process.env.*` with `env.*` imports:

- `src/server.ts` — `env.PORT` instead of `Number(process.env.PORT ?? 3001)`
- `src/lib/db.ts` — `env.DATABASE_URL` instead of `process.env.DATABASE_URL ?? "postgresql://..."`
- `src/lib/ai-provider.ts` — `env.USE_LOCAL_MODEL`, `env.OLLAMA_BASE_URL`, `env.OPENROUTER_API_KEY`, etc. Remove inline defaults and conditional checks that are now handled by the schema.

In `ai-provider.ts`, narrow the type using the discriminated union:

```ts
import { env } from "../env.js";

export function getModel() {
  if (env.USE_LOCAL_MODEL === "true") {
    const ollama = createOllama({ baseURL: env.OLLAMA_BASE_URL });
    return ollama(env.LOCAL_MODEL_NAME);
  }
  const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
  return openrouter(env.OPENROUTER_MODEL);
}
```

### Step 3 — `apps/web/src/env.ts`

```ts
import { z } from "zod";

const webEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:3001"),
});

export const env = webEnvSchema.parse(process.env);
```

Update `src/lib/api/client.ts` to use `env.NEXT_PUBLIC_API_URL`.

Add `zod` as a dependency to `apps/web/package.json` (currently not listed).

### Step 4 — `packages/db/src/env.ts`

Only used by `seed.ts` and `drizzle.config.ts`:

```ts
import { z } from "zod";

const dbEnvSchema = z.object({
  DATABASE_URL: z.string().default("postgresql://videoclub:videoclub@localhost:5432/videoclub"),
  TMDB_API_KEY: z.string().min(1).optional(),
});

export const env = dbEnvSchema.parse(process.env);
```

- `drizzle.config.ts` — use `env.DATABASE_URL` (removes `!` non-null assertion)
- `seed.ts` — use `env.TMDB_API_KEY`, remove manual presence check; add a guard `if (!env.TMDB_API_KEY)` that exits with a clear message (same behavior, cleaner)

### Step 5 — Tests

Add a test file per env module (`src/env.test.ts`) verifying:
- Valid env parses correctly
- Missing required var throws with descriptive message
- Defaults apply when var is absent
- Discriminated union: `USE_LOCAL_MODEL=true` doesn't require `OPENROUTER_API_KEY`, `USE_LOCAL_MODEL=false` does

Use `vi.stubEnv()` or direct schema `.parse()` / `.safeParse()` calls on test objects (no need to mutate `process.env`).

## Files Changed

| File | Action |
|---|---|
| `apps/api/src/env.ts` | Create |
| `apps/api/src/server.ts` | Replace `process.env.PORT` |
| `apps/api/src/lib/db.ts` | Replace `process.env.DATABASE_URL` |
| `apps/api/src/lib/ai-provider.ts` | Replace all `process.env.*`, remove inline defaults |
| `apps/web/src/env.ts` | Create |
| `apps/web/src/lib/api/client.ts` | Replace `process.env.NEXT_PUBLIC_API_URL` |
| `apps/web/package.json` | Add `zod` dependency |
| `packages/db/src/env.ts` | Create |
| `packages/db/src/seed.ts` | Replace `process.env.*` |
| `packages/db/drizzle.config.ts` | Replace `process.env.DATABASE_URL!` |
| `apps/api/src/env.test.ts` | Create |
| `apps/web/src/env.test.ts` | Create |
| `packages/db/src/env.test.ts` | Create |

---

# Tech Improvement: MSW for HTTP Mocking in Tests

## Problem

Tests mock HTTP at different abstraction levels using `vi.stubGlobal("fetch")` and `vi.mock()`. These approaches bypass real HTTP behavior (URL construction, headers, serialization). No network-level test interception exists.

## Decision Summary

- **Scope**: all HTTP-adjacent tests (tmdb-client, web component, endpoint tests)
- **Handler location**: shared `packages/config-testing/` package
- **Dependency**: `msw` as root devDependency

## Current State

| Test file | Current mock | MSW change |
|---|---|---|
| `packages/tmdb-client/src/client.test.ts` | `vi.stubGlobal("fetch")` | MSW handlers for `api.themoviedb.org/3/*` |
| `packages/tmdb-client/src/endpoints/*.test.ts` (7) | `vi.mock("../client.js")` | Real `TmdbClient` + MSW intercepts |
| `apps/web/src/components/movie-search.test.tsx` | `vi.mock("@/lib/api/chat")` | MSW handler for `POST localhost:3001/api/v1/chat` |
| `packages/db/src/seed.test.ts` | `vi.mock("@repo/tmdb-client")` | Real TMDB functions + MSW intercepts |

**Not changing**: `apps/api` route tests (use Hono `app.request()` — in-process, no real HTTP), DB testcontainer tests, `health/route.test.ts`.

## Implementation

### Step 1 — Install MSW + create `packages/config-testing/`

Add `msw@^2.x` to root `devDependencies`.

Create `packages/config-testing/`:

```
packages/config-testing/
├─ package.json          # @repo/config-testing
├─ tsconfig.json         # extends config-typescript/library.json
└─ src/
   ├─ index.ts
   └─ msw/
      ├─ server.ts       # setupServer + lifecycle helpers
      └─ handlers/
         ├─ tmdb.ts      # TMDB API handlers
         └─ api.ts       # Backend API handlers (for web tests)
```

Add `"packages/config-testing"` — already covered by `packages/*` glob in `pnpm-workspace.yaml`.

### Step 2 — MSW server helper

`packages/config-testing/src/msw/server.ts`:

```ts
import { setupServer } from "msw/node";
import type { RequestHandler } from "msw";

export function createMswServer(...handlers: RequestHandler[]) {
  const server = setupServer(...handlers);
  return {
    server,
    /** Call in beforeAll */
    listen: () => server.listen({ onUnhandledRequest: "error" }),
    /** Call in afterEach */
    resetHandlers: () => server.resetHandlers(),
    /** Call in afterAll */
    close: () => server.close(),
  };
}
```

### Step 3 — TMDB handlers

`packages/config-testing/src/msw/handlers/tmdb.ts`:

Factory functions returning MSW `http.get()` handlers for each TMDB endpoint. Accept response data as argument for per-test customization.

```ts
import { http, HttpResponse } from "msw";

const TMDB_BASE = "https://api.themoviedb.org/3";

export function tmdbPopularMovies(response: unknown) {
  return http.get(`${TMDB_BASE}/movie/popular`, () =>
    HttpResponse.json(response)
  );
}

export function tmdbMovieDetails(movieId: number, response: unknown) {
  return http.get(`${TMDB_BASE}/movie/${movieId}`, () =>
    HttpResponse.json(response)
  );
}

export function tmdbTopRatedMovies(response: unknown) {
  return http.get(`${TMDB_BASE}/movie/top_rated`, () =>
    HttpResponse.json(response)
  );
}

export function tmdbTrendingMovies(timeWindow: "day" | "week", response: unknown) {
  return http.get(`${TMDB_BASE}/trending/movie/${timeWindow}`, () =>
    HttpResponse.json(response)
  );
}

// Similar for now_playing, upcoming, search

/** Error handler — returns non-ok response */
export function tmdbError(path: string, status: number, body: unknown) {
  return http.get(`${TMDB_BASE}${path}`, () =>
    HttpResponse.json(body, { status })
  );
}
```

### Step 4 — Backend API handlers (for web tests)

`packages/config-testing/src/msw/handlers/api.ts`:

```ts
import { http, HttpResponse } from "msw";

const API_BASE = "http://localhost:3001";

export function chatEndpoint(response: unknown) {
  return http.post(`${API_BASE}/api/v1/chat`, () =>
    HttpResponse.json(response)
  );
}
```

### Step 5 — Refactor `packages/tmdb-client/src/client.test.ts`

Remove `vi.stubGlobal("fetch")`. Use MSW to intercept real fetch calls.

```ts
import { createMswServer } from "@repo/config-testing/msw/server";
import { tmdbPopularMovies, tmdbError } from "@repo/config-testing/msw/handlers/tmdb";

const { listen, resetHandlers, close } = createMswServer();

beforeAll(() => listen());
afterEach(() => resetHandlers());
afterAll(() => close());

it("sends GET request with bearer auth header", async () => {
  // Use server.use() for per-test handler
  server.use(tmdbPopularMovies({ results: [] }));

  const client = new TmdbClient("test-api-key");
  const result = await client.get("/movie/popular", { page: "1" });
  expect(result).toEqual({ results: [] });
});

it("throws on non-ok response", async () => {
  server.use(tmdbError("/movie/popular", 401, { status_message: "Invalid API key" }));
  // ...
});
```

Header assertion approach: MSW doesn't natively expose request assertions. Use `server.events.on('request:match')` or verify behavior indirectly (e.g., a handler that checks `Authorization` header and returns 401 if missing).

### Step 6 — Refactor endpoint tests (7 files)

Replace `vi.mock("../client.js")` + `mockGet` with real `TmdbClient` + MSW.

Before:
```ts
vi.mock("../client.js", () => ({ TmdbClient: vi.fn() }));
const mockGet = vi.fn();
client = { get: mockGet } as unknown as TmdbClient;
mockGet.mockResolvedValueOnce(response);
```

After:
```ts
import { createMswServer } from "@repo/config-testing/msw/server";
import { tmdbPopularMovies } from "@repo/config-testing/msw/handlers/tmdb";

const { server, listen, resetHandlers, close } = createMswServer();
const client = new TmdbClient("test-key");

beforeAll(() => listen());
afterEach(() => resetHandlers());
afterAll(() => close());

it("calls /movie/popular with page parameter", async () => {
  const response = { page: 2, results: [], total_pages: 10, total_results: 200 };
  server.use(tmdbPopularMovies(response));
  const result = await getPopularMovies(client, 2);
  expect(result).toEqual(response);
});
```

Apply to: `popular-movies.test.ts`, `top-rated-movies.test.ts`, `trending-movies.test.ts`, `now-playing-movies.test.ts`, `upcoming-movies.test.ts`, `search-movies.test.ts`, `movie-details.test.ts`.

### Step 7 — Refactor `apps/web/src/components/movie-search.test.tsx`

Remove `vi.mock("@/lib/api/chat")`. Real `chatSearch` → `apiFetch` → `fetch` chain runs, MSW intercepts at network.

```ts
import { createMswServer } from "@repo/config-testing/msw/server";
import { chatEndpoint } from "@repo/config-testing/msw/handlers/api";

const { server, listen, resetHandlers, close } = createMswServer();

beforeAll(() => listen());
afterEach(() => resetHandlers());
afterAll(() => close());

it("calls chat endpoint on Enter submit", async () => {
  server.use(chatEndpoint({
    sessionId: "00000000-0000-0000-0000-000000000001",
    response: "Results found",
    toolResults: [],
  }));
  // render, fireEvent, waitFor as before — but real fetch is intercepted
});
```

Add `@repo/config-testing` to `apps/web` devDependencies.

### Step 8 — Refactor `packages/db/src/seed.test.ts`

Remove `vi.mock("@repo/tmdb-client")`. Use real TMDB functions + MSW.

Create a real `TmdbClient("test-key")` and let `getPopularMovies`, `getMovieDetails`, etc. make real HTTP calls intercepted by MSW. Requires setting up handlers for both list endpoints and detail endpoints per test.

### Step 9 — Vitest setup files (optional)

For packages that heavily use MSW, add a shared setup file via vitest config `setupFiles` to auto-run `listen()`/`resetHandlers()`/`close()`. Start without this; add if boilerplate becomes noisy.

## Files Changed

| File | Action |
|---|---|
| `package.json` (root) | Add `msw` to devDependencies |
| `packages/config-testing/` | Create package (package.json, tsconfig, src/) |
| `packages/config-testing/src/msw/server.ts` | Create server helper |
| `packages/config-testing/src/msw/handlers/tmdb.ts` | Create TMDB handlers |
| `packages/config-testing/src/msw/handlers/api.ts` | Create API handlers |
| `packages/tmdb-client/src/client.test.ts` | Replace `vi.stubGlobal("fetch")` with MSW |
| `packages/tmdb-client/src/endpoints/*.test.ts` (7) | Replace `vi.mock` + `mockGet` with real client + MSW |
| `packages/tmdb-client/package.json` | Add `@repo/config-testing` devDependency |
| `apps/web/src/components/movie-search.test.tsx` | Replace `vi.mock("@/lib/api/chat")` with MSW |
| `apps/web/package.json` | Add `@repo/config-testing` devDependency |
| `packages/db/src/seed.test.ts` | Replace `vi.mock("@repo/tmdb-client")` with MSW |
| `packages/db/package.json` | Add `@repo/config-testing` devDependency |
