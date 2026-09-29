import { afterEach, describe, expect, it, vi } from "vitest";
import { draftEmail, draftFacts, merge, templateDraft } from "../src/emailDraft.js";
import { recipientFor, sendEmail } from "../src/mailer.js";
import { forRole, scoreSignals } from "../src/scoring.js";
import { ev } from "./helpers.js";

const CV = "Handled DO releases for 200 shipments monthly at Oceanic Freight";
const e = ev({ candidate: { location: "Pune", relocation_stated: null },
  ops_roles: [{ employer: "Oceanic Freight", employer_type: "forwarder", work_kind: "hands_on_operations", months: 30, hands_on_tasks: ["handled DO releases"], volume: "200/month", cv_quote: CV }] });
const sc = scoreSignals(e, CV);
const rr = forRole(sc, e, "PM", CV);

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("email drafting", () => {
  it("facts sent to the AI carry no name, email or employer", () => {
    const f = JSON.stringify(draftFacts(e, sc, rr));
    expect(f).not.toContain("Oceanic");
    expect(f).not.toContain("@");
    expect(draftFacts(e, sc, rr).needs_relocation_question).toBe(true);
  });
  it("the name is merged in code, first name only", () => {
    expect(merge("Hi {first_name},", "Asha Menon")).toBe("Hi Asha,");
    expect(merge("Hi {first_name},", "")).toBe("Hi there,");
  });
  it("templates: invite has the scheduling link and relocation question, decline has neither", () => {
    const f = draftFacts(e, sc, rr);
    const inv = templateDraft("invite", f), dec = templateDraft("decline", f);
    expect(inv.body).toContain("[SCHEDULING LINK]");
    expect(inv.body).toMatch(/relocat/);
    expect(dec.body).not.toContain("[SCHEDULING LINK]");
  });
  it("an AI draft that mentions the score is rejected and the template is used", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ subject: "Hi", body: "Hi {first_name}, you scored 80 on our rubric." }) }] } }] }))));
    const d = await draftEmail("invite", e, sc, rr);
    expect(d.draftedBy).toBe("template");
    expect(d.body).not.toMatch(/scored|rubric/);
  });
});

describe("sending (hard rules 3 and 4)", () => {
  it("demo mode sends to DEMO_RECIPIENT, never the candidate", () => {
    vi.stubEnv("DEMO_MODE", "true"); vi.stubEnv("DEMO_RECIPIENT", "me@mine.com");
    expect(recipientFor("candidate@real.com").to).toBe("me@mine.com");
  });
  it("demo mode with no real recipient refuses to send", () => {
    vi.stubEnv("DEMO_MODE", "true"); vi.stubEnv("DEMO_RECIPIENT", "your-own-email@example.com");
    expect(recipientFor("candidate@real.com").to).toBe("");
  });
  it("demo mode is the default when DEMO_MODE is missing", () => {
    vi.stubEnv("DEMO_MODE", undefined as any); vi.stubEnv("DEMO_RECIPIENT", "me@mine.com");
    expect(recipientFor("candidate@real.com").to).toBe("me@mine.com");
  });
  it("the Resend request goes to the demo address with a [Demo] subject", async () => {
    vi.stubEnv("DEMO_MODE", "true"); vi.stubEnv("DEMO_RECIPIENT", "me@mine.com"); vi.stubEnv("RESEND_API_KEY", "re_test");
    const f = vi.fn(async () => new Response(JSON.stringify({ id: "abc" }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const r = await sendEmail("candidate@real.com", "Let's talk", "Hi");
    expect(r.ok).toBe(true);
    const body = JSON.parse((f.mock.calls[0] as any)[1].body);
    expect(body.to).toEqual(["me@mine.com"]);
    expect(body.subject).toBe("[Demo] Let's talk");
  });
});

describe("placeholders block sending", () => {
  it("finds bracket, mustache, brace and angle placeholders, and TODO", async () => {
    const { findPlaceholders } = await import("../src/placeholders.js");
    expect(findPlaceholders("Pick a time: [SCHEDULING LINK]")).toEqual(["[SCHEDULING LINK]"]);
    expect(findPlaceholders("Hi {{name}}", "Hi {first_name}", "See <LINK HERE>", "TODO add date")).toEqual(["{{name}}", "{first_name}", "<LINK HERE>", "TODO"]);
  });
  it("a finished email has none", async () => {
    const { findPlaceholders } = await import("../src/placeholders.js");
    expect(findPlaceholders("Kargo · Product Manager: let's talk", "Hi Asha,\n\nPick a slot here: https://cal.com/arjun/30min\n\nArjun")).toEqual([]);
  });
  it("a configured SCHEDULING_URL is filled in at draft time", () => {
    vi.stubEnv("SCHEDULING_URL", "https://cal.com/arjun/30min");
    expect(merge("Book here: [SCHEDULING LINK]", "Asha Rao")).toBe("Book here: https://cal.com/arjun/30min");
  });
  it("without one, the placeholder stays so Send stays blocked", () => {
    vi.stubEnv("SCHEDULING_URL", "");
    expect(merge("Book here: [SCHEDULING LINK]", "Asha Rao")).toContain("[SCHEDULING LINK]");
  });
});
