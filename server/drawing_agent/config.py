"""Application configuration."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(env_file=("../.env", ".env"), env_file_encoding="utf-8")

    # Required
    anthropic_api_key: str

    # Database
    database_url: str = "sqlite+aiosqlite:///./data/drawing_agent.db"
    database_echo: bool = False

    # Auth (required when auth is enabled)
    jwt_secret: str = ""  # Must be set in production
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_days: int = 7

    # Email (SES)
    ses_sender_email: str = "noreply@dmfenton.net"
    ses_region: str = "us-east-1"
    magic_link_expire_minutes: int = 15
    magic_link_base_url: str = "https://monet.dmfenton.net"

    # iOS Universal Links
    apple_team_id: str = ""  # Set via APPLE_TEAM_ID env var
    ios_bundle_id: str = "net.dmfenton.sketchpad"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    # Agent
    agent_interval: int = 10  # seconds between agent turns
    agent_workspace: str = "../agent_workspace"
    workspace_base_dir: str = "../agent_workspace/users"  # Per-user workspace directories
    max_agent_iterations: int = 5  # max iterations per turn
    agent_max_tokens: int = 8192  # max tokens for Claude response
    agent_model: str = "claude-sonnet-4-20250514"

    # Canvas
    canvas_width: int = 800
    canvas_height: int = 600

    # Drawing
    drawing_fps: int = 30  # frames per second for pen updates
    stroke_delay: float = 0.2  # pause between strokes in seconds
    path_steps_per_unit: float = 0.5  # interpolation density

    # Limits
    max_stdout_chars: int = 2000  # truncate stdout in messages
    max_stderr_chars: int = 500  # truncate stderr in messages


settings = Settings()  # type: ignore[call-arg]
