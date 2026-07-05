from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    ollama_api_key: str = ""
    ollama_model: str = "qwen3"
    ollama_base_url: str = "https://ollama.com"

    maps_api_key: str = ""
    maps_api_base_url_places: str = "https://places.googleapis.com/v1"
    maps_api_base_url_routes: str = "https://routes.googleapis.com/directions/v2"
    maps_api_base_url_geocoding: str = "https://maps.googleapis.com/maps/api/geocode/json"

    port: int = 8000


settings = Settings()