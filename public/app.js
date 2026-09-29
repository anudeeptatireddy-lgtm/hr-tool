// HR Tool front end: one page, hash routes, plain JS. Every email goes through a draft the founder reviews and sends.
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const api = async (path, body) => {
  const res = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(j.error || `Request failed (${res.status})`), { status: res.status, data: j });
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
  data = await withRetry(() => api("/api/dashboard"), 3);
  clearTimeout(pollTimer);
  // While any CV is still being screened, check back every few seconds.
  if (data.candidates.some((c) => c.outcome === "screening")) pollTimer = setTimeout(() => load().then(route).catch(() => {}), 5000);
}

// ---------- shared pieces ----------

const matchClass = (m) => (m === null ? "" : m >= 65 ? "m-pass" : m >= 45 ? "m-mid" : "m-fail");
const outcomePill = (c) => {
  if (c.outcome === "screening") return '<span class="pill screening"><span class="spinner"></span>Screening</span>';
  if (c.outcome === "error") return '<span class="pill error">Couldn\'t read</span>';
  if (c.outcome === "review") return `<span class="pill ask" title="Scoring was inconsistent: runs ${esc((c.runTotals || []).join(" / "))}">Needs review</span>`;
  const label = { passed: "Passed", borderline: "Borderline", failed: c.gateFailed ? "Failed gate" : "Failed" }[c.outcome];
  return `<span class="pill ${c.outcome}" title="${esc(c.failedGate)}">${label}</span>`;
};
const statusCell = (c) => {
  if (c.lastSent) return `<span class="pill sent">${{ invite: "Invite sent", decline: "Decline sent", more_info: "Asked for detail" }[c.lastSent.kind]}</span><div class="muted small">${fmtTime(c.lastSent.at)}</div>`;
  if (c.lastDecision) return `<span class="pill ${c.lastDecision.decision === "hold" ? "hold" : "screening"}">${{ advance: "Advanced", decline: "Declined", hold: "On hold", more_info: "Asked for more detail" }[c.lastDecision.decision]}</span><div class="muted small">no email sent</div>`;
  return '<span class="muted small">New</span>';
};
const actionCell = (c) => {
  if (c.match === null) return "";
  if (c.lastSent) return statusCell(c);
  if (c.outcome === "review") return `<button class="btn amber sm" onclick="event.stopPropagation(); location.hash='#/c/${c.id}'">Review</button>`;
  const btn = c.outcome === "passed"
    ? `<button class="btn sm" onclick="event.stopPropagation(); emailOne('${c.id}', 'advance')">Invite</button>`
    : `<button class="btn warn sm" onclick="event.stopPropagation(); emailOne('${c.id}', 'decline')">Send decline</button>`;
  const note = c.lastDecision ? `<div class="muted small">${{ advance: "Advanced", decline: "Declined", hold: "On hold", more_info: "Asked for more detail" }[c.lastDecision.decision]}, not emailed</div>` : "";
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
      <td class="match ${c.needsHumanReview ? "m-mid" : matchClass(c.match)}">${c.match === null ? "—" : c.needsHumanReview ? `<span title="Runs: ${esc((c.runTotals || []).join(" / "))}">${Math.round(c.runRange[0])}–${Math.round(c.runRange[1])}%</span>` : `${Math.round(c.match)}%`}${c.lowConfidence ? `<div><span class="pill ask" title="${esc((c.lowConfidenceReasons || []).join("; "))}">Low confidence</span></div>` : ""}</td>
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
      <div class="card jobs-list" style="margin-bottom:26px">${data.jobs.map((j) => `<a class="job" href="#/jobs/${j.ref}"><b>${esc(j.title)}</b><div class="small muted">${j.received} received · <span style="color:var(--accent-ink)">${j.passed} passed</span>${j.rubricStatus === "approved" ? "" : " · rubric not approved"}</div></a>`).join("")}</div>
      <div class="label">Recent emails</div>
      <div class="feed">${sent.length ? sent.map((c) => `<div class="${c.lastSent.kind === "invite" ? "" : "dec"}"><b>${c.lastSent.kind === "invite" ? "Invite sent" : "Decline sent"}: ${esc(c.name)}</b><span class="muted small">${fmtTime(c.lastSent.at)}</span></div>`).join("") : '<span class="muted small">No emails sent yet.</span>'}</div>
    </section>
  </div>`;
}

function rubricBlock(job) {
  const r = job.rubric;
  if (job.kind === "pattern") {
    return `<div class="label" style="margin-top:14px">Scoring rubric <span class="pill pass" style="margin-left:6px">Back-tested on past hires</span></div>
      <div class="table-wrap"><table><thead><tr><th>Signal</th><th>Weight</th><th>What it looks for</th></tr></thead><tbody>
      ${r.signals.map((s) => `<tr><td><b>${s.key}</b> ${esc(s.name)}</td><td class="match">${s.weight}%</td><td class="small">${esc(s.what)}</td></tr>`).join("")}</tbody></table></div>
      <div class="muted small" style="margin-top:6px">This role is scored against the pattern of Kargo's best past hires, not the JD text; the JD sets the gates.</div>`;
  }
  if (!r) return `<div class="note" style="margin-top:14px">No rubric yet. <button class="btn sm" onclick="regenRubric('${job.ref}')">Generate rubric</button></div>`;
  const approved = job.rubricStatus === "approved";
  return `<div class="label" style="margin-top:14px">Scoring rubric <span class="pill ${approved ? "pass" : "ask"}" style="margin-left:6px">${approved ? "Approved" : "Draft: review before screening"}</span> <span class="muted small">v${job.rubricVersion} · generated from this job's requirements</span></div>
    <div id="rub-${job.ref}">${r.signals.map((s) => `<div class="draft-item" data-key="${s.key}">
      <div class="section-head" style="margin:0;gap:8px"><input class="r-name" value="${esc(s.name)}" style="flex:1;min-width:180px"><label class="small nowrap">Weight <input class="r-weight" type="number" min="0" max="100" value="${s.weight}" style="width:70px">%</label></div>
      <label class="f">What it looks for</label><textarea class="r-what" rows="2">${esc(s.what)}</textarea>
      <details><summary class="muted small" style="margin-top:6px">Score levels and probe question</summary>
        ${["0", "1", "2", "3"].map((k) => `<label class="f">${k} =</label><input class="r-l${k}" value="${esc(s.levels[k])}">`).join("")}
        <label class="f">Probe question</label><input class="r-probe" value="${esc(s.probe || "")}"></details></div>`).join("")}</div>
    <div class="row-actions" style="margin-top:8px"><button class="btn ghost sm" onclick="saveRubricEdits('${job.ref}')">Save changes</button>
      <button class="btn ghost sm" onclick="regenRubric('${job.ref}')">Regenerate from JD</button>
      <button class="btn sm" onclick="approveRubric('${job.ref}')" ${approved ? "disabled" : ""}>${approved ? "Approved" : "Approve rubric"}</button>
      <span class="muted small" id="rubmsg-${job.ref}">Weights must add up to 100. Saving an edit needs approving again.</span></div>`;
}

