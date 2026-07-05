# Travel Planner Chat

A monorepo containing a Python backend AI agent and a Next.js chat frontend.

## Structure

```
.
├── apps/
│   ├── backend/   # FastAPI + Ollama + Google Maps tools
│   └── web/       # Next.js + OpenUI + shadcn/ui chat UI
└── README.md
```

## Getting started

### Backend

See [apps/backend/README.md](apps/backend/README.md).

### Frontend

See [apps/web/README.md](apps/web/README.md).

## Tech stack

- **Backend**: Python, FastAPI, Ollama Cloud, SQLModel/SQLite, Google Maps Platform REST APIs
- **Frontend**: Next.js, TypeScript, Tailwind CSS, shadcn/ui, OpenUI (`@openuidev/react-lang`, `@openuidev/react-ui`)
