// Removes a candidate's own identity (name, email, phone, web profiles) from CV text before any AI call.
// Nothing here knows any specific person: the name is read from the CV itself (its first line).
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PHONE = /\+?\d[\d\s-]{8,}\d/g;
// Any web address (linkedin.com/in/x, github.com/x, leetcode.com/x, personal sites). Case-sensitive so "B.Com" survives.
const WEB = /(?:https?:\/\/)?(?:www\.)?[\w-]+(?:\.[\w-]+)*\.(?:com|in|io|dev|me|net|org|co)(?:\/\S*)?/g;
export const PLACEHOLDER = "[CANDIDATE]";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function guessName(text: string): string {
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const words = line.split(/\s+/);
    // A name line is short and has no digits, @ or separators.
    return words.length > 1 && words.length <= 5 && !/[\d@|·:/]/.test(line) ? line : "";
  }
  return "";
}

export function redactIdentity(text: string): { text: string; name: string; email: string } {
  const name = guessName(text);
  const email = text.match(EMAIL)?.[0] ?? "";
  let out = text.replace(EMAIL, "[EMAIL]").replace(WEB, "[PROFILE]").replace(PHONE, "[PHONE]");
  if (name) {
    out = out.replace(new RegExp(esc(name), "gi"), PLACEHOLDER);
    // Also the first or last name on its own, e.g. inside a quoted reference.
    for (const part of name.split(/\s+/)) {
      if (part.length > 2) out = out.replace(new RegExp(`\\b${esc(part)}\\b`, "gi"), PLACEHOLDER);
    }
    out = out.replace(new RegExp(`${esc(PLACEHOLDER)}(?:[ \\t]+${esc(PLACEHOLDER)})+`, "g"), PLACEHOLDER);
  }
  return { text: out, name, email };
}
