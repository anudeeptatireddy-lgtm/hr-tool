// HR Tool front end: one page, hash routes, plain JS. Every email goes through a draft the founder reviews and sends.
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const api = async (path, body) => {
  const res = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Request failed (${res.status})`);
  return j;
};
const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const fmtShort = (d) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const fmtTime = (d) => new Date(d).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const initials = (n) => (n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
const ROLE_TITLE = { PM: "Product Manager", "Senior PM": "Senior Product Manager" };
const SIGNAL_NAMES = { S1: "Hands-on logistics ops", S2: "Built a fix others adopted", S3: "Owned the outcome", S4: "Kills and post-mortems" };

let data = null;
let pollTimer = null;

async function load() {
  data = await api("/api/dashboard");
  clearTimeout(pollTimer);
  // While any CV is still being screened, check back every few seconds.
  if (data.candidates.some((c) => c.outcome === "screening")) pollTimer = setTimeout(() => load().then(route).catch(() => {}), 5000);
}

// ---------- shared pieces ----------

const matchClass = (m) => (m === null ? "" : m >= 65 ? "m-pass" : m >= 45 ? "m-mid" : "m-fail");
const outcomePill = (c) => {
  if (c.outcome === "screening") return '<span class="pill screening"><span class="spinner"></span>Screening</span>';
  if (c.outcome === "error") return '<span class="pill error">Couldn\'t read</span>';
  const label = { passed: "Passed", borderline: "Borderline", failed: c.gateFailed ? "Failed gate" : "Failed" }[c.outcome];
  return `<span class="pill ${c.outcome}" title="${esc(c.failedGate)}">${label}</span>`;
};
const statusCell = (c) => {
  if (c.lastSent) return `<span class="pill sent">${c.lastSent.kind === "invite" ? "Invite sent" : "Decline sent"}</span><div class="muted small">${fmtTime(c.lastSent.at)}</div>`;
  if (c.lastDecision) return `<span class="pill ${c.lastDecision.decision === "hold" ? "hold" : "screening"}">${{ advance: "Advanced", decline: "Declined", hold: "On hold" }[c.lastDecision.decision]}</span><div class="muted small">no email sent</div>`;
  return '<span class="muted small">New</span>';
};
const actionCell = (c) => {
  if (c.match === null) return "";
  if (c.lastSent) return statusCell(c);
  const btn = c.outcome === "passed"
    ? `<button class="btn sm" onclick="event.stopPropagation(); emailOne('${c.id}', 'advance')">Invite</button>`
    : `<button class="btn warn sm" onclick="event.stopPropagation(); emailOne('${c.id}', 'decline')">Send decline</button>`;
  const note = c.lastDecision ? `<div class="muted small">${{ advance: "Advanced", decline: "Declined", hold: "On hold" }[c.lastDecision.decision]}, not emailed</div>` : "";
  return btn + note;
};
const whoCell = (c) => `<div class="who"><div class="ini">${esc(initials(c.name))}</div><div class="nowrap">${esc(c.name || c.file)}<div class="muted small" style="font-weight:400">${esc(c.file)}</div></div></div>`;

function candidateTable(list, { showRole = true, compact = false, empty = "No candidates here yet." } = {}) {
  if (!list.length) return `<div class="card empty">${empty}</div>`;
  return `<div class="card table-wrap"><table>
    <thead><tr><th>Candidate</th>${showRole ? "<th>Role</th>" : ""}<th>Match</th><th>Strengths</th>${compact ? "" : "<th>Received</th>"}<th>Result</th><th>Action</th></tr></thead>
    <tbody>${list.map((c) => `<tr class="click" onclick="location.hash='#/c/${c.id}'">
      <td>${whoCell(c)}</td>
      ${showRole ? `<td class="nowrap">${esc(c.role || "—")}</td>` : ""}
      <td class="match ${matchClass(c.match)}">${c.match === null ? "—" : `${Math.round(c.match)}%`}</td>
      <td class="chips">${(c.chips || []).slice(0, compact ? 2 : 4).map((x) => `<span class="chip">${esc(x)}</span>`).join("") || '<span class="muted small">—</span>'}</td>
      ${compact ? "" : `<td class="small nowrap" title="${esc(fmtTime(c.receivedAt))}">${fmtShort(c.receivedAt)}</td>`}
      <td>${outcomePill(c)}</td>
      <td>${actionCell(c)}</td></tr>`).join("")}</tbody></table></div>`;
}

// Tie-break within a band: total, then S1, then S2 (SPEC).
const byMatch = (a, b) => (b.match ?? -1) - (a.match ?? -1) || (b.signals?.S1 ?? 0) - (a.signals?.S1 ?? 0) || (b.signals?.S2 ?? 0) - (a.signals?.S2 ?? 0);
const scored = () => data.candidates.filter((c) => c.match !== null);
const passedNotEmailed = () => scored().filter((c) => c.outcome === "passed" && !c.lastSent);
const searchFilter = (list) => {
  const q = $("#search").value.trim().toLowerCase();
  return q ? list.filter((c) => `${c.name} ${c.file} ${c.role}`.toLowerCase().includes(q)) : list;
};

// ---------- pages ----------

function dashboard() {
  const s = data.stats;
  const passed = scored().filter((c) => c.outcome === "passed").sort(byMatch);
  // Hard rule 6: fewer than 5 at 65+ -> show the top 5 anyway, labelled.
  const below = passed.length < 5;
  const top = below ? scored().sort(byMatch).slice(0, 5) : passed.slice(0, 10);
  const sent = data.candidates.filter((c) => c.lastSent).sort((a, b) => new Date(b.lastSent.at) - new Date(a.lastSent.at)).slice(0, 5);
  const pending = passedNotEmailed().length;
  return `
  <div class="tiles">
    <div class="tile"><div class="k">Active jobs</div><div class="v">${s.activeJobs}</div></div>
    <div class="tile"><div class="k">CVs received</div><div class="v">${s.received}</div></div>
    <div class="tile"><div class="k">Passed (65%+)</div><div class="v">${s.passed}</div></div>
    <div class="tile"><div class="k">Emails sent</div><div class="v">${s.emailsSent}</div></div>
  </div>
  <div class="grid2">
    <section>
      <div class="section-head"><h2>Top candidate matches</h2><a href="#/candidates">View all candidates</a></div>
      ${below && top.length ? `<div class="note">Fewer than 5 candidates reached 65%, so the top ${top.length} are shown. These are below the pattern threshold.</div>` : ""}
      ${candidateTable(top, { compact: true, empty: "No CVs screened yet. Use “Bulk upload CVs” to add some." })}
    </section>
    <section>
      <div class="label">Quick actions</div>
      <div class="qa">
        <button onclick="openUpload()"><span class="plus">＋</span>Bulk upload CVs</button>
        <button onclick="emailAllPassed()" ${pending ? "" : "disabled"}><span class="plus">✉</span>Email all passed${pending ? ` (${pending})` : ""}</button>
      </div>
      <div class="label">Active job openings</div>
      <div class="card jobs-list" style="margin-bottom:26px">${data.jobs.map((j) => `<a class="job" href="#/jobs/${j.role === "PM" ? "pm" : "spm"}"><b>${esc(j.title)}</b><div class="small muted">${j.received} received · <span style="color:var(--accent-ink)">${j.passed} passed</span></div></a>`).join("")}</div>
      <div class="label">Recent emails</div>
      <div class="feed">${sent.length ? sent.map((c) => `<div class="${c.lastSent.kind === "invite" ? "" : "dec"}"><b>${c.lastSent.kind === "invite" ? "Invite sent" : "Decline sent"}: ${esc(c.name)}</b><span class="muted small">${fmtTime(c.lastSent.at)}</span></div>`).join("") : '<span class="muted small">No emails sent yet.</span>'}</div>
    </section>
  </div>`;
}

function jobs(which) {
  const list = which ? data.jobs.filter((j) => (j.role === "PM" ? "pm" : "spm") === which) : data.jobs;
  return `<h1>Jobs</h1><p class="muted">Each job description and every CV received for it. The JD only sets pass/fail gates; the match % comes from the pattern of past hires.</p>
  ${list.map((j) => {
    const mine = searchFilter(data.candidates.filter((c) => c.role === j.role)).sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));
    return `<div class="card pad" style="margin:18px 0 10px">
      <div class="section-head"><div><h2>${esc(j.title)} <span class="muted small">#${esc(j.ref)}</span></h2>
        <div class="muted small">${esc(j.location)} · reports to ${esc(j.reportsTo)} · open since ${fmtDate(j.openedOn)}</div></div>
        <div class="row-actions"><a class="btn ghost sm" href="${j.jdFile}" download>Download JD</a><button class="btn sm" onclick="openUpload('${j.role}')">Upload CVs</button></div></div>
      <div class="small"><b>Looking for:</b> ${esc(j.requirement)}</div>
      <div class="small" style="margin-top:4px"><b>Gates:</b> ${j.gates.map(esc).join(" · ")}</div>
      <div class="small muted" style="margin-top:8px">${j.received} received · ${j.passed} passed</div>
    </div>
    ${candidateTable(mine, { showRole: false, empty: "No CVs received for this role yet." })}`;
  }).join("")}`;
}

function candidates(tab = "passed") {
  const all = searchFilter(data.candidates);
  const groups = {
    passed: all.filter((c) => c.outcome === "passed").sort(byMatch),
    borderline: all.filter((c) => c.outcome === "borderline").sort(byMatch),
    failed: all.filter((c) => c.outcome === "failed").sort(byMatch),
    other: all.filter((c) => c.outcome === "screening" || c.outcome === "error"),
  };
  const names = { passed: "Passed (65%+)", borderline: "Borderline (45–64%)", failed: "Failed", other: "Screening / unreadable" };
  const pending = passedNotEmailed().length;
  return `<div class="section-head"><div><h1>Candidates</h1><div class="muted small">Passed = 65%+ and all gates met. Failed = under 45% or a gate not met. Nothing is emailed until you send it.</div></div>
    <div class="row-actions"><button class="btn ghost" onclick="openUpload()">Bulk upload CVs</button><button class="btn" onclick="emailAllPassed()" ${pending ? "" : "disabled"}>Email all passed${pending ? ` (${pending})` : ""}</button></div></div>
  <div class="tabs">${Object.keys(groups).map((k) => `<a href="#/candidates/${k}" class="${k === tab ? "on" : ""}">${names[k]}<span class="n">${groups[k].length}</span></a>`).join("")}</div>
  ${candidateTable(groups[tab] || [], { empty: tab === "passed" ? "No one has passed yet." : "Nobody in this list." })}`;
}

async function detail(id) {
  const j = await api(`/api/result?id=${id}`);
  if (j.status === "running") return `<a href="#/candidates">← Candidates</a><div class="card empty"><span class="spinner"></span>Still screening this CV…</div>`;
  if (j.status !== "done") return `<a href="#/candidates">← Candidates</a><div class="card empty">${esc(j.error || "This CV couldn't be screened.")}</div>`;
  const r = j.result, rr = r.roles[r.roleUsed], card = r.card, sig = r.scored.signals;
  const row = data.candidates.find((c) => c.id === id) || {};
  const gateRows = (x) => x.gates.map((g) => `<div><span class="pill ${g.status}">${g.status}</span> ${esc(g.name)} <span class="muted small">${esc(g.detail)}</span></div>`).join("");
  return `<a href="#/candidates">← Candidates</a>
  <div class="grid2 detail" style="margin-top:12px">
    <section>
      <div class="card pad">
        <div class="headline"><div class="ini" style="width:38px;height:38px">${esc(initials(r.candidate.name))}</div>${esc(r.candidate.name || "Name not found")}
          <span class="match ${matchClass(rr.total)}">${Math.round(rr.total)}% match</span> ${outcomePill(row)}</div>
        <div class="muted small" style="margin-top:4px">${esc(ROLE_TITLE[r.roleUsed])} (${esc(r.roleNote)}) · received ${row.receivedAt ? fmtDate(row.receivedAt) : ""} · ${esc(r.file)}${r.scored.lowConfidence ? " · <b>Low confidence:</b> S1 rests on thin evidence" : ""}</div>
        <h3>Why ranked here</h3>
        <ul class="plain">${card.why.map((w) => `<li>${esc(w.line)}<blockquote>“${esc(w.quote)}”</blockquote></li>`).join("") || "<li class='muted'>No signal scored above 0.</li>"}</ul>
        <h3>Risk</h3><p>${esc(card.risk)}</p>
        <h3>Probe questions</h3>
        <ul class="plain">${card.probes.map((p) => `<li><b>${p.signal}:</b> ${esc(p.ask)}<div class="muted small">Strong: ${esc(p.strong)} · Weak: ${esc(p.weak)}</div></li>`).join("")}</ul>
      </div>
      <div class="card" style="margin-top:16px"><div class="pad"><h2>Signal scores (0–3)</h2></div><div class="table-wrap"><table>
        <thead><tr><th>Signal</th><th>Score</th><th>Why, and the CV line it rests on</th></tr></thead>
        <tbody>${["S1", "S2", "S3", "S4"].map((s) => `<tr><td><b>${s}</b> ${SIGNAL_NAMES[s]}</td><td class="match">${sig[s].score}</td><td>${esc(sig[s].reason)}${sig[s].quote ? `<blockquote>“${esc(sig[s].quote)}”</blockquote>` : ""}</td></tr>`).join("")}</tbody></table></div>
        <div class="pad muted small">3 extraction runs: ${r.runTotals.join(" / ")} (median kept).${r.scored.flags.length ? ` ${r.scored.flags.length} item(s) had no matching CV quote and got no credit.` : ""}</div></div>
      <div class="card" style="margin-top:16px"><div class="pad"><h2>Both roles</h2></div><div class="table-wrap"><table>
        <thead><tr><th>Role</th><th>Weights S1/S2/S3/S4</th><th>Match</th><th>Result</th><th>Gates</th></tr></thead>
        <tbody>${["PM", "Senior PM"].map((k) => { const x = r.roles[k]; return `<tr><td>${ROLE_TITLE[k]}${k === r.roleUsed ? " ✓" : ""}</td><td>${x.weights.S1}/${x.weights.S2}/${x.weights.S3}/${x.weights.S4}</td><td class="match ${matchClass(x.total)}">${Math.round(x.total)}%</td><td><span class="pill ${x.recommendation === "Shortlist" ? "passed" : x.recommendation === "Borderline" ? "borderline" : "failed"}">${x.recommendation}</span></td><td>${gateRows(x)}</td></tr>`; }).join("")}</tbody></table></div></div>
      <div class="card pad" style="margin-top:16px"><details><summary class="muted">Extracted evidence (what scoring saw)</summary><pre>${esc(JSON.stringify(r.evidence, null, 2))}</pre></details></div>
    </section>
    <section>
      <div class="label">Your decision</div>
      <div class="card pad">
        <div class="muted small" style="margin-bottom:10px">Currently: ${statusCell(row)}</div>
        <div class="row-actions">
          <button class="btn" onclick="emailOne('${id}', 'advance')">Advance + draft invite</button>
          <button class="btn amber" onclick="holdOne('${id}')">Hold</button>
          <button class="btn warn" onclick="emailOne('${id}', 'decline')">Decline + draft email</button>
        </div>
        <p class="muted small">Advance and Decline draft an email for you to review. It's only sent when you click Send.</p>
      </div>
    </section>
  </div>`;
}

async function emailsPage() {
  const a = await api("/api/audit");
  return `<div class="section-head"><div><h1>Emails &amp; decision log</h1><div class="muted small">Every decision with its score and reasoning, and every email drafted or sent.</div></div>
    <div class="row-actions"><button class="btn ghost" onclick='downloadCsv("decisions")'>Export decisions CSV</button><button class="btn ghost" onclick='downloadCsv("emails")'>Export emails CSV</button></div></div>
  <div class="label" style="margin-top:16px">Emails</div>
  ${a.emails.length ? `<div class="card table-wrap"><table><thead><tr><th>Drafted</th><th>Candidate</th><th>Type</th><th>Subject</th><th>Status</th><th>Sent to</th><th>Sent</th></tr></thead><tbody>
    ${a.emails.map((e) => `<tr><td class="small">${fmtTime(e.created_at)}</td><td>${esc(e.candidate)}</td><td>${e.kind === "invite" ? "Invite" : "Decline"}</td><td>${esc(e.subject)}</td>
      <td><span class="pill ${e.status === "sent" ? "sent" : e.status === "failed" ? "error" : "screening"}">${e.status}</span></td><td class="small">${esc(e.sent_to || "—")}</td><td class="small">${e.sent_at ? fmtTime(e.sent_at) : "—"}</td></tr>`).join("")}</tbody></table></div>` : '<div class="card empty">No emails yet.</div>'}
  <div class="label" style="margin-top:24px">Decisions</div>
  ${a.decisions.length ? `<div class="card table-wrap"><table><thead><tr><th>When</th><th>Candidate</th><th>Decision</th><th>Role</th><th>Match</th><th>Recommendation</th><th>Rationale</th></tr></thead><tbody>
    ${a.decisions.map((d) => `<tr><td class="small">${fmtTime(d.created_at)}</td><td>${esc(d.candidate)}</td><td><span class="pill ${d.decision === "advance" ? "passed" : d.decision === "hold" ? "hold" : "failed"}">${d.decision}</span></td><td>${esc(d.role)}</td><td class="match">${Math.round(d.score)}%</td><td>${esc(d.band)}</td><td class="small muted">${esc(d.rationale)}</td></tr>`).join("")}</tbody></table></div>` : '<div class="card empty">No decisions yet.</div>'}`;
}

async function backtest() {
  const d = await (await fetch("/backtest.json")).json();
  const w = d.weights;
  return `<h1>Back-test on past hires</h1><p class="muted">The 8 past-hire CVs, names removed, run through the same pipeline. Pass condition: every hire rated Exceeds scores 65%+ and every other hire scores under 65%.</p>
  <div class="card pad" style="margin-bottom:16px"><div class="headline">${d.passed ? '<span class="pill pass">PASS</span>' : '<span class="pill fail">FAIL</span>'} Gap between groups: ${d.gap.toFixed(1)} points</div>
    <div class="muted small">Weights S1 ${w.S1} · S2 ${w.S2} · S3 ${w.S3} · S4 ${w.S4} · pass at ${d.threshold}% · run ${fmtTime(d.ranAt)}</div></div>
  <div class="card table-wrap"><table><thead><tr><th>Hire</th><th>Actual rating</th><th>S1</th><th>S2</th><th>S3</th><th>S4</th><th>Match</th><th>Result</th><th>3 runs</th></tr></thead><tbody>
    ${d.rows.map((r) => `<tr><td>${esc(r.id)}</td><td>${esc(r.rating)}</td><td>${r.S1}</td><td>${r.S2}</td><td>${r.S3}</td><td>${r.S4}</td><td class="match ${matchClass(r.total)}">${r.total.toFixed(1)}%</td>
      <td><span class="pill ${r.pass ? "pass" : "fail"}">${r.pass ? "ok" : "band flip"}</span></td><td class="small muted">${(r.runs || []).join(" / ")}</td></tr>`).join("")}</tbody></table></div>`;
}

// ---------- routing ----------

async function route() {
  const [, page = "", arg = ""] = location.hash.replace(/^#/, "").split("/");
  const key = { "": "dash", jobs: "jobs", candidates: "candidates", c: "candidates", emails: "emails", backtest: "backtest" }[page] || "dash";
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("on", a.dataset.r === key));
  const view = $("#view");
  try {
    if (!data) await load();
    if (page === "c" && arg) { view.innerHTML = '<div class="empty"><span class="spinner"></span>Loading…</div>'; view.innerHTML = await detail(arg); }
    else if (page === "jobs") view.innerHTML = jobs(arg);
    else if (page === "candidates") view.innerHTML = candidates(arg || "passed");
    else if (page === "emails") { view.innerHTML = '<div class="empty"><span class="spinner"></span>Loading…</div>'; view.innerHTML = await emailsPage(); }
    else if (page === "backtest") view.innerHTML = await backtest();
    else view.innerHTML = dashboard();
  } catch (e) {
    view.innerHTML = `<div class="card empty">${esc(e.message)}</div>`;
  }
}
window.addEventListener("hashchange", route);
$("#search").addEventListener("input", () => { if (!/^#\/(c|emails|backtest)/.test(location.hash)) route(); });

// ---------- modals ----------

const modal = (title, html) => { $("#modal").innerHTML = `<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal"><div class="modal-head"><h2>${title}</h2><button class="x" onclick="closeModal()">×</button></div><div id="mbody">${html}</div></div></div>`; };
function closeModal() { $("#modal").innerHTML = ""; load().then(route).catch(() => {}); }

