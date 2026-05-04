# Implementation Plan: UF1 — Configurable Movie Seeding

## 1. Feature Description

**Objective**: Replace the hardcoded 10-page popular-only seed script with a config-driven multi-source seeding mechanism that supports all TMDB list endpoints.

**Key Capabilities**:
- **CAN** seed from multiple TMDB sources: popular, top_rated, trending, now_playing, upcoming
- **CAN** configure pages per source and trending time window via `seed.config.json`
- **CAN** validate config before execution — invalid source types or malformed JSON → clear error
- **CAN** reject invalid pages (zero or negative) at config validation time
- **CAN** continue seeding remaining sources if one source fails
- **CAN** deduplicate movies across sources via upsert on `tmdbId`
- **CANNOT** schedule automatic seeding (manual `pnpm db:seed` only)

**Business Rules**:
- Config file validated with Zod before any TMDB calls
- Invalid source type → Zod error listing valid types
- Empty sources array → error, seed does not run
- Missing config file → error with clear message
- TMDB API failure on one source → log error, continue with next source
- Same movie from multiple sources → single upsert (existing `upsertFromTmdb` handles dedup)

---

## 2. Architecture

### Files to Modify

#### A. `packages/tmdb-client/src/endpoints/top-rated-movies.ts` 🟢 NEW
**Purpose**: Fetch top-rated movies from TMDB

**Changes**:
- `getTopRatedMovies(client: TmdbClient, page = 1): Promise<TmdbPaginatedResponse<TmdbMovie>>`
- Calls `client.get("/movie/top_rated", { page: String(page) })`

**Reference**: ⚪ `packages/tmdb-client/src/endpoints/popular-movies.ts` — identical pattern

---

#### B. `packages/tmdb-client/src/endpoints/trending-movies.ts` 🟢 NEW
**Purpose**: Fetch trending movies from TMDB

**Changes**:
- `getTrendingMovies(client: TmdbClient, timeWindow: "day" | "week", page = 1): Promise<TmdbPaginatedResponse<TmdbMovie>>`
- Calls `` client.get(`/trending/movie/${timeWindow}`, { page: String(page) }) `` — `timeWindow` interpolated into path via JS template literal, not query string (note: `TmdbClient.get` has no built-in path interpolation)

**Reference**: ⚪ `packages/tmdb-client/src/endpoints/popular-movies.ts`

---

#### C. `packages/tmdb-client/src/endpoints/now-playing-movies.ts` 🟢 NEW
**Purpose**: Fetch now-playing movies from TMDB

**Changes**:
- `getNowPlayingMovies(client: TmdbClient, page = 1): Promise<TmdbPaginatedResponse<TmdbMovie>>`
- Calls `client.get("/movie/now_playing", { page: String(page) })`

**Reference**: ⚪ `packages/tmdb-client/src/endpoints/popular-movies.ts`

---

#### D. `packages/tmdb-client/src/endpoints/upcoming-movies.ts` 🟢 NEW
**Purpose**: Fetch upcoming movies from TMDB

**Changes**:
- `getUpcomingMovies(client: TmdbClient, page = 1): Promise<TmdbPaginatedResponse<TmdbMovie>>`
- Calls `client.get("/movie/upcoming", { page: String(page) })`

**Reference**: ⚪ `packages/tmdb-client/src/endpoints/popular-movies.ts`

---

#### E. `packages/tmdb-client/src/mappers.ts` 🟢 NEW
**Purpose**: Transform `TmdbMovieDetails` to a DB-ready plain object

**Changes**:
- Define `TmdbMovieMapped` interface locally — deliberately duplicates the `NewMovie` shape from `@repo/db` without importing it to avoid a circular dependency (`@repo/db` → `@repo/tmdb-client` already exists). TypeScript structural typing ensures that if the two types drift apart, the call site `repo.upsertFromTmdb(mapTmdbToNewMovie(details))` in `seed.ts` will fail to compile, catching any mismatch:
  ```ts
  export interface TmdbMovieMapped {
    tmdbId: number;
    title: string;
    year: number | null;
    synopsis: string | null;
    genres: string[];
    cast: string[];
    directors: string[];
    runtime: number | null;
    language: string;
    posterUrl: string | null;
    backdropUrl: string | null;
    popularity: number;
    releaseDate: string | null;
  }
  ```