function jobs(which) {
  const list = which ? data.jobs.filter((j) => j.ref === which) : data.jobs;
  return `<div class="section-head"><div><h1>Jobs</h1><p class="muted" style="margin:0">Each job, how it's scored, and every CV received for it with its date.</p></div><button class="btn" onclick="newJob()">＋ New job</button></div>
  ${list.map((j) => {
    const mine = searchFilter(data.candidates.filter((c) => c.jobRef === j.ref)).sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));
    const canScreen = j.rubricStatus === "approved";
    return `<div class="card pad" style="margin:18px 0 10px">
      <div class="section-head"><div><h2>${esc(j.title)} <span class="muted small">#${esc(j.ref)}</span></h2>
        <div class="muted small">${esc(j.location || "Location not set")} · reports to ${esc(j.reportsTo)} · open since ${fmtDate(j.openedOn)}</div></div>
        <div class="row-actions">${j.jdFile ? `<a class="btn ghost sm" href="${j.jdFile}" download>Download JD</a>` : ""}<button class="btn sm" onclick="openUpload('${j.ref}')" ${canScreen ? "" : "disabled title='Approve the rubric first'"}>Upload CVs</button></div></div>
      <div class="small"><b>Looking for:</b> ${esc(j.requirement)}</div>
      <div class="small" style="margin-top:4px"><b>Gates:</b> ${j.gates.length ? j.gates.map(esc).join(" · ") : "none"}</div>
      ${rubricBlock(j)}
      <div class="small muted" style="margin-top:10px">${j.received} received · ${j.passed} passed</div>
    </div>
    ${candidateTable(mine, { showRole: false, empty: "No CVs received for this job yet." })}`;
  }).join("")}`;
}

