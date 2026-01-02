"""Application configuration."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"), env_file_encoding="utf-8"
    )

    # Required
    anthropic_api_key: str

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    # Agent
    agent_interval: int = 10  # seconds between agent turns
    agent_workspace: str = "../agent_workspace"

    # Canvas
    canvas_width: int = 800
    canvas_height: int = 600


settings = Settings()  # type: ignore[call-arg]
