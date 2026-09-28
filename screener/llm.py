"""One place for model calls. Every call must return JSON: strip fences, parse, retry once, then flag."""
import json
import logging
import re

import anthropic

from screener import config

log = logging.getLogger(__name__)

_client = None


def client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        if not config.ANTHROPIC_API_KEY:
            raise RuntimeError("ANTHROPIC_API_KEY is not set in .env")
        _client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
    return _client


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


def call_json(system: str, user: str, max_tokens: int = 8000) -> tuple[dict | None, str]:
    """Returns (parsed_json or None, error). Retries once on a parse failure."""
    messages = [{"role": "user", "content": user}]
    last_err = ""
    for attempt in range(2):
        resp = client().messages.create(
            model=config.ANTHROPIC_MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=messages,
        )
        if resp.stop_reason == "refusal":
            return None, "model refused"
        raw = "".join(b.text for b in resp.content if b.type == "text")
        if resp.stop_reason == "max_tokens":
            last_err = "output cut off at max_tokens"
        try:
            return parse_json(raw), ""
        except (json.JSONDecodeError, ValueError) as exc:
            last_err = last_err or f"invalid JSON: {exc}"
            log.warning("JSON parse failed (attempt %d): %s", attempt + 1, exc)
            messages = [
                {"role": "user", "content": user},
                {"role": "assistant", "content": raw},
                {"role": "user", "content": "That was not valid JSON. Reply again with only the JSON object, no prose and no code fences."},
            ]
    return None, last_err