function newJob() {
  modal("New job", `<p class="muted small">The rubric is generated from what you write here, then you review and approve it before any CV is screened.</p>
    <label class="f" for="nj-title">Job title</label><input id="nj-title" placeholder="e.g. Customer Success Manager">
    <label class="f" for="nj-loc">Location</label><input id="nj-loc" placeholder="e.g. Mumbai · in-office">
    <label class="f" for="nj-req">Looking for</label><textarea id="nj-req" rows="6" placeholder="Paste the requirements from the job description"></textarea>
    <label class="f" for="nj-min">Gate: minimum years of experience (0 for none)</label><input id="nj-min" type="number" min="0" max="30" value="0">
    <label class="small" style="display:block;margin-top:10px"><input id="nj-mum" type="checkbox" checked> Gate: Mumbai-based or willing to relocate</label>
    <div class="row-actions" style="margin-top:14px"><button class="btn" id="nj-go">Create job and generate rubric</button></div><div id="nj-msg" class="small" style="margin-top:8px"></div>`);
  $("#nj-go").onclick = async () => {
    $("#nj-go").disabled = true; $("#nj-msg").innerHTML = '<span class="spinner"></span>Generating the rubric from your requirements…';
    try {
      const r = await api("/api/jobs", { action: "create", title: $("#nj-title").value, location: $("#nj-loc").value, requirement: $("#nj-req").value, minYears: $("#nj-min").value, requireMumbai: $("#nj-mum").checked });
      $("#modal").innerHTML = ""; await load(); location.hash = `#/jobs/${r.ref}`; route();
      if (r.error) alert(`Job created, but the rubric couldn't be generated: ${r.error}. Use "Generate rubric" to try again.`);
    } catch (e) { $("#nj-msg").innerHTML = `<span style="color:var(--red)">${esc(e.message)}</span>`; $("#nj-go").disabled = false; }
  };
}

function readRubric(ref) {
  return { signals: [...document.querySelectorAll(`#rub-${ref} .draft-item`)].map((el) => ({
    name: $(".r-name", el).value, weight: Number($(".r-weight", el).value), what: $(".r-what", el).value, probe: $(".r-probe", el).value,
    levels: Object.fromEntries(["0", "1", "2", "3"].map((k) => [k, $(`.r-l${k}`, el).value])),
  })) };
}
async function saveRubricEdits(ref) {
  const rub = readRubric(ref), sum = rub.signals.reduce((a, s) => a + s.weight, 0);
  if (sum !== 100) { $(`#rubmsg-${ref}`).innerHTML = `<span style="color:var(--red)">Weights add up to ${sum}, not 100.</span>`; return; }
  try { await api("/api/jobs", { action: "save", ref, rubric: rub }); await load(); route(); } catch (e) { $(`#rubmsg-${ref}`).innerHTML = `<span style="color:var(--red)">${esc(e.message)}</span>`; }
}
async function regenRubric(ref) {
  const m = $(`#rubmsg-${ref}`); if (m) m.innerHTML = '<span class="spinner"></span>Regenerating…';
  try { await api("/api/jobs", { action: "regenerate", ref }); await load(); route(); } catch (e) { alert(e.message); }
}
async function approveRubric(ref) {
  const rub = readRubric(ref), sum = rub.signals.reduce((a, s) => a + s.weight, 0);
  const job = data.jobs.find((x) => x.ref === ref);
  // Unsaved edits must be saved (and so versioned) before approval.
  if (JSON.stringify(rub.signals.map((s) => [s.name, s.weight, s.what])) !== JSON.stringify(job.rubric.signals.map((s) => [s.name, s.weight, s.what]))) {
    $(`#rubmsg-${ref}`).innerHTML = '<span style="color:var(--red)">Save your changes first, then approve.</span>'; return;
  }
  if (sum !== 100) { $(`#rubmsg-${ref}`).innerHTML = `<span style="color:var(--red)">Weights add up to ${sum}, not 100.</span>`; return; }
  try { await api("/api/jobs", { action: "approve", ref }); await load(); route(); } catch (e) { alert(e.message); }
}

