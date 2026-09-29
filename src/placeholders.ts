// Unresolved template text must never reach a candidate. Used by /api/send; public/app.js mirrors the same pattern.
export const PLACEHOLDER_RE = /\[[^\]\n]{1,60}\]|\{\{[^}\n]{0,60}\}\}|\{[a-z_][a-z0-9_]{0,40}\}|<[A-Z][A-Z0-9_ ]{1,40}>|\b(?:TODO|TBD|XXX)\b/g;

export function findPlaceholders(...texts: string[]): string[] {
  const found = new Set<string>();
  for (const t of texts) for (const m of t.matchAll(PLACEHOLDER_RE)) found.add(m[0]);
  return [...found];
}
