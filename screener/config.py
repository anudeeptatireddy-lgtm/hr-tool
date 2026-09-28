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


GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
RESEND_FROM = os.getenv("RESEND_FROM", "onboarding@resend.dev")
# Safe default: if DEMO_MODE is missing, behave as demo (never email real addresses).
DEMO_MODE = _bool("DEMO_MODE", True)
DEMO_RECIPIENT = os.getenv("DEMO_RECIPIENT", "")
ARJUN_EMAIL = os.getenv("ARJUN_EMAIL", "")


def summary() -> dict:
    """Which settings are present, without printing any secret."""
    return {
        "GEMINI_API_KEY": "set" if GEMINI_API_KEY else "missing",
        "GEMINI_MODEL": GEMINI_MODEL,
        "RESEND_API_KEY": "set" if RESEND_API_KEY else "missing",
        "RESEND_FROM": RESEND_FROM,
        "DEMO_MODE": DEMO_MODE,
        "DEMO_RECIPIENT": DEMO_RECIPIENT or "missing",
        "ARJUN_EMAIL": ARJUN_EMAIL or "missing",
    }
