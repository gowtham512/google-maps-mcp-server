# Travel Planner Chat Agent

A Python-based travel planning AI agent powered by **Ollama Cloud** LLMs and **Google Maps Platform REST APIs**.

## How it works

1. Create a chat thread via `POST /threads`.
2. Send messages via `POST /threads/{thread_id}/chat`.
3. The agent calls an Ollama Cloud model with a set of Google Maps tools.
4. The model decides which tools to call (search places, geocode, route, find nearby).
5. Tool results are fed back to the model in a loop until a final travel plan is produced.
6. Only the **most recent 10 messages** are sent to the model on each turn.
7. All messages are persisted in **Neon Postgres** via `asyncpg`.

## Setup

1. Copy `.env.example` to `.env` and fill in your keys:
   ```bash
   OLLAMA_API_KEY=your_ollama_api_key
   OLLAMA_MODEL=qwen3
   MAPS_API_KEY=your_google_maps_api_key
   TAVILY_API_KEY=your_tavily_api_key
   DATABASE_URL=postgresql+asyncpg://user:password@<endpoint-id>.us-east-1.aws.neon.tech/dbname?sslmode=require
   ```

   Copy the **unpooled** connection string from the Neon Console and remove any `channel_binding` parameter.
   Get a free `TAVILY_API_KEY` at https://app.tavily.com (enables `web_search` / `extract_web_content`).

2. Enable these APIs in the Google Cloud Console for your project:
   - Places API (New)
   - Routes API
   - Geocoding API

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Run the server:
   ```bash
   python main.py
   ```

## API

### Health check
```bash
curl http://localhost:8000/health
```

### Create thread
```bash
curl -X POST http://localhost:8000/threads \
  -H "Content-Type: application/json" \
  -d '{"title":"Paris Trip"}'
```

### List threads
```bash
curl http://localhost:8000/threads
```

### Chat
```bash
curl -X POST http://localhost:8000/threads/{thread_id}/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Plan a 2-day trip to Paris with hotels and restaurants"}'
```

### Get thread history
```bash
curl http://localhost:8000/threads/{thread_id}
```

### Delete thread
```bash
curl -X DELETE http://localhost:8000/threads/{thread_id}
```

## Tools exposed to the LLM

- `search_places` — search for places, businesses, addresses
- `geocode_address` — convert address to lat/lng and place ID
- `compute_route` — compute driving/walking route between addresses
- `find_nearby_places` — find places of a type near an address
- `web_search` — Tavily live web search for real-time info (events, visas, seasons, news)
- `extract_web_content` — Tavily full-page content extraction for one or more URLs

## Notes

- Ollama Cloud does not support JSON Schema structured outputs, so the final reply is free-form text.
- Authentication with Google Maps APIs uses `X-Goog-Api-Key` headers for Places/Routes and `key=` query param for legacy Geocoding.
