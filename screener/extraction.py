"""Model call 1: CV text -> evidence JSON (schema from docs/SPEC.md, plus a few documented extras)."""
import datetime as dt
import json
import re
import unicodedata

from screener import config
from screener.llm import call_json

SCHEMA = {
    "candidate": {"name": "", "email": "", "role_applied": "PM | Senior PM | unclear", "location": "", "relocation_stated": None},
    "pm_years": 0.0,
    "adjacent_years": 0.0,
    "ops_roles": [{
        "employer": "", "role_title": "",
        "employer_type": "forwarder | CHA | 3PL | NVOCC | port | shipper | software_vendor | none",
        "work_kind": "hands_on_operations | embedded_with_ops_from_vendor | software_or_sales_for_logistics",
        "months": 0, "hands_on_tasks": [""], "volume": "", "cv_quote": "",
    }],
    "unprompted_builds": [{"trigger": "", "built": "", "users": "ops | customers | own team | self", "adoption": "", "cv_quote": ""}],
    "ownership": {"sole_owner": False, "layer_above": "", "crisis": "", "cv_quote": "", "crisis_quote": ""},
    "kills_postmortems": [{"what": "", "own_call": False, "learning_adopted": False, "cv_quote": ""}],
    "integration_platform_ownership": False,
    "integration_quote": "",
    "gaps_or_unclear": [""],
}

PROMPT_PATH = config.ROOT / "screener" / "prompts" / "extract_system.md"


def system_prompt(today: dt.date | None = None) -> str:
    today = today or dt.date.today()
    return (PROMPT_PATH.read_text()
            .replace("{today}", today.isoformat())
            .replace("{schema}", json.dumps(SCHEMA, indent=2)))


def extract_evidence(cv_text: str) -> tuple[dict | None, str]:
    user = f"CV text:\n<cv>\n{cv_text}\n</cv>"
    return call_json(system_prompt(), user)


# ---------- verbatim quote check (hard rule 1) ----------

_PUNCT = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"',
                        "–": "-", "—": "-", "−": "-", "…": "..."})


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", s).translate(_PUNCT).lower()
    return re.sub(r"\s+", " ", s).strip()


def quote_in_text(quote: str, text: str) -> bool:
    """True if the quote appears in the CV. Only whitespace, case and quote/dash styles may differ."""
    q = _norm(quote).strip(" .,;\"'")
    return bool(q) and q in _norm(text)


def iter_quotes(ev: dict):
    """Yields (path, quote) for every quote field in an extraction."""
    for i, r in enumerate(ev.get("ops_roles") or []):
        yield f"ops_roles[{i}].cv_quote", r.get("cv_quote", "")
    for i, b in enumerate(ev.get("unprompted_builds") or []):
        yield f"unprompted_builds[{i}].cv_quote", b.get("cv_quote", "")
    own = ev.get("ownership") or {}
    yield "ownership.cv_quote", own.get("cv_quote", "")
    if own.get("crisis") or own.get("crisis_quote"):
        yield "ownership.crisis_quote", own.get("crisis_quote", "")
    for i, k in enumerate(ev.get("kills_postmortems") or []):
        yield f"kills_postmortems[{i}].cv_quote", k.get("cv_quote", "")
    if ev.get("integration_platform_ownership"):
        yield "integration_quote", ev.get("integration_quote", "")


def check_quotes(ev: dict, text: str) -> list[dict]:
    """One row per quote field: path, quote, verified. An empty quote is unverified."""
    return [{"path": p, "quote": q, "verified": quote_in_text(q, text) if q else False}
            for p, q in iter_quotes(ev)]