- `mapTmdbToNewMovie(details: TmdbMovieDetails): TmdbMovieMapped` — same logic currently in `packages/db/src/seed.ts:14-45`:
  - Extract year from `release_date`
  - Filter directors from `credits.crew` (job === "Director")
  - Sort and limit cast to top 10
  - Map genre objects to names

**Why**: Needed by both `seed.ts` (Phase 1) and `search_tmdb` tool (Phase 2). Lives in tmdb-client alongside the types it transforms.

---

#### F. `packages/tmdb-client/src/endpoints/index.ts` ⚪ MODIFY
**Changes**: Add 4 new exports:
- `export { getTopRatedMovies } from "./top-rated-movies.js";`
- `export { getTrendingMovies } from "./trending-movies.js";`
- `export { getNowPlayingMovies } from "./now-playing-movies.js";`
- `export { getUpcomingMovies } from "./upcoming-movies.js";`

---

#### G. `packages/tmdb-client/src/index.ts` ⚪ MODIFY
**Changes**:
- Export 4 new endpoint functions from `./endpoints/index.js`
- Export `mapTmdbToNewMovie` and type `TmdbMovieMapped` from `./mappers.js`

---

#### H. `packages/db/package.json` ⚪ MODIFY
**Purpose**: Add Zod dependency for seed config validation

