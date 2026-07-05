# Travel Planner Agent

A Python-based travel planning AI agent powered by **Ollama Cloud** LLMs and **Google Maps Platform REST APIs**.

## How it works

1. User sends a message via `POST /chat`.
2. The agent calls an Ollama Cloud model with a set of Google Maps tools.
3. The model decides which tools to call (search places, geocode, route, find nearby).
4. Tool results are fed back to the model in a loop until a final travel plan is produced.
5. Conversation history is stored in memory per `thread_id` (replaceable with a real DB later).

## Setup

1. Copy `.env.example` to `.env` and fill in your keys:
   ```bash
   OLLAMA_API_KEY=your_ollama_api_key
   OLLAMA_MODEL=qwen3
   MAPS_API_KEY=your_google_maps_api_key
   ```

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

### Chat
```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"thread_id":"trip-1","message":"Plan a 2-day trip to Paris with hotels and restaurants"}'
```

### Get thread history
```bash
curl http://localhost:8000/threads/trip-1
```

### Reset thread
```bash
curl -X POST http://localhost:8000/threads/trip-1/reset
```

## Tools exposed to the LLM

- `search_places` — search for places, businesses, addresses
- `geocode_address` — convert address to lat/lng and place ID
- `compute_route` — compute driving/walking route between addresses
- `find_nearby_places` — find places of a type near an address

## Notes

- Ollama Cloud does not support JSON Schema structured outputs, so the final reply is free-form text.
- Authentication with Google Maps APIs uses `X-Goog-Api-Key` headers for Places/Routes and `key=` query param for legacy Geocoding.