function candidates(tab = "passed") {
  const all = searchFilter(data.candidates);
  const groups = {
    passed: all.filter((c) => c.outcome === "passed").sort(byMatch),
    borderline: all.filter((c) => c.outcome === "borderline").sort(byMatch),
    failed: all.filter((c) => c.outcome === "failed").sort(byMatch),
    review: all.filter((c) => c.outcome === "review").sort(byMatch),
    other: all.filter((c) => c.outcome === "screening" || c.outcome === "error"),
  };
  const names = { passed: "Passed (65%+)", borderline: "Borderline (45–64%)", failed: "Failed", review: "Needs review", other: "Screening / unreadable" };
  const pending = passedNotEmailed().length;
  return `<div class="section-head"><div><h1>Candidates</h1><div class="muted small">Passed = 65%+ and all gates met. Failed = under 45% or a gate not met. Needs review = the 3 scoring runs disagreed by more than 10 points. Nothing is emailed until you send it.</div></div>
    <div class="row-actions"><button class="btn ghost" onclick="openUpload()">Bulk upload CVs</button><button class="btn" onclick="emailAllPassed()" ${pending ? "" : "disabled"}>Email all passed${pending ? ` (${pending})` : ""}</button></div></div>
  <div class="tabs">${Object.keys(groups).map((k) => `<a href="#/candidates/${k}" class="${k === tab ? "on" : ""}">${names[k]}<span class="n">${groups[k].length}</span></a>`).join("")}</div>
  ${candidateTable(groups[tab] || [], { empty: tab === "passed" ? "No one has passed yet." : "Nobody in this list." })}`;
}

async function detail(id) {
  const j = await api(`/api/result?id=${id}`);
  if (j.status === "running") return `<a href="#/candidates">← Candidates</a><div class="card empty"><span class="spinner"></span>Still screening this CV…</div>`;
  if (j.status !== "done") return `<a href="#/candidates">← Candidates</a><div class="card empty">${esc(j.error || "This CV couldn't be screened.")}</div>`;
  if (j.result.kind === "generated") return genericDetail(id, j.result);
  const r = j.result, rr = r.roles[r.roleUsed], card = r.card, sig = r.scored.signals;
  const row = data.candidates.find((c) => c.id === id) || {};
  const gateRows = (x) => x.gates.map((g) => `<div><span class="pill ${g.status}">${g.status}</span> ${esc(g.name)} <span class="muted small">${esc(g.detail)}</span></div>`).join("");
  return `<a href="#/candidates">← Candidates</a>
  <div class="grid2 detail" style="margin-top:12px">
    <section>
      <div class="card pad">
        <div class="headline"><div class="ini" style="width:38px;height:38px">${esc(initials(r.candidate.name))}</div>${esc(r.candidate.name || "Name not found")}
          <span class="match ${row.needsHumanReview ? "m-mid" : matchClass(rr.total)}">${row.needsHumanReview ? `${Math.round(row.runRange[0])}–${Math.round(row.runRange[1])}% match` : `${Math.round(rr.total)}% match`}</span> ${outcomePill(row)}</div>
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
    ${decisionPanel(id, row)}
  </div>`;
}