function openUpload(role = "PM") {
  modal("Bulk upload CVs", `
    <label class="f" for="files">CV files (.pdf, .docx, .doc, .txt)</label><input id="files" type="file" multiple accept=".pdf,.docx,.doc,.txt">
    <label class="f" for="urole">Role applied for</label>
    <select id="urole"><option value="PM" ${role === "PM" ? "selected" : ""}>Product Manager</option><option value="Senior PM" ${role === "Senior PM" ? "selected" : ""}>Senior Product Manager</option><option value="">Not sure: detect from each CV</option></select>
    <p class="muted small">Names, emails, phone numbers and links are removed before a CV goes to the AI. Each CV takes about 20 seconds; you can close this and keep working.</p>
    <button class="btn" id="ugo">Upload and screen</button><div id="uprog" style="margin-top:12px"></div>`);
  $("#ugo").onclick = async () => {
    const files = [...$("#files").files];
    if (!files.length) return;
    $("#ugo").disabled = true;
    const r = $("#urole").value || null;
    $("#uprog").innerHTML = files.map((f, i) => `<div class="small" id="up${i}"><span class="spinner"></span>${esc(f.name)}</div>`).join("");
    // Two at a time: each CV already runs 3 extraction calls.
    let next = 0;
    const worker = async () => {
      while (next < files.length) {
        const i = next++, f = files[i];
        try {
          if (f.size > 4 * 1024 * 1024) throw new Error("over 4 MB");
          const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result.split(",")[1]); fr.onerror = rej; fr.readAsDataURL(f); });
          await api("/api/submit", { name: f.name, data: b64, role: r });
          $(`#up${i}`).innerHTML = `✓ ${esc(f.name)} <span class="muted">uploaded, screening</span>`;
        } catch (e) { $(`#up${i}`).innerHTML = `<span style="color:var(--red)">✗ ${esc(f.name)}: ${esc(e.message)}</span>`; }
      }
    };
    await Promise.all([worker(), worker()]);
    $("#uprog").insertAdjacentHTML("beforeend", '<p class="muted small">Done uploading. Results appear on the dashboard as each screening finishes.</p>');
    load().then(route);
  };
}

