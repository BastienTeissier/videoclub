# Videoclub

Movie watchlist and reviews application.

## Prerequisites

- [Node.js 24](https://nodejs.org/) (see `.nvmrc`)
- [pnpm 10](https://pnpm.io/)
- [Docker](https://www.docker.com/) (for local PostgreSQL)
- A [TMDb API key](https://www.themoviedb.org/settings/api) (for seeding movie data)
- An [OpenRouter API key](https://openrouter.ai/) **or** a local [Ollama](https://ollama.com/) instance (for the AI agent)

## Installation

```bash
# Clone the repo
git clone <repo-url> && cd videoclub

# Install dependencies
pnpm install

# Set up environment files
cp infra/docker/.env.example infra/docker/.env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

## Getting started

```bash
# 1. Start PostgreSQL
pnpm db:up

# 2. Apply database migrations
pnpm db:migrate

# 3. (Optional) Seed the database with ~200 popular movies from TMDb
TMDB_API_KEY=your_key_here pnpm db:seed

# 4. Set your AI provider key in apps/api/.env
#    For OpenRouter (default):
#      OPENROUTER_API_KEY=your_key_here
#    For local Ollama:
#      USE_LOCAL_MODEL=true

# 5. Start all apps in dev mode
pnpm dev
```

The frontend runs on [http://localhost:3000](http://localhost:3000) and the API on [http://localhost:3001](http://localhost:3001).

## Project structure

```
.
├─ apps/
│  ├─ web/                # Next.js frontend (port 3000)
│  └─ api/                # Hono backend (port 3001)
├─ packages/
│  ├─ ui/                 # Internal design system (shadcn/ui)
│  ├─ contracts/          # Shared Zod schemas and DTOs
│  ├─ db/                 # Drizzle schema, migrations, DB client
│  ├─ tmdb-client/        # Typed TMDb API wrapper
│  ├─ config-typescript/  # Shared tsconfig presets
│  └─ config-eslint/      # Shared ESLint flat configs
├─ infra/docker/          # Docker Compose for local PostgreSQL
├─ docs/                  # Architecture and design docs
└─ plans/                 # Implementation plans
```

## Scripts

All scripts run from the repo root with `pnpm`.

### Development

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all apps in dev mode (Turbo) |
| `pnpm --filter @repo/web dev` | Start frontend only (port 3000) |
| `pnpm --filter @repo/api dev` | Start backend only (port 3001) |

### Quality checks

| Command | Description |
|---------|-------------|
| `pnpm typecheck` | TypeScript checks across all workspaces |
| `pnpm lint` | ESLint across all workspaces |
| `pnpm test` | Run all tests (unit + integration) |
| `pnpm depcruise` | Check import boundary rules |
| `pnpm build` | Build all packages and apps |

### Database

| Command | Description |
|---------|-------------|
| `pnpm db:up` | Start local PostgreSQL via Docker Compose |
| `pnpm db:down` | Stop local PostgreSQL |
| `pnpm db:migrate` | Apply migrations to local DB |
| `pnpm db:generate` | Generate a new Drizzle migration |
| `pnpm db:push` | Push schema to DB (no migration file) |
| `pnpm db:studio` | Open Drizzle Studio |
| `pnpm db:seed` | Seed DB with popular movies from TMDb (requires `TMDB_API_KEY`) |

## AI agent

The search bar is powered by an AI agent that interprets natural language queries (e.g. "movies from Spielberg", "sci-fi from the 80s") and searches the local database using structured filters.

- **Provider**: OpenRouter (cloud, default) or Ollama (local) -- configured via env vars in `apps/api/.env`
- **Endpoint**: `POST /api/v1/chat` accepts `{ message, sessionId? }` and returns agent text + tool results
- **Tool**: `search_movies` extracts title, director, actor, genre, year from the query and runs a structured DB search
- **Persistence**: sessions, messages, runs, and tool calls are stored in PostgreSQL

### AI environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENROUTER_API_KEY` | _(required for cloud)_ | OpenRouter API key |
| `OPENROUTER_MODEL` | `google/gemini-2.5-flash-preview` | Model to use via OpenRouter |
| `USE_LOCAL_MODEL` | `false` | Set to `true` to use Ollama instead |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `LOCAL_MODEL_NAME` | `llama3` | Ollama model name |

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js, Tailwind CSS, shadcn/ui |
| Backend | Hono, Node.js |
| AI | Vercel AI SDK, OpenRouter / Ollama |
| Database | PostgreSQL, Drizzle ORM |
| Testing | Vitest, React Testing Library, Testcontainers |
| Monorepo | pnpm workspaces, Turborepo |

## Documentation

- [Architecture](docs/architecture.md) -- System architecture, runtime model, and principles
- [Design system](docs/design.md) -- Design tokens, color palette, and component guidelines
- [Conventions](docs/conventions.md) -- Coding patterns, file layout, and how to add features
- [Packages](docs/packages.md) -- Per-package reference, public API, and usage examples
