"""Application configuration."""

import logging
import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


@lru_cache
def _get_ssm_params() -> dict[str, str]:
    """Fetch all params from SSM for current environment.

    Returns empty dict if SSM is unavailable (e.g., missing credentials).
    """
    env = os.getenv("DRAWING_AGENT_ENV", "dev")
    region = os.getenv("AWS_REGION", "us-east-1")
    path = f"/drawing-agent/{env}/"

    try:
        import boto3

        ssm = boto3.client("ssm", region_name=region)
        resp = ssm.get_parameters_by_path(Path=path, WithDecryption=True)
        params = {
            p["Name"].split("/")[-1].replace("-", "_"): p["Value"] for p in resp["Parameters"]
        }
        logger.info(f"Loaded {len(params)} parameters from SSM ({path})")
        return params
    except Exception as e:
        logger.warning(f"Failed to load SSM parameters from {path}: {e}")
        return {}


def _ssm(key: str, default: str = "") -> str:
    """Get config value from SSM, with optional default.

    Treats "NONE" as empty string (SSM doesn't allow empty values).
    """
    value = _get_ssm_params().get(key, default)
    return "" if value == "NONE" else value


class Settings(BaseSettings):
    """Application settings loaded from SSM Parameter Store and environment variables.

    Priority: SSM > environment variables > defaults
    """

    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"), env_file_encoding="utf-8", extra="ignore"
    )

    # Required (from SSM or env)
    anthropic_api_key: str = _ssm("anthropic_api_key")

    # Database
    database_url: str = _ssm("database_url", "sqlite+aiosqlite:///./data/drawing_agent.db")
    database_echo: bool = False

    # Auth (required when auth is enabled)
    jwt_secret: str = _ssm("jwt_secret")  # Must be set in production
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_days: int = 90  # Long duration for mobile; access tokens still 30min

    # Email (SES)
    ses_sender_email: str = "noreply@dmfenton.net"
    ses_region: str = "us-east-1"
    ses_configuration_set: str = "drawing-agent-emails"
    magic_link_expire_minutes: int = 15
    magic_link_base_url: str = "https://monet.dmfenton.net"

    # iOS Universal Links
    apple_team_id: str = _ssm("apple_team_id")  # From SSM or APPLE_TEAM_ID env var
    ios_bundle_id: str = "net.dmfenton.sketchpad"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    dev_mode: bool = True  # Set to False in production; enables live reload

    # Agent
    agent_interval: int = 10  # seconds between agent turns
    agent_workspace: str = "data/agent_workspace"  # Inside mounted volume for persistence
    workspace_base_dir: str = "data/agent_workspace/users"  # Per-user workspace directories
    max_agent_iterations: int = 5  # max iterations per turn
    agent_max_tokens: int = 8192  # max tokens for Claude response
    agent_model: str = "claude-sonnet-4-20250514"

    # Agent file logging
    agent_logs_enabled: bool = True  # Enable per-turn agent log files
    agent_logs_max_files: int = 50  # Max log files to keep per user

    # Canvas
    canvas_width: int = 800
    canvas_height: int = 600

    # Drawing (pen plotter motion)
    drawing_fps: int = 30  # frames per second for pen updates
    stroke_delay: float = 0.2  # pause between strokes in seconds
    path_steps_per_unit: float = 0.5  # interpolation density
    travel_speed_multiplier: float = 2.0  # travel faster than drawing (pen up movement)
    pen_settle_delay: float = 0.05  # pause after pen down before moving (servo settling)
    pen_lift_threshold: float = 2.0  # skip pen lift if next path starts within this distance

    # Limits
    max_stdout_chars: int = 2000  # truncate stdout in messages
    max_stderr_chars: int = 500  # truncate stderr in messages

    # Tracing (OpenTelemetry + X-Ray via ADOT Collector)
    otel_enabled: bool = False  # Enable in production via env var
    otel_service_name: str = "drawing-agent"
    otel_exporter_endpoint: str = "http://otel-collector:4318"  # ADOT Collector OTLP/HTTP
    aws_region: str = "us-east-1"


settings = Settings()