async function holdOne(id) {
  try { await api("/api/decide", { id, decision: "hold" }); await load(); route(); } catch (e) { alert(e.message); }
}

const draftBlock = (e, name, i) => `<div class="draft-item" data-i="${i}">
  <div class="section-head" style="margin:0"><div><b>${esc(name)}</b> <span class="muted small">${e.kind === "invite" ? "Invite" : "Decline"} · ${e.draftedBy === "ai" ? "AI draft" : "standard template"}</span></div>
    <label class="small"><input type="checkbox" class="inc" checked> send</label></div>
  <label class="f">Subject</label><input class="subj" value="${esc(e.subject)}">
  <details ${i === 0 ? "open" : ""}><summary class="muted small" style="margin-top:8px">Message</summary><textarea class="body" rows="10">${esc(e.body)}</textarea></details>
  <div class="st small muted"></div></div>`;
const recipientLine = (e) => e.sendBlocked ? `<span style="color:var(--red)">${esc(e.sendBlocked)}</span>` : `Will send to <b>${esc(e.willSendTo)}</b>${e.demo ? " (demo mode: all email goes to your own inbox, never the candidate's)" : ""}.`;

async function emailOne(id, decision) {
  const c = data.candidates.find((x) => x.id === id) || {};
  modal(decision === "advance" ? "Invite to interview" : "Send a decline", `<p><span class="spinner"></span>Logging your decision and drafting the email…</p>`);
  try {
    const d = await api("/api/decide", { id, decision });
    $("#mbody").innerHTML = `${draftBlock(d.email, c.name, 0)}<p class="small muted">${recipientLine(d.email)}</p>
      <div class="row-actions"><button class="btn" id="sendbtn" ${d.email.sendBlocked ? "disabled" : ""}>Send email</button><button class="btn ghost" onclick="closeModal()">Not now (keep as draft)</button></div>`;
    $("#sendbtn").onclick = () => sendDrafts([{ email: d.email, name: c.name }]);
  } catch (e) { $("#mbody").innerHTML = `<p style="color:var(--red)">${esc(e.message)}</p>`; }
}