function decisionPanel(id, row) {
  const review = row.needsHumanReview ? `<div class="note"><b>Needs review: scoring was inconsistent.</b> The 3 runs gave ${esc((row.runTotals || []).join(" / "))}%, a spread of ${Math.round(row.runRange[1] - row.runRange[0])} points. The shown score is the middle run; check the evidence before deciding.</div>` : "";
  const low = row.lowConfidence ? `<div class="note"><b>Low confidence.</b> ${esc((row.lowConfidenceReasons || []).join(". "))}. Consider asking the candidate for more detail before deciding.</div>` : "";
  return `<section>
      <div class="label">Your decision</div>
      ${review}${low}
      <div class="card pad">
        <div class="muted small" style="margin-bottom:10px">Currently: ${statusCell(row)}</div>
        <div class="row-actions">
          <button class="btn" onclick="emailOne('${id}', 'advance')">Advance + draft invite</button>
          <button class="btn amber" onclick="holdOne('${id}')">Hold</button>
          <button class="btn warn" onclick="emailOne('${id}', 'decline')">Decline + draft email</button>
        </div>
        <div class="row-actions" style="margin-top:8px"><button class="btn ghost" onclick="emailOne('${id}', 'more_info')">${row.lowConfidence ? "Ask for more detail (recommended)" : "Ask for more detail"}</button></div>
        <p class="muted small">Each of these drafts an email for you to review. It's only sent when you click Send.</p>
      </div>
    </section>`;
}

