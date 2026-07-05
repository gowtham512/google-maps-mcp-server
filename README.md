# Travel Planner Chat

A monorepo containing a Python backend AI agent and a React chat frontend.

## Structure

```
.
├── apps/
│   ├── backend/   # FastAPI + Ollama + Google Maps tools
│   └── web/       # Vite React + OpenUI + shadcn/ui chat UI
├── docker-compose.yml   # Production orchestration
└── README.md
```

## Getting started

### Backend

See [apps/backend/README.md](apps/backend/README.md).

### Frontend

See [apps/web/README.md](apps/web/README.md).

## Deploy with Docker

1. Copy the environment template and fill in your keys:

   ```bash
   cp .env.example .env
   # Edit .env with MAPS_API_KEY, OLLAMA_API_KEY, etc.
   ```

2. Build and start both services:

   ```bash
   docker compose up --build -d
   ```

3. Verify:

   ```bash
   curl http://localhost/api/health
   ```

4. Open the app at `http://localhost`.

The SQLite database is persisted in a Docker volume, so it survives container restarts.

## Tech stack

- **Backend**: Python, FastAPI, Ollama Cloud, SQLModel/SQLite, Google Maps Platform REST APIs
- **Frontend**: Vite, React, TypeScript, Tailwind CSS, shadcn/ui, OpenUI (`@openuidev/react-lang`, `@openuidev/react-ui`)