**Changes**:
- Add `"zod": "^4.3.6"` to `devDependencies` (Zod is only used by the seed script, not exported via the package's public API)

---

#### I. `packages/db/src/seed-config.ts` 🟢 NEW
**Purpose**: Zod schema + loader for `seed.config.json`

**Changes**:
- `seedSourceSchema`: Zod discriminated union on `type`:
  - `popular | top_rated | now_playing | upcoming` → `{ type, pages: z.number().int().positive() }`
  - `trending` → adds `timeWindow: z.enum(["day", "week"]).default("week")`
- `seedConfigSchema`: `z.object({ sources: z.array(seedSourceSchema).min(1) })`
- `SeedConfig` / `SeedSource` types exported (inferred from schemas)
- `loadSeedConfig(path?: string): SeedConfig`:
  - Defaults to `seed.config.json` relative to package root
  - Reads file with `fs.readFileSync`
  - Parses JSON
  - Validates with `seedConfigSchema.parse()`
  - On missing file → throw `"Seed config not found at {path}"`
  - On invalid JSON → throw `"Seed config is not valid JSON"`
  - On Zod error → rethrow with formatted issues

---

#### J. `packages/db/seed.config.json` 🟢 NEW
**Purpose**: Default seed configuration

**Content**:
```json
{
  "sources": [
    { "type": "popular", "pages": 10 },
    { "type": "top_rated", "pages": 5 },
    { "type": "trending", "timeWindow": "week", "pages": 3 },
    { "type": "now_playing", "pages": 2 },
    { "type": "upcoming", "pages": 2 }
  ]
}
```

---

#### K. `packages/db/src/seed.ts` ⚪ MODIFY
**Purpose**: Refactor to config-based multi-source seeding

**Changes**:
- Remove `mapTmdbToNewMovie()` definition (lines 14-45) — import from `@repo/tmdb-client`
- Import `loadSeedConfig` from `./seed-config.js`
- Import 4 new endpoints from `@repo/tmdb-client`
- Add `fetchSourcePage(tmdb, source, page)` dispatcher:
  - `popular` → `getPopularMovies(tmdb, page)`
  - `top_rated` → `getTopRatedMovies(tmdb, page)`
  - `trending` → `getTrendingMovies(tmdb, source.timeWindow, page)`
  - `now_playing` → `getNowPlayingMovies(tmdb, page)`
  - `upcoming` → `getUpcomingMovies(tmdb, page)`
- Refactor `main()`:
  1. Call `loadSeedConfig()` — exits on validation error (schema guarantees all pages >= 1)
  2. For each source: iterate pages, fetch list, get details, map via `mapTmdbToNewMovie`, upsert
  3. Per-source try/catch — log error, continue with next source
  4. Log per-source: `"[popular] Page 3/10 — 20 movies upserted"`
  5. Log total at end
- Keep `processInBatches` and `CONCURRENCY = 5` unchanged
- Keep `isMain` guard unchanged

**Why**: Replaces hardcoded single-source seed with configurable multi-source

---

## 3. Test List

### Test File: `packages/tmdb-client/src/endpoints/top-rated-movies.test.ts`

1. **`calls /movie/top_rated with page parameter`**
   - Mock `client.get` → verify called with `("/movie/top_rated", { page: "2" })`
   - Verify returns mock `TmdbPaginatedResponse<TmdbMovie>`

2. **`defaults to page 1`**
   - Call without page arg → verify called with `{ page: "1" }`

### Test File: `packages/tmdb-client/src/endpoints/trending-movies.test.ts`

3. **`calls /trending/movie/{timeWindow} with page parameter`**
   - Mock `client.get` → verify called with `("/trending/movie/week", { page: "1" })`

4. **`supports day time window`**
   - Call with `"day"` → verify path is `"/trending/movie/day"`

5. **`defaults to page 1`**
   - Call without page arg → verify called with `{ page: "1" }`

### Test File: `packages/tmdb-client/src/endpoints/now-playing-movies.test.ts`

6. **`calls /movie/now_playing with page parameter`**
   - Mock `client.get` → verify called with `("/movie/now_playing", { page: "3" })`

7. **`defaults to page 1`**
   - Call without page arg → verify `{ page: "1" }`

### Test File: `packages/tmdb-client/src/endpoints/upcoming-movies.test.ts`

8. **`calls /movie/upcoming with page parameter`**
   - Mock `client.get` → verify called with `("/movie/upcoming", { page: "1" })`

9. **`defaults to page 1`**
   - Call without page arg → verify `{ page: "1" }`

### Test File: `packages/tmdb-client/src/mappers.test.ts`

10. **`maps TMDb details to TmdbMovieMapped shape`**
    - Full `TmdbMovieDetails` input → verify all fields mapped correctly (tmdbId, title, year, genres as names, cast sorted/sliced, directors filtered)

11. **`handles missing release_date`**
    - Empty `release_date` → `year: null`, `releaseDate: null`

12. **`limits cast to top 10 by order`**
    - 20 cast members → output has exactly 10, ordered by `order` field

13. **`filters only directors from crew`**
    - Crew with Director + Screenplay → only Director names in `directors`

14. **`handles missing credits gracefully`**
    - No `credits` field → `cast: []`, `directors: []`

### Test File: `packages/db/src/seed-config.test.ts`

15. **`validates valid config with all source types`**
    - Config with popular, top_rated, trending, now_playing, upcoming → parses without error

16. **`rejects invalid source type`**
    - `{ type: "foobar", pages: 1 }` → Zod error mentioning valid types

17. **`rejects negative pages`**
    - `{ type: "popular", pages: -1 }` → Zod error

18. **`rejects zero pages`**
    - `{ type: "popular", pages: 0 }` → Zod error (positive integer required)

19. **`defaults timeWindow to "week" for trending`**
    - `{ type: "trending", pages: 1 }` (no timeWindow) → parsed with `timeWindow: "week"`

20. **`rejects empty sources array`**
    - `{ sources: [] }` → Zod error (min 1)

21. **`loadSeedConfig throws on missing file`**
    - Non-existent path → error message containing "not found"

22. **`loadSeedConfig throws on invalid JSON`**
    - File with `{broken` → error message containing "not valid JSON"

### Test File: `packages/db/src/seed.test.ts`

_Existing mapper tests (tests 1-5 in current file) move to `packages/tmdb-client/src/mappers.test.ts`. Remaining seed tests focus on the orchestration logic._

23. **`processes all configured sources`**
    - Config with 3 sources → verify each source's TMDB endpoint called with correct page counts

24. **`continues on source failure`**
    - First source's TMDB call throws → second source still processes → its movies upserted

25. **`calls fetchSourcePage with correct dispatcher for each type`**
    - Config with one of each type → verify `getPopularMovies`, `getTopRatedMovies`, `getTrendingMovies`, `getNowPlayingMovies`, `getUpcomingMovies` each called once

---

## 4. To Do List

- [ ] **Add 4 TMDB list endpoints**
  - Create `packages/tmdb-client/src/endpoints/top-rated-movies.ts`
  - Create `packages/tmdb-client/src/endpoints/trending-movies.ts`
  - Create `packages/tmdb-client/src/endpoints/now-playing-movies.ts`
  - Create `packages/tmdb-client/src/endpoints/upcoming-movies.ts`
  - Modify `packages/tmdb-client/src/endpoints/index.ts` — add 4 exports

- [ ] **Extract mapper to tmdb-client**
  - Create `packages/tmdb-client/src/mappers.ts` — `TmdbMovieMapped` interface + `mapTmdbToNewMovie()`
  - Modify `packages/tmdb-client/src/index.ts` — export new endpoints, mapper, and `TmdbMovieMapped` type

- [ ] **Write tmdb-client tests**
  - Create `packages/tmdb-client/src/endpoints/top-rated-movies.test.ts` — tests 1-2
  - Create `packages/tmdb-client/src/endpoints/trending-movies.test.ts` — tests 3-5
  - Create `packages/tmdb-client/src/endpoints/now-playing-movies.test.ts` — tests 6-7
  - Create `packages/tmdb-client/src/endpoints/upcoming-movies.test.ts` — tests 8-9
  - Create `packages/tmdb-client/src/mappers.test.ts` — tests 10-14 (moved from `packages/db/src/seed.test.ts`)

- [ ] **Create seed config**
  - Add `zod` devDependency to `packages/db/package.json`
  - Create `packages/db/src/seed-config.ts` — Zod schema + `loadSeedConfig()`
  - Create `packages/db/seed.config.json` — default config

- [ ] **Write seed config tests**
  - Create `packages/db/src/seed-config.test.ts` — tests 15-22

- [ ] **Refactor seed script**
  - Modify `packages/db/src/seed.ts`:
    - Remove `mapTmdbToNewMovie` definition, import from `@repo/tmdb-client`
    - Import `loadSeedConfig` + new endpoints
    - Add `fetchSourcePage()` dispatcher
    - Refactor `main()` to iterate config sources
    - Per-source error handling (continue on failure)
  - Update `packages/db/src/seed.test.ts` — remove mapper tests (now in tmdb-client), add tests 23-25

- [ ] **Verify**
  - `pnpm typecheck` passes
  - `pnpm test --filter @repo/tmdb-client` passes
  - `pnpm test --filter @repo/db` passes
  - Manual: `pnpm db:seed` with default config → movies from all 5 sources upserted

---

## 5. Context: Current System Architecture

### TMDB Client (`packages/tmdb-client/`)
- 3 endpoints: `getPopularMovies`, `searchMovies`, `getMovieDetails`
- Each endpoint is a standalone function: `(client: TmdbClient, ...params) → Promise<T>`
- `TmdbClient.get<T>(path, params)` does Bearer token auth against `api.themoviedb.org/3`
- Types: `TmdbMovie` (list item), `TmdbMovieDetails` (full details with credits), `TmdbPaginatedResponse<T>`
- Limitation: only `popular` list endpoint — no top_rated, trending, now_playing, upcoming

### Seed Script (`packages/db/src/seed.ts`)
- Hardcoded: `TOTAL_PAGES = 10`, `CONCURRENCY = 5`, popular movies only
- Contains `mapTmdbToNewMovie(details: TmdbMovieDetails): NewMovie` inline (lines 14-45)
- Uses `processInBatches()` helper for concurrent detail fetches + upserts
- `isMain` guard at bottom so it can also be imported for testing
- Limitation: single source, no config file, mapper not reusable

### Movies Repository (`packages/db/src/repositories/movies.ts`)
- `upsertFromTmdb(movie: NewMovie)` — insert with `onConflictDoUpdate` on `tmdbId`
- Updates all fields except timestamps on conflict — dedup is built in
- No changes needed for UF1

### Movies Schema (`packages/db/src/schema/movies.ts`)
- UUID primary key, unique index on `tmdbId`
- Array columns: `genres`, `cast`, `directors` (text[])
- `NewMovie` type inferred from schema insert type
- No schema changes needed for UF1

### Key Files

| File | Purpose |
|------|---------|
| `packages/tmdb-client/src/endpoints/popular-movies.ts` | ⚪ Pattern for 4 new endpoints |
| `packages/tmdb-client/src/endpoints/popular-movies.test.ts` | ⚪ Test pattern for endpoint tests |
| `packages/tmdb-client/src/types.ts` | `TmdbMovie`, `TmdbPaginatedResponse`, `TmdbMovieDetails` |
| `packages/tmdb-client/src/index.ts` | Public exports — add new endpoints + mapper |
| `packages/db/src/seed.ts` | Current seed script — refactor target |
| `packages/db/src/seed.test.ts` | Current mapper tests — move to tmdb-client |
| `packages/db/src/repositories/movies.ts` | `upsertFromTmdb` — no changes, reused as-is |
| `packages/db/src/schema/movies.ts` | `NewMovie` type — shape reference for `TmdbMovieMapped` |
| `packages/db/package.json` | Add zod devDependency |

---

## 6. Reference Implementations

| Pattern | File | Reuse |
|---------|------|-------|
| TMDB list endpoint (function signature, `client.get<T>()` call, types) | `packages/tmdb-client/src/endpoints/popular-movies.ts` | ⚪ Clone for top-rated, now-playing, upcoming. Trending adds path interpolation. |
| Endpoint unit test (mock `client.get`, assert path + params) | `packages/tmdb-client/src/endpoints/popular-movies.test.ts` | ⚪ Clone for all 4 new endpoint test files |
| TMDB movie mapper (`mapTmdbToNewMovie`) | `packages/db/src/seed.ts:14-45` | ⚪ Move to `packages/tmdb-client/src/mappers.ts` — same logic, new return type `TmdbMovieMapped` |
| Mapper tests (sample `TmdbMovieDetails`, edge cases) | `packages/db/src/seed.test.ts` | ⚪ Move to `packages/tmdb-client/src/mappers.test.ts` — update import path |
| Batch processing helper (`processInBatches`) | `packages/db/src/seed.ts:47-56` | ⚪ Keep in seed.ts — unchanged |
| Seed main loop (page iteration, detail fetch, upsert) | `packages/db/src/seed.ts:58-97` | ⚪ Refactor to iterate config sources via dispatcher |

---

## Notes

- **No schema migrations**: The `movies` table already has all required columns. No `pnpm db:generate` needed.
- **Zod 4 in packages/db**: Adding `zod@^4.3.6` as a `devDependency` matches the version used in `apps/api` and `packages/contracts`. Zod is only used by the seed script (not part of the package's public API). The discriminated union API (`z.discriminatedUnion`) is available in Zod 4.
- **Mapper test migration**: The 5 existing tests in `packages/db/src/seed.test.ts` test `mapTmdbToNewMovie`. After moving the mapper to `@repo/tmdb-client`, these tests move too. `seed.test.ts` is then replaced with orchestration-focused tests (sources iteration, error handling).
- **`pnpm install` needed**: After adding `zod` to `packages/db/package.json` devDependencies, run `pnpm install` before running tests.

## Unresolved Questions

None — all decisions resolved during planning.