function genericDetail(id, r) {
  const s = r.summary, card = r.card, row = data.candidates.find((c) => c.id === id) || {};
  return `<a href="#/candidates">← Candidates</a>
  <div class="grid2 detail" style="margin-top:12px">
    <section>
      <div class="card pad">
        <div class="headline"><div class="ini" style="width:38px;height:38px">${esc(initials(r.candidate.name))}</div>${esc(r.candidate.name || "Name not found")}
          <span class="match ${row.needsHumanReview ? "m-mid" : matchClass(s.match)}">${row.needsHumanReview ? `${Math.round(row.runRange[0])}–${Math.round(row.runRange[1])}% match` : `${Math.round(s.match)}% match`}</span> ${outcomePill(row)}</div>
        <div class="muted small" style="margin-top:4px">${esc(s.jobTitle)} · rubric v${s.rubricVersion} · received ${row.receivedAt ? fmtDate(row.receivedAt) : ""} · ${esc(r.file)}</div>
        <h3>Why ranked here</h3>
        <ul class="plain">${card.why.map((w) => `<li>${esc(w.line)}<blockquote>“${esc(w.quote)}”</blockquote></li>`).join("") || "<li class='muted'>No signal scored above 0.</li>"}</ul>
        <h3>Risk</h3><p>${esc(card.risk)}</p>
        <h3>Probe questions</h3><ul class="plain">${card.probes.map((p) => `<li>${esc(p.ask)}</li>`).join("")}</ul>
        ${s.gates.length ? `<h3>Gates</h3>${s.gates.map((g) => `<div><span class="pill ${g.status}">${g.status}</span> ${esc(g.name)} <span class="muted small">${esc(g.detail)}</span></div>`).join("")}` : ""}
      </div>
      <div class="card" style="margin-top:16px"><div class="pad"><h2>Signal scores (0–3)</h2></div><div class="table-wrap"><table>
        <thead><tr><th>Signal</th><th>Weight</th><th>Score</th><th>Why, and the CV line it rests on</th></tr></thead>
        <tbody>${r.scored.signals.map((x) => `<tr><td>${esc(x.name)}</td><td>${x.weight}%</td><td class="match">${x.score}</td><td>${esc(x.reason)}${x.quote ? `<blockquote>“${esc(x.quote)}”</blockquote>` : ""}</td></tr>`).join("")}</tbody></table></div>
        <div class="pad muted small">3 runs: ${r.runTotals.join(" / ")} (median kept).${r.scored.flags.length ? ` ${r.scored.flags.length} item(s) had no matching CV quote and got no credit.` : ""}</div></div>
      <div class="card pad" style="margin-top:16px"><details><summary class="muted">Extracted evidence (what scoring saw)</summary><pre>${esc(JSON.stringify(r.evidence, null, 2))}</pre></details></div>
    </section>
    ${decisionPanel(id, row)}
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

function openUpload(jobRef = "KRG-PM-01") {
  modal("Bulk upload CVs", `
    <label class="f" for="files">CV files (.pdf, .docx, .doc, .txt)</label><input id="files" type="file" multiple accept=".pdf,.docx,.doc,.txt">
    <label class="f" for="urole">Job applied for</label>
    <select id="urole">${data.jobs.filter((j) => j.rubricStatus === "approved").map((j) => `<option value="${j.ref}" ${j.ref === jobRef ? "selected" : ""}>${esc(j.title)} (#${esc(j.ref)})</option>`).join("")}<option value="">Kargo PM or Senior PM: detect from each CV</option></select>
    <p class="muted small">Names, emails, phone numbers and links are removed before a CV goes to the AI. CVs are screened 2 at a time (about 20 seconds each), with automatic retries.</p>
    <button class="btn" id="ugo">Upload and screen</button><div id="uprog" style="margin-top:12px"></div>`);
  $("#ugo").onclick = () => {
    const files = [...$("#files").files];
    if (!files.length) return;
    $("#ugo").disabled = true;
    const jobRef = $("#urole").value || null;
    $("#uprog").innerHTML = `<p class="small" id="uqsum"></p>` + files.map((f, i) => `<div class="small" id="up${i}">${esc(f.name)} <span class="muted">queued</span></div>`).join("")
      + '<p class="muted small">Keep this page open until the queue finishes. You can close this box; the queue keeps going.</p>';
    runUploadQueue(files, jobRef);
  };
}

// ---------- upload queue ----------
// At most UPLOAD_CONCURRENCY CVs are being screened at once: a file isn't started until an earlier one has
// finished screening (not just uploading), so the server never has more than a few screenings in flight.
// Each step retries with backoff, and one failed file never stops the rest.
const UPLOAD_CONCURRENCY = 2;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withRetry(fn, tries = 3) {
  for (let k = 0; ; k++) {
    try { return await fn(); }
    catch (e) {
      // Don't retry what won't change: a bad file, an unknown job, an unapproved rubric.
      if (k >= tries - 1 || (e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429)) throw e;
      await sleep(1000 * 2 ** k);
    }
  }
}
const setUp = (i, html) => { const el = document.getElementById(`up${i}`); if (el) el.innerHTML = html; };

async function screenOneFile(f, i, jobRef) {
  const name = esc(f.name);
  try {
    if (f.size > 4 * 1024 * 1024) throw new Error("over 4 MB");
    setUp(i, `<span class="spinner"></span>${name} <span class="muted">uploading…</span>`);
    const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result.split(",")[1]); fr.onerror = rej; fr.readAsDataURL(f); });
    // The server answers 429 when it's busy; wait and try again (up to ~30s) rather than failing the file.
    const s = await withRetry(() => api("/api/submit", jobRef ? { name: f.name, data: b64, jobRef } : { name: f.name, data: b64, role: null }), 6);
    const t0 = Date.now();
    for (;;) {
      setUp(i, `<span class="spinner"></span>${name} <span class="muted">screening… ${Math.round((Date.now() - t0) / 1000)}s</span>`);
      await sleep(3000);
      const r = await withRetry(() => api(`/api/result?id=${s.id}`), 4);
      if (r.status === "done") {
        const m = r.result?.summary?.match ?? r.result?.roles?.[r.result.roleUsed]?.total;
        setUp(i, `✓ ${name} <span class="muted">screened${typeof m === "number" ? `: ${Math.round(m)}%` : ""}</span>`);
        return true;
      }
      if (r.status === "error") throw new Error(r.error || "screening failed");
      if (Date.now() - t0 > 5 * 60_000) throw new Error("still screening after 5 minutes; check the dashboard later");
    }
  } catch (e) {
    setUp(i, `<span style="color:var(--red)">✗ ${name}: ${esc(e.message)}</span> <button class="btn ghost sm" id="rt${i}">Retry</button>`);
    const btn = document.getElementById(`rt${i}`);
    if (btn) btn.onclick = () => runUploadQueue([f], jobRef, [i]);
    return false;
  }
}

async function runUploadQueue(files, jobRef, slots = files.map((_, i) => i)) {
  let next = 0, ok = 0, bad = 0;
  const sum = () => { const el = $("#uqsum"); if (el) el.innerHTML = `<b>${ok + bad} of ${files.length} done</b>${bad ? ` · ${bad} failed` : ""}${ok + bad < files.length ? ` · screening ${UPLOAD_CONCURRENCY} at a time` : ""}`; };
  sum();
  const worker = async () => {
    while (next < files.length) {
      const k = next++;
      (await screenOneFile(files[k], slots[k], jobRef)) ? ok++ : bad++;
      sum();
      load().then(() => { if (!$("#modal").innerHTML) route(); }).catch(() => {});
    }
  };
  await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, files.length) }, worker));
}

async function holdOne(id) {
  try { await api("/api/decide", { id, decision: "hold" }); await load(); route(); } catch (e) { alert(e.message); }
}

// Same pattern as src/placeholders.ts (the server refuses these too).
const PLACEHOLDER_RE = /\[[^\]\n]{1,60}\]|\{\{[^}\n]{0,60}\}\}|\{[a-z_][a-z0-9_]{0,40}\}|<[A-Z][A-Z0-9_ ]{1,40}>|\b(?:TODO|TBD|XXX)\b/g;
const SCHEDULING_LINK = "[SCHEDULING LINK]";
const findPlaceholders = (...t) => [...new Set(t.flatMap((x) => x.match(PLACEHOLDER_RE) || []))];
const validUrl = (u) => /^https?:\/\/[^\s.]+\.[^\s]{2,}$/.test(u.trim());

const draftBlock = (e, name, i) => `<div class="draft-item" data-i="${i}" data-blocked="${e.sendBlocked ? 1 : 0}">
  <div class="section-head" style="margin:0"><div><b>${esc(name)}</b> <span class="muted small">${{ invite: "Invite", decline: "Decline", more_info: "Request for more detail" }[e.kind]} · ${e.draftedBy === "ai" ? "AI draft" : "standard template"}</span></div>
    <label class="small"><input type="checkbox" class="inc" checked> send</label></div>
  ${e.body.includes(SCHEDULING_LINK) ? `<label class="f">Scheduling link <span style="color:var(--red)">*</span></label><input class="link" placeholder="https://calendly.com/… (required: fills in [SCHEDULING LINK])" data-prev="">` : ""}
  <label class="f">Subject</label><input class="subj" value="${esc(e.subject)}">
  <details ${i === 0 ? "open" : ""}><summary class="muted small" style="margin-top:8px">Message</summary><textarea class="body" rows="10">${esc(e.body)}</textarea></details>
  <div class="ph small" style="color:var(--red);margin-top:6px"></div>
  <div class="st small muted"></div></div>`;

/** Fills the scheduling link into the message, and re-checks every draft; Send is enabled only when all ticked drafts are clean. */
function checkDrafts() {
  let ready = 0, blocked = 0;
  for (const el of document.querySelectorAll(".draft-item[data-i]")) {
    const link = $(".link", el), body = $(".body", el);
    if (link) {
      const v = link.value.trim(), prev = link.dataset.prev;
      if (validUrl(v) && v !== prev) { body.value = body.value.split(prev || SCHEDULING_LINK).join(v); link.dataset.prev = v; }
      else if (!validUrl(v) && prev) { body.value = body.value.split(prev).join(SCHEDULING_LINK); link.dataset.prev = ""; }
    }
    const needLink = link && !validUrl(link.value);
    // The scheduling placeholder is covered by the "add the scheduling link" message; list only the others.
    const left = findPlaceholders($(".subj", el).value, body.value).filter((p) => !(needLink && p === SCHEDULING_LINK));
    $(".ph", el).innerHTML = left.length || needLink ? `Can't send yet: ${needLink ? "add the scheduling link" : ""}${needLink && left.length ? "; " : ""}${left.length ? `replace ${left.map((p) => `<code>${esc(p)}</code>`).join(", ")} in the ${findPlaceholders($(".subj", el).value).length ? "subject/" : ""}message` : ""}.` : "";
    if (!$(".inc", el).checked) continue;
    if (left.length || needLink || el.dataset.blocked === "1") blocked++; else ready++;
  }
  const btn = $("#sendbtn") || $("#sendall");
  if (btn) { btn.disabled = blocked > 0 || ready === 0; btn.title = blocked ? "Fix the drafts marked in red first" : ""; }
}
function wireDrafts() {
  $("#mbody").addEventListener("input", checkDrafts);
  $("#mbody").addEventListener("change", checkDrafts);
  checkDrafts();
}
const recipientLine = (e) => e.sendBlocked ? `<span style="color:var(--red)">${esc(e.sendBlocked)}</span>` : `Will send to <b>${esc(e.willSendTo)}</b>${e.demo ? " (demo mode: all email goes to your own inbox, never the candidate's)" : ""}.`;

