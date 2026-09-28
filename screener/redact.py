"""Removes a candidate's own identity (name, email, phone, profile URLs) from CV text.

Used for the back-test so the model can't recognise the past hires. Nothing here knows any
specific person: the name is read from the CV itself (its first line).
"""
import re

EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
PHONE = re.compile(r"\+?\d[\d\s-]{8,}\d")
# Any web address with a path (linkedin.com/in/x, github.com/x, leetcode.com/x, personal sites).
PROFILE_URL = re.compile(r"(?:https?://)?(?:www\.)?[\w-]+(?:\.[\w-]+)*\.(?:com|in|io|dev|me|net|org|co)(?:/\S*)?")

PLACEHOLDER = "[CANDIDATE]"


def guess_name(text: str) -> str:
    """CVs almost always open with the person's name on its own line."""
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        words = line.split()
        # A name line is short and has no digits, @ or separators.
        if 1 < len(words) <= 5 and not re.search(r"[\d@|·:/]", line):
            return line
        return ""
    return ""


def redact_identity(text: str) -> tuple[str, str]:
    """Returns (redacted_text, detected_name)."""
    name = guess_name(text)
    out = EMAIL.sub("[EMAIL]", text)
    out = PROFILE_URL.sub("[PROFILE]", out)
    out = PHONE.sub("[PHONE]", out)
    if name:
        out = re.sub(re.escape(name), PLACEHOLDER, out, flags=re.I)
        # Also catch the first or last name on its own (e.g. in a quoted reference).
        for part in name.split():
            if len(part) > 2:
                out = re.sub(rf"\b{re.escape(part)}\b", PLACEHOLDER, out, flags=re.I)
        out = re.sub(rf"{re.escape(PLACEHOLDER)}(?:[ \t]+{re.escape(PLACEHOLDER)})+", PLACEHOLDER, out)
    return out, name
