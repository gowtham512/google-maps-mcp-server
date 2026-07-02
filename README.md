# Google Maps Agent

Full-stack travel planning agent with Google Maps tools, SQLite thread history, cloud Ollama, and OpenUI dynamic rendering.

## Architecture

```
packages/
  maps-tools/    # Google Maps tool definitions + Zod schemas
  db/            # SQLite persistence with Prisma
apps/
  api/           # Express backend: /api/chat, /api/threads, /api/tools, /health
  web/           # Next.js chat UI with OpenUI renderer
```

## Tools

- `geocode_address` — address → lat/lng
- `reverse_geocode` — lat/lng → address
- `validate_address` — standardize/verify an address
- `get_timezone` — time zone for a location
- `search_places` — find places near a location
- `get_place_details` — details for a specific place
- `get_route` — directions and ETA between two places
- `get_distance_matrix` — distances/durations across many origins/destinations
- `get_map_image` — URL for a static map image
- `suggest_itinerary` — build a simple day-by-day plan

## OpenUI dynamic rendering

The assistant can respond with plain markdown or with OpenUI Lang markup. When the model returns markup wrapped in `<Stack>`, the frontend renders it as an interactive UI using the OpenUI renderer. UI components can call backend tools at runtime via the renderer's `toolProvider`, so dashboards and itineraries stay live without re-querying the LLM.

## Deploy to Lightsail with Docker

1. Open ports **22, 3000, 3001** in the Lightsail firewall.
2. SSH into the instance and clone the repo.
3. Export your keys and run the deploy script:

```bash
export GOOGLE_MAPS_API_KEY="your_key"
export OLLAMA_BASE_URL="https://api.ollama.com/v1"
export OLLAMA_API_KEY="your_ollama_key"
export OLLAMA_MODEL="llama3.2:latest"
chmod +x deploy.sh
./deploy.sh
```

4. After deploy, the script prints:
   - API health: `http://YOUR_IP:3000/health`
   - Web UI: `http://YOUR_IP:3001`

5. For HTTPS without a domain, run a Cloudflare tunnel to the web port:

```bash
nohup sudo cloudflared tunnel --url http://127.0.0.1:3001 > /tmp/tunnel.log 2>&1 &
sleep 10
grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' /tmp/tunnel.log | head -1
```

Use the printed HTTPS URL to access the chat UI from anywhere.

## Local development

```bash
pnpm install
pnpm db:generate
pnpm db:push
pnpm dev
```

- API runs on `http://localhost:3000`
- Web runs on `http://localhost:3001`

Set your keys in `.env` (copy from `.env.example`).

## Environment variables

| Variable            | Description                             |
|---------------------|-----------------------------------------|
| `GOOGLE_MAPS_API_KEY` | Google Maps Platform API key          |
| `OLLAMA_BASE_URL`     | Cloud Ollama endpoint (OpenAI-compatible) |
| `OLLAMA_API_KEY`      | Ollama API key                        |
| `OLLAMA_MODEL`        | Model name, e.g. `llama3.2:latest`    |

> Google Maps Platform products may incur costs. Restrict your API key at https://docs.cloud.google.com/api-keys/docs/add-restrictions-api-keys.