async function emailOne(id, decision, confirmBelowThreshold = false) {
  const c = data.candidates.find((x) => x.id === id) || {};
  const title = { advance: "Invite to interview", decline: "Send a decline", more_info: "Ask for more detail" }[decision];
  // Below the pass threshold, ask before anything is logged or drafted. The server enforces this too.
  if (decision === "advance" && !confirmBelowThreshold && typeof c.match === "number" && c.match < data.threshold) return confirmLowAdvance(id, c.match, data.threshold);
  modal(title, `<p><span class="spinner"></span>Logging your decision and drafting the email…</p>`);
  try {
    let d;
    try { d = await api("/api/decide", { id, decision, confirmBelowThreshold }); }
    catch (e) { if (e.data?.needsConfirmation) return confirmLowAdvance(id, e.data.match, e.data.threshold); throw e; }
    $("#mbody").innerHTML = `${draftBlock(d.email, c.name, 0)}<p class="small muted">${recipientLine(d.email)}</p>
      <div class="row-actions"><button class="btn" id="sendbtn" ${d.email.sendBlocked ? "disabled" : ""}>Send email</button><button class="btn ghost" onclick="closeModal()">Not now (keep as draft)</button></div>`;
    $("#sendbtn").onclick = () => sendDrafts([{ email: d.email, name: c.name }]);
    wireDrafts();
  } catch (e) { $("#mbody").innerHTML = `<p style="color:var(--red)">${esc(e.message)}</p>`; }
}

