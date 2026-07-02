# Google Maps Travel Planner MCP Server

Single-file MCP server for travel planning with live Google Maps APIs.

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

## Deploy

```bash
pip install -r requirements.txt
GOOGLE_MAPS_API_KEY=your_key python server.py
```

## Claude Desktop config

```json
{
  "mcpServers": {
    "travel-planner": {
      "command": "python",
      "args": [
        "C:\\Users\\Gowtham Reddy\\OneDrive\\Desktop\\google_maps_mcp\\server.py"
      ],
      "env": {
        "GOOGLE_MAPS_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

> Usage of Google Maps Platform products may incur costs. Restrict your API key at https://docs.cloud.google.com/api-keys/docs/add-restrictions-api-keys.

## Deploy to Lightsail

1. Point a domain/subdomain at your Lightsail instance.
2. Open ports **22, 80, 443** in the Lightsail firewall; keep **3000 closed**.
3. Copy this repo to the instance and run:

```bash
export GOOGLE_MAPS_API_KEY="your_key"
export DOMAIN="mcp.yourdomain.com"
chmod +x deploy.sh
./deploy.sh
```

4. Add to Claude Desktop `settings.json`:

```json
{
  "mcpServers": {
    "google-maps-travel-planner": {
      "url": "https://mcp.yourdomain.com/sse"
    }
  }
}
```