async function emailAllPassed() {
  const list = passedNotEmailed().sort(byMatch);
  if (!list.length) return;
  modal(`Email all passed (${list.length})`, `<p class="muted small">Drafting an invite for each passed candidate who hasn't been emailed. You'll review them all before anything is sent.</p><div id="bprog"></div>`);
  const drafts = [];
  for (const [i, c] of list.entries()) {
    $("#bprog").innerHTML = `<p><span class="spinner"></span>Drafting ${i + 1} of ${list.length}: ${esc(c.name)}…</p>`;
    try { const d = await api("/api/decide", { id: c.id, decision: "advance" }); drafts.push({ email: d.email, name: c.name }); }
    catch (e) { drafts.push({ error: e.message, name: c.name }); }
  }
  const ok = drafts.filter((d) => d.email);
  $("#mbody").innerHTML = `<p class="small muted">${ok.length} invite${ok.length === 1 ? "" : "s"} drafted. Edit or untick any, then send. ${ok[0] ? recipientLine(ok[0].email) : ""}</p>
    ${drafts.map((d, i) => d.email ? draftBlock(d.email, d.name, i) : `<div class="draft-item"><b>${esc(d.name)}</b> <span style="color:var(--red)">${esc(d.error)}</span></div>`).join("")}
    <div class="row-actions"><button class="btn" id="sendall" ${ok.length && !ok[0].email.sendBlocked ? "" : "disabled"}>Send all selected</button><button class="btn ghost" onclick="closeModal()">Not now (keep as drafts)</button></div>`;
  $("#sendall").onclick = () => sendDrafts(drafts);
}