function confirmLowAdvance(id, match, threshold) {
  modal("Advance below threshold?", `<p>This candidate scored <b>${Math.round(match)}%</b>, below your <b>${threshold}%</b> threshold. Advance anyway?</p>
    <p class="muted small">Nothing has been logged or drafted yet. If you continue, the decision log records that you advanced them below the threshold.</p>
    <div class="row-actions"><button class="btn" id="advAnyway">Advance anyway</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>`);
  $("#advAnyway").onclick = () => emailOne(id, "advance", true);
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
  const needsLink = ok.some((d) => d.email.body.includes(SCHEDULING_LINK));
  $("#mbody").innerHTML = `<p class="small muted">${ok.length} invite${ok.length === 1 ? "" : "s"} drafted. Edit or untick any, then send. ${ok[0] ? recipientLine(ok[0].email) : ""}</p>
    ${needsLink ? `<label class="f">Scheduling link for all invites <span style="color:var(--red)">*</span></label><input id="bulklink" placeholder="https://calendly.com/… (fills every invite)">` : ""}
    ${drafts.map((d, i) => d.email ? draftBlock(d.email, d.name, i) : `<div class="draft-item"><b>${esc(d.name)}</b> <span style="color:var(--red)">${esc(d.error)}</span></div>`).join("")}
    <div class="row-actions"><button class="btn" id="sendall" ${ok.length && !ok[0].email.sendBlocked ? "" : "disabled"}>Send all selected</button><button class="btn ghost" onclick="closeModal()">Not now (keep as drafts)</button></div>`;
  $("#sendall").onclick = () => sendDrafts(drafts);
  const bl = $("#bulklink");
  if (bl) bl.addEventListener("input", () => { document.querySelectorAll(".draft-item .link").forEach((x) => { x.value = bl.value; }); });
  wireDrafts();
}

async function sendDrafts(drafts) {
  const items = [...document.querySelectorAll(".draft-item[data-i]")];
  const btn = $("#sendbtn") || $("#sendall"); if (btn) btn.disabled = true;
  let sent = 0;
  for (const el of items) {
    const d = drafts[+el.dataset.i];
    const st = $(".st", el);
    if (!d?.email || !$(".inc", el).checked) { st.textContent = "Not sent (kept as draft)."; continue; }
    if (findPlaceholders($(".subj", el).value, $(".body", el).value).length) { st.innerHTML = '<span style="color:var(--red)">Not sent: placeholders left.</span>'; continue; }
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
