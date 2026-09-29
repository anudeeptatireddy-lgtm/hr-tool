// The two open roles. The JDs only supply gates (SPEC.md "Pattern vs JD"); ranking comes from the rubric.
import type { Role } from "./scoring";

export type Job = { role: Role; ref: string; title: string; location: string; reportsTo: string; openedOn: string; requirement: string; gates: string[]; jdFile: string };

export const JOBS: Job[] = [
  {
    role: "PM", ref: "KRG-PM-01", title: "Product Manager", location: "Mumbai · in-office", reportsTo: "Arjun Mehta, Founder", openedOn: "2026-07-13",
    requirement: "2–4 years of product management, ideally building for the first time",
    gates: ["1.5–5 yrs PM (adjacent roles count half)", "Mumbai or willing to relocate"],
    jdFile: "/jds/product-manager.docx",
  },
  {
    role: "Senior PM", ref: "KRG-SPM-01", title: "Senior Product Manager", location: "Mumbai · in-office", reportsTo: "Arjun Mehta, Founder", openedOn: "2026-07-13",
    requirement: "5–8 years of product management, owning an area with no senior PMs above; integration or platform work",
    gates: ["4–9 yrs PM", "Owned an integration or platform area", "Mumbai or willing to relocate"],
    jdFile: "/jds/senior-product-manager.docx",
  },
];
