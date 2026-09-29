import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCard } from "../src/card";
import { quoteInText } from "../src/extraction";
import { extractText } from "../src/extractText";
import { parseJson } from "../src/gemini";
import { redactIdentity } from "../src/redact";
import { forRole, scoreSignals } from "../src/scoring";
import { ev } from "./helpers";

const ROOT = join(import.meta.dirname, "..");
const HIRES = join(ROOT, "data", "hires");
// Hire names are read from the fixture file names at test time, never written into code.
const nameParts = readdirSync(HIRES).filter((f) => f.endsWith(".docx")).flatMap((f) => f.replace(".docx", "").split("_").slice(2)).filter((p) => p.length > 2);

describe("quotes and JSON", () => {
  const cv = "— Managed carrier allocation for 3 accounts — combined throughput of 800+ shipments monthly\nBuilt a  dashboard.";
  it("verbatim quote passes with whitespace and dash differences", () => {
    expect(quoteInText("Managed carrier allocation for 3 accounts - combined throughput of 800+ shipments monthly", cv)).toBe(true);
    expect(quoteInText("built a dashboard.", cv)).toBe(true);
  });
  it("paraphrase, '...' joins and empty quotes fail", () => {
    expect(quoteInText("Managed carrier allocation for 5 accounts", cv)).toBe(false);
    expect(quoteInText("Managed carrier allocation ... shipments monthly", cv)).toBe(false);
    expect(quoteInText("", cv)).toBe(false);
  });
  it("parseJson strips fences and prose", () => {
    expect(parseJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(parseJson('Here you go: {"a": 2} thanks')).toEqual({ a: 2 });
  });
});

describe("privacy guards", () => {
  it("no past-hire name appears in any source, prompt or script", () => {
    const files = [...readdirSync(join(ROOT, "src")).map((f) => join(ROOT, "src", f)), ...readdirSync(join(ROOT, "src", "prompts")).map((f) => join(ROOT, "src", "prompts", f)),
      ...readdirSync(join(ROOT, "scripts")).map((f) => join(ROOT, "scripts", f)), ...readdirSync(join(ROOT, "netlify", "functions")).map((f) => join(ROOT, "netlify", "functions", f)), join(ROOT, "public", "index.html"), join(ROOT, "public", "app.js")]
      .filter((f) => /\.(ts|mts|html|js)$/.test(f));
    const hits = files.flatMap((f) => nameParts.filter((n) => readFileSync(f, "utf8").toLowerCase().includes(n.toLowerCase())).map((n) => `${f}: ${n}`));
    expect(hits).toEqual([]);
  });
  it("redaction removes every hire's own name, email and profile links", async () => {
    for (const f of readdirSync(HIRES).filter((x) => x.endsWith(".docx"))) {
      const doc = await extractText(f, readFileSync(join(HIRES, f)));
      expect(doc.ok).toBe(true);
      const { text } = redactIdentity(doc.text);
      for (const p of f.replace(".docx", "").split("_").slice(2)) expect(text.toLowerCase()).not.toContain(p.toLowerCase());
      expect(text).not.toMatch(/@\w+\./);
      expect(text).not.toMatch(/linkedin\.com/i);
    }
  });
  it("B.Com survives redaction", () => expect(redactIdentity("Jane Roe\nB.Com, 2015").text).toContain("B.Com"));
});

describe("card", () => {
  it("gives 2 why lines with quotes, a risk line and 3 probes aimed at the weakest signal", () => {
    const cv = "Prepared Bills of Lading for 180+ shipments monthly\nBuilt a tracker adopted by 12 ops staff";
    const e = ev({
      ops_roles: [{ employer_type: "CHA", work_kind: "hands_on_operations", months: 30, hands_on_tasks: ["prepared BoL"], volume: "180+/month", cv_quote: "Prepared Bills of Lading for 180+ shipments monthly" }],
      unprompted_builds: [{ users: "ops", adoption: "12 ops staff", built: "tracker", cv_quote: "Built a tracker adopted by 12 ops staff" }],
    });
    const sc = scoreSignals(e, cv);
    const card = buildCard(sc, forRole(sc, e, "PM", cv));
    expect(card.why).toHaveLength(2);
    expect(card.why.every((w) => w.quote)).toBe(true);
    expect(card.risk).toMatch(/S3|S4/);
    expect(card.probes).toHaveLength(3);
  });
  it("with no weak signal, the risk line doesn't call a 3/3 signal weakest", () => {
    const cv = "Sole PM\nfixed an outage overnight\nkilled a feature on usage data\nPrepared BoL for 200 shipments a month\nBuilt a tracker adopted by 12 ops staff";
    const e = ev({
      candidate: { location: "Pune", relocation_stated: null },
      ops_roles: [{ employer_type: "forwarder", work_kind: "hands_on_operations", months: 30, hands_on_tasks: ["prepared BoL"], volume: "200/month", cv_quote: "Prepared BoL for 200 shipments a month" }],
      unprompted_builds: [{ users: "ops", adoption: "12", built: "tracker", cv_quote: "Built a tracker adopted by 12 ops staff" }],
      ownership: { sole_owner: true, layer_above: "none", cv_quote: "Sole PM", crisis: "outage", crisis_quote: "fixed an outage overnight" },
      kills_postmortems: [{ what: "k", own_call: true, learning_adopted: false, cv_quote: "killed a feature on usage data" }],
    });
    const sc = scoreSignals(e, cv);
    const card = buildCard(sc, forRole(sc, e, "PM", cv));
    expect(card.risk).not.toMatch(/weakest/);
    expect(card.risk).toMatch(/relocation/);
  });
});

describe("redaction on varied CV layouts", () => {
  it("finds the name next to the contact block even when a PDF puts it at the end", () => {
    const cv = ["PROFESSIONAL SUMMARY", "Operations leader with 6 years", "CORE COMPETENCIES", "Carrier allocation", "EDUCATION", "B.Com", "Neha Rao", "neha.rao@mail.com | +91 90000 12345"].join("\n");
    const r = redactIdentity(cv, "cv_upload.pdf");
    expect(r.name).toBe("Neha Rao");
    expect(r.text).not.toMatch(/Neha|Rao/);
    expect(r.text).toContain("CORE COMPETENCIES");
  });
  it("prefers the file name's words over a heading, and doesn't redact the heading", () => {
    const cv = ["Strategic & Marketing Lead", "PROFESSIONAL SUMMARY", "Led campaigns", "Tara Singh tara@x.com"].join("\n");
    const r = redactIdentity(cv, "07_tara_singh.pdf");
    expect(r.name).toBe("Tara Singh");
    expect(r.text).toContain("Strategic & Marketing Lead");
    expect(r.text).not.toMatch(/Tara|Singh/);
  });
  it("handles a name and email on the same line", () => {
    const r = redactIdentity("Kiran Das kiran@x.co\n+91 90000 00000 · Pune\nSummary", "resume.pdf");
    expect(r.name).toBe("Kiran Das");
    expect(r.text).not.toMatch(/Kiran|Das/);
  });
});

describe("short CVs", () => {
  it("a short but legible CV is accepted and marked short", async () => {
    const cv = "Neha Rao\nPM, 3 yrs at a SaaS startup. Led onboarding revamp; churn -20%. Mumbai.";
    const r = await extractText("cv.txt", Buffer.from(cv));
    expect(cv.length).toBeLessThan(100);
    expect(r.ok).toBe(true);
    expect(r.short).toBe(true);
  });
  it("a long CV isn't marked short", async () => {
    const r = await extractText("cv.txt", Buffer.from("Experience\n" + "Managed carrier allocation for 800 shipments a month. ".repeat(10)));
    expect(r.ok).toBe(true);
    expect(r.short).toBe(false);
  });
  it("a file with no real text is still rejected", async () => {
    const r = await extractText("cv.txt", Buffer.from("  \n . \n"));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no readable text/);
  });
});
