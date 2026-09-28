"""Loads settings from .env. Nothing here calls a network service."""
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUTPUT = ROOT / "output"

load_dotenv(ROOT / ".env")


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5")
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
RESEND_FROM = os.getenv("RESEND_FROM", "onboarding@resend.dev")
# Safe default: if DEMO_MODE is missing, behave as demo (never email real addresses).
DEMO_MODE = _bool("DEMO_MODE", True)
DEMO_RECIPIENT = os.getenv("DEMO_RECIPIENT", "")
ARJUN_EMAIL = os.getenv("ARJUN_EMAIL", "")


def summary() -> dict:
    """Which settings are present, without printing any secret."""
    return {
        "ANTHROPIC_API_KEY": "set" if ANTHROPIC_API_KEY else "missing",
        "ANTHROPIC_MODEL": ANTHROPIC_MODEL,
        "RESEND_API_KEY": "set" if RESEND_API_KEY else "missing",
        "RESEND_FROM": RESEND_FROM,
        "DEMO_MODE": DEMO_MODE,
        "DEMO_RECIPIENT": DEMO_RECIPIENT or "missing",
        "ARJUN_EMAIL": ARJUN_EMAIL or "missing",
    }
