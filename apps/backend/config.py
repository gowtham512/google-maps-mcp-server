from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    ollama_api_key: str = ""
    ollama_model: str = "nemotron-3-super"
    ollama_base_url: str = "https://ollama.com"

    maps_api_key: str = ""
    maps_api_base_url_places: str = "https://places.googleapis.com/v1"
    maps_api_base_url_routes: str = "https://routes.googleapis.com/directions/v2"
    maps_api_base_url_geocoding: str = "https://maps.googleapis.com/maps/api/geocode/json"

    database_url: str = "postgresql+asyncpg://user:password@host.neon.tech/dbname?sslmode=require"

    # A long random secret used to sign JWTs.  Change this in production.
    jwt_secret: str = "CHANGE_ME_use_a_long_random_secret_in_production"

    port: int = 8000


settings = Settings()