// Milestone 1 check: extract text from every file under data/ and print a status table. Prints no CV contents.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { extractText } from "../src/extractText.js";

const DATA = join(import.meta.dirname, "..", "data");
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const files = walk(DATA).filter((f) => !/(README\.md|\.DS_Store|\.json)$/.test(f) && !f.split("/").pop()!.startsWith("~$"));
let ok = 0;
for (const f of files.sort()) {
  const r = await extractText(f, readFileSync(f));
  if (r.ok) ok++;
  console.log(`${relative(DATA, f).padEnd(48)} ${r.format.padEnd(5)} ${String(r.text.length).padStart(6)}  ${r.ok ? "ok" : "FAILED (" + r.error + ")"}`);
}
console.log(`${ok} of ${files.length} ok · data/applications: ${files.filter((f) => f.includes("/applications/")).length} CV files`);