async function sendDrafts(drafts) {
  const items = [...document.querySelectorAll(".draft-item[data-i]")];
  const btn = $("#sendbtn") || $("#sendall"); if (btn) btn.disabled = true;
  let sent = 0;
  for (const el of items) {
    const d = drafts[+el.dataset.i];
    const st = $(".st", el);
    if (!d?.email || !$(".inc", el).checked) { st.textContent = "Not sent (kept as draft)."; continue; }
    st.innerHTML = '<span class="spinner"></span>Sending…';
    try { const r = await api("/api/send", { emailId: d.email.id, subject: $(".subj", el).value, body: $(".body", el).value }); st.innerHTML = `<span class="pill sent">Sent</span> to ${esc(r.to)}`; sent++; }
    catch (e) { st.innerHTML = `<span style="color:var(--red)">${esc(e.message)}</span>`; }
  }
  $("#mbody").insertAdjacentHTML("beforeend", `<p><b>${sent} sent.</b> <a href="#" onclick="closeModal(); return false;">Close</a></p>`);
}

// ---------- CSV export (Milestone 7 audit) ----------

async function downloadCsv(which) {
  const a = await api("/api/audit");
  const rows = a[which];
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  Object.assign(document.createElement("a"), { href: url, download: `hr-tool-${which}-${new Date().toISOString().slice(0, 10)}.csv` }).click();
  URL.revokeObjectURL(url);
}

route();
