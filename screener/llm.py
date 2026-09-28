"""One place for model calls (Gemini). Every call must return JSON: strip fences, parse, retry once, then flag."""
import json
import logging
import re
import time

import httpx

from screener import config

log = logging.getLogger(__name__)

# v1: older Flash models 404 for new keys (same finding as the common-ground project).
ENDPOINT = "https://generativelanguage.googleapis.com/v1/models"
TIMEOUT_S = 120
FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.I)


def parse_json(raw: str):
    text = FENCE.sub("", raw.strip())
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Fall back to the outermost {...} if the model added prose around it.
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            return json.loads(text[start:end + 1])
        raise


def _generate(contents: list[dict], system: str) -> tuple[str, str]:
    """Returns (text, finish_reason). Retries network errors, 429 and 5xx a few times."""
    if not config.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not set in .env")
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": contents,
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0},
    }
    url = f"{ENDPOINT}/{config.GEMINI_MODEL}:generateContent"
    for attempt in range(4):
        try:
            r = httpx.post(url, headers={"x-goog-api-key": config.GEMINI_API_KEY}, json=body, timeout=TIMEOUT_S)
        except httpx.HTTPError as exc:
            err = f"network: {type(exc).__name__}"
        else:
            if r.status_code == 200:
                cand = (r.json().get("candidates") or [{}])[0]
                # Skip thought parts; keep only the answer text.
                parts = [p.get("text", "") for p in (cand.get("content") or {}).get("parts", []) if not p.get("thought")]
                return "".join(parts), cand.get("finishReason", "")
            err = f"HTTP {r.status_code}"
            if r.status_code not in (429, 500, 502, 503, 504):
                # Never log the request: it contains CV text.
                raise RuntimeError(f"Gemini {err}: {r.text[:200]}")
        log.warning("Gemini %s, retrying (%d)", err, attempt + 1)
        time.sleep(2 ** attempt * 2)
    raise RuntimeError(f"Gemini failed after retries ({err})")


def call_json(system: str, user: str) -> tuple[dict | None, str]:
    """Returns (parsed_json or None, error). Retries once on a parse failure, then flags."""
    contents = [{"role": "user", "parts": [{"text": user}]}]
    last_err = ""
    for attempt in range(2):
        try:
            raw, finish = _generate(contents, system)
        except RuntimeError as exc:
            return None, str(exc)
        if finish and finish not in ("STOP", "MAX_TOKENS"):
            return None, f"model stopped: {finish}"
        try:
            return parse_json(raw), ""
        except (json.JSONDecodeError, ValueError) as exc:
            last_err = "output cut off (MAX_TOKENS)" if finish == "MAX_TOKENS" else f"invalid JSON: {exc}"
            log.warning("JSON parse failed (attempt %d): %s", attempt + 1, exc)
            contents = [
                {"role": "user", "parts": [{"text": user}]},
                {"role": "model", "parts": [{"text": raw}]},
                {"role": "user", "parts": [{"text": "That was not valid JSON. Reply again with only the JSON object, no prose and no code fences."}]},
            ]
    return None, last_err
