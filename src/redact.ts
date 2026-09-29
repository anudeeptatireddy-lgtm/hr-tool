// Removes a candidate's own identity (name, email, phone, web profiles) from CV text before any AI call.
// Nothing here knows any specific person: the name is found in the CV's opening lines and, as a safety net,
// from words in the uploaded file name that also appear near the top of the CV.
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PHONE = /\+?\d[\d\s-]{8,}\d/g;
// Any web address (linkedin.com/in/x, github.com/x, leetcode.com/x, personal sites). Case-sensitive so "B.Com" survives.
const WEB = /(?:https?:\/\/)?(?:www\.)?[\w-]+(?:\.[\w-]+)*\.(?:com|in|io|dev|me|net|org|co)(?:\/\S*)?/g;
export const PLACEHOLDER = "[CANDIDATE]";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Words that mark a heading, a job title or a place, never a person's name.
const NOT_NAME = new Set(`summary profile experience education skills projects certifications contact objective about professional work
  employment career achievements awards languages interests references personal details curriculum vitae resume cv
  product manager senior lead leader head director engineer developer analyst consultant executive associate specialist officer
  marketing strategy strategic operations operation sales growth business brand finance supply chain logistics management
  corporate advisory founder cofounder intern trainee technology technical data software platform program programme
  mumbai pune bengaluru bangalore delhi chennai hyderabad kolkata india gurgaon gurugram noida ahmedabad thane`.split(/\s+/).filter(Boolean));
const FILE_NOISE = new Set(["cv", "resume", "final", "updated", "new", "copy", "pm", "spm", "doc", "docx", "pdf", "txt", "application", "profile"]);

function cleanLine(line: string): string {
  return line.replace(EMAIL, " ").replace(WEB, " ").replace(PHONE, " ").replace(/[|·•,;:()]/g, " ").replace(/\s+/g, " ").trim();
}

function looksLikeName(line: string): boolean {
  const words = line.split(" ");
  if (words.length < 2 || words.length > 4) return false;
  return words.every((w) => /^[A-Z][A-Za-z'.-]{0,20}$/.test(w) && !NOT_NAME.has(w.toLowerCase().replace(/[^a-z]/g, "")));
}

const CONTACT = /[\w.+-]+@[\w-]+\.|\+?\d[\d\s-]{8,}\d/;

/**
 * Lines where a name is likely, with their line numbers: the opening lines, plus a few lines around every
 * email or phone number (PDF sidebars and two-column headers often come out at the end of the text).
 */
function zone(text: string): { i: number; line: string; dist: number }[] {
  const all = text.split("\n");
  const contacts = all.map((l, i) => (CONTACT.test(l) ? i : -1)).filter((i) => i >= 0);
  const out: { i: number; line: string; dist: number }[] = [];
  all.forEach((line, i) => {
    const dist = contacts.length ? Math.min(...contacts.map((c) => Math.abs(c - i))) : i;
    if (i < 15 || dist <= 4) out.push({ i, line, dist: Math.min(dist, i) });
  });
  return out;
}
export const nameZone = (text: string) => zone(text).map((z) => z.line);

/** Name-shaped lines in the zone, closest to the contact details (or the very top) first. */
function nameCandidates(text: string): string[] {
  const found: { name: string; dist: number; i: number }[] = [];
  for (const z of zone(text)) {
    const line = cleanLine(z.line);
    if (!line) continue;
    if (looksLikeName(line)) { found.push({ name: line, dist: z.dist, i: z.i }); continue; }
    // "Firstname Lastname  Some Title" on one line: try the first two or three words.
    const w = line.split(" ");
    for (const n of [3, 2]) if (w.length > n && looksLikeName(w.slice(0, n).join(" "))) { found.push({ name: w.slice(0, n).join(" "), dist: z.dist, i: z.i }); break; }
  }
  return found.sort((x, y) => x.dist - y.dist || x.i - y.i).map((f) => f.name);
}

export function guessName(text: string): string {
  return nameCandidates(text)[0] ?? "";
}

/** File-name words that also appear as whole words in the name zone: almost always the person's name. */
export function nameFromFile(fileName: string, text: string): string[] {
  const top = nameZone(text).join(" ");
  return fileName.replace(/\.[a-z0-9]+$/i, "").split(/[^A-Za-z]+/)
    .filter((t) => t.length >= 3 && !FILE_NOISE.has(t.toLowerCase()) && !NOT_NAME.has(t.toLowerCase()))
    .filter((t) => new RegExp(`\\b${esc(t)}\\b`, "i").test(top));
}

const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

export function redactIdentity(text: string, fileName = ""): { text: string; name: string; email: string } {
  const fileParts = fileName ? nameFromFile(fileName, text) : [];
  // With name words from the file name, only trust a name-shaped line that contains them; otherwise the
  // line closest to the contact details. This keeps headings like "Core Competencies" from being taken as a name.
  const lineName = fileParts.length
    ? nameCandidates(text).find((n) => fileParts.some((p) => new RegExp(`\\b${esc(p)}\\b`, "i").test(n))) ?? ""
    : guessName(text);
  const name = lineName || fileParts.map(title).join(" ");
  const email = text.match(EMAIL)?.[0] ?? "";
  let out = text.replace(EMAIL, "[EMAIL]").replace(WEB, "[PROFILE]").replace(PHONE, "[PHONE]");
  const parts = new Set([...(lineName ? lineName.split(/\s+/) : []), ...fileParts].filter((p) => p.replace(/\./g, "").length > 2));
  if (lineName) out = out.replace(new RegExp(esc(lineName), "gi"), PLACEHOLDER);
  // Every part on its own too, e.g. a first name inside a quoted reference.
  for (const part of parts) out = out.replace(new RegExp(`\\b${esc(part)}\\b`, "gi"), PLACEHOLDER);
  out = out.replace(new RegExp(`${esc(PLACEHOLDER)}(?:[ \\t]+${esc(PLACEHOLDER)})+`, "g"), PLACEHOLDER);
  return { text: out, name, email };
}
