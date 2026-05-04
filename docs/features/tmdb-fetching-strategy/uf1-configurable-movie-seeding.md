# UF1: Configurable Movie Seeding

**Notion ticket:** *(not created — `--db` and `--epic` not provided)*

## Context

The current seed script (`packages/db/src/seed.ts`) is hardcoded to fetch 10 pages of popular movies from TMDB. Developers need a flexible way to configure which TMDB sources to import and how many pages per source, without modifying the script itself.

## Specification

AAU (developer), when I run the seed script, it reads a config file that defines:
- Which TMDB list sources to import (e.g., popular, top_rated, trending, now_playing, upcoming)
- How many pages to fetch per source
- The script processes all configured sources, fetching full movie details (credits, runtime) for each movie and upserting them into the local DB

### Config file format

```json
{
  "sources": [
    { "type": "popular", "pages": 10 },
    { "type": "top_rated", "pages": 5 },
    { "type": "trending", "timeWindow": "week", "pages": 3 }
  ]
}
```

## Success Scenario

- AAU (developer), when I define 3 sources in the config file and run `pnpm db:seed`, I see logs for each source being processed and the total number of movies upserted
- AAU (developer), when I add a new source to the config and re-run the seed, only new movies are inserted and existing ones are updated (upsert by tmdbId)

## Error Scenario

- AAU (developer), if the config file is missing or malformed, I see a clear error message indicating what's wrong and the seed does not run
- AAU (developer), if a TMDB source type is invalid (e.g., "foobar"), I see a validation error listing the valid source types
- AAU (developer), if the TMDB API is down during seeding, I see an error for the failed batch but previously imported movies remain intact

## Edge Cases

- AAU (developer), if two sources return the same movie (e.g., a movie is both popular and top_rated), it is upserted once without duplication
- AAU (developer), if I set pages to 0 for a source, that source is skipped
- AAU (developer), if the config file has no sources defined, the seed script exits with a warning

## Acceptance Criteria

- [ ] A config file (e.g., `packages/db/seed.config.json`) defines TMDB sources and page counts
- [ ] The seed script reads and validates the config file before starting
- [ ] All configured TMDB sources are processed (popular, top_rated, trending, now_playing, upcoming)
- [ ] Full movie details (credits, runtime, genres) are fetched for each movie
- [ ] Movies are upserted by tmdbId — no duplicates across sources
- [ ] Clear error messages for invalid config, missing file, or API failures
- [ ] Existing `pnpm db:seed` command works with the new config-based approach
