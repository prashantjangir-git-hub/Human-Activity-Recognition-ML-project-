/* main.js — ES 335 HAR project. Every number shown comes from docs/data/*.json, written by analysis.ipynb. */
"use strict";

const ACTS = ["WALKING", "WALKING_UPSTAIRS", "WALKING_DOWNSTAIRS", "SITTING", "STANDING", "LAYING"];
const NICE = { WALKING: "Walking", WALKING_UPSTAIRS: "Upstairs", WALKING_DOWNSTAIRS: "Downstairs",
               SITTING: "Sitting", STANDING: "Standing", LAYING: "Laying" };
const COLOR = { WALKING: "#2563eb", WALKING_UPSTAIRS: "#0891b2", WALKING_DOWNSTAIRS: "#7c3aed",
                SITTING: "#dc2626", STANDING: "#d97706", LAYING: "#16a34a" };
const SHORT_MODEL = { "Majority Class (Baseline)": "Baseline", "Logistic Regression": "Log. reg.",
                      "Random Forest": "Random forest", "SVM (RBF)": "SVM", "k-Nearest Neighbours": "k-NN" };

const $ = id => document.getElementById(id);
const f3 = x => Number(x).toFixed(3);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function loadJSON(name) {
  // data/data.js (written by the notebook) puts every result file in window.HAR_DATA, so the page
  // works even when opened directly from disk; fetch() is only a fallback.
  if (window.HAR_DATA && window.HAR_DATA[name]) return window.HAR_DATA[name];
  const r = await fetch(`data/${name}`);
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  return r.json();
}

/* Horizontal bar rows (used for several charts) */
function barRows(el, rows, { max, fmt = v => v, labelWidth = 150 } = {}) {
  const m = max ?? Math.max(...rows.map(r => r.value));
  el.innerHTML = rows.map(r => `
    <div class="hbar-row" ${r.title ? `title="${esc(r.title)}"` : ""}>
      <span class="hbar-label" style="width:${labelWidth}px">${esc(r.label)}</span>
      <div class="hbar-track">${(r.parts || [{ value: r.value, color: r.color }]).map(p =>
        `<div class="hbar-fill" style="width:${(p.value / m) * 100}%;background:${p.color}"></div>`).join("")}</div>
      <span class="hbar-val">${r.text ?? fmt(r.value)}</span>
    </div>`).join("");
}

/* ── Navbar, counters, scroll fade ── */
function initChrome() {
  const links = $("navLinks");
  $("navBurger")?.addEventListener("click", () => links.classList.toggle("open"));
  links.querySelectorAll("a").forEach(a => a.addEventListener("click", () => links.classList.remove("open")));
  initScrollSpy(links);

  const counterObs = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target, target = +el.dataset.target;
      let cur = 0; const step = Math.ceil(target / 50);
      const t = setInterval(() => { cur = Math.min(cur + step, target); el.textContent = cur.toLocaleString(); if (cur >= target) clearInterval(t); }, 20);
      counterObs.unobserve(el);
    }
  }, { threshold: 0.5 });
  document.querySelectorAll("[data-target]").forEach(el => counterObs.observe(el));

  const fadeObs = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("visible"); fadeObs.unobserve(e.target); }
  }, { threshold: 0.05 });
  document.querySelectorAll(".card, .stat-card").forEach(el => { el.classList.add("animate-on-scroll"); fadeObs.observe(el); });
}

/* ── Navbar: highlight the link of the section currently on screen ── */
function initScrollSpy(links) {
  const navLinks = [...links.querySelectorAll("a.nav-a")];
  const items = navLinks.map(a => ({ a, sec: document.getElementById(a.getAttribute("href").slice(1)) })).filter(x => x.sec);
  let current = null, lockUntil = 0, ticking = false;
  const setActive = a => {
    if (a === current) return;
    current?.classList.remove("active"); current?.removeAttribute("aria-current");
    current = a;
    if (a) { a.classList.add("active"); a.setAttribute("aria-current", "true"); }
  };
  const update = () => {
    ticking = false;
    if (Date.now() < lockUntil) return;          // a click is still smooth-scrolling to its target
    const y = window.scrollY + 90;                // just below the sticky header
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
    let found = null;
    for (const it of items) if (it.sec.offsetTop <= y) found = it.a;
    setActive(atBottom ? items[items.length - 1].a : found);
  };
  window.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  window.addEventListener("resize", update);
  window.addEventListener("scrollend", () => { lockUntil = 0; update(); });
  navLinks.forEach(a => a.addEventListener("click", () => {
    setActive(a);                                 // highlight the clicked link right away
    lockUntil = Date.now() + 1200;                // don't flicker through the sections passed on the way
    a.classList.remove("nav-pop"); void a.offsetWidth; a.classList.add("nav-pop");
  }));
  update();
}

/* ── Data section ── */
function renderClassDist(d) {
  const max = Math.max(...d.train_counts);
  $("classDistChart").innerHTML = d.labels.map((l, i) => `
    <div class="hbar-row"><span class="hbar-label" style="width:95px">${NICE[l]}</span>
      <div class="hbar-track double">
        <div class="hbar-fill" style="width:${d.train_counts[i] / max * 100}%;background:${COLOR[l]}"></div>
        <div class="hbar-fill" style="width:${d.test_counts[i] / max * 100}%;background:${COLOR[l]}55"></div></div>
      <span class="hbar-val" style="width:80px">${d.train_counts[i]} / ${d.test_counts[i]}</span></div>`).join("");
}

function renderFeatureGroups() {
  // Counted from features.txt (see notebook Step 2b)
  const groups = [
    ["Body acceleration (t, f, jerk)", 40 + 40 + 79 + 79], ["Gyroscope (t, f, jerk)", 40 + 40 + 79],
    ["Gravity acceleration (t)", 40], ["Signal magnitudes (t, f)", 13 * 9], ["Angles between vectors", 7],
  ];
  barRows($("featureGroups"), groups.map(([l, v]) => ({ label: l, value: v, color: "#2563eb" })), { labelWidth: 190 });
}

function renderPCA(d) {
  const c = $("pcaCanvas"), ctx = c.getContext("2d"), W = c.width, H = c.height, pad = 46;
  const [x0, x1] = [Math.min(...d.pc1), Math.max(...d.pc1)], [y0, y1] = [Math.min(...d.pc2), Math.max(...d.pc2)];
  const X = x => pad + (x - x0) / (x1 - x0) * (W - 2 * pad - 140), Y = y => H - pad - (y - y0) / (y1 - y0) * (H - 2 * pad);
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(0,0,0,0.15)"; ctx.beginPath(); ctx.moveTo(pad, pad); ctx.lineTo(pad, H - pad); ctx.lineTo(W - pad - 140, H - pad); ctx.stroke();
  d.pc1.forEach((v, i) => { ctx.fillStyle = COLOR[d.activity[i]] + "99"; ctx.beginPath(); ctx.arc(X(v), Y(d.pc2[i]), 2.4, 0, 7); ctx.fill(); });
  ctx.font = "12px Inter, sans-serif"; ctx.textAlign = "left";
  ACTS.forEach((a, i) => { ctx.fillStyle = COLOR[a]; ctx.fillRect(W - 150, 30 + i * 22, 11, 11); ctx.fillStyle = "#333"; ctx.fillText(NICE[a], W - 133, 40 + i * 22); });
  ctx.fillStyle = "#666"; ctx.textAlign = "center";
  ctx.fillText(`PC1 (${(d.explained_variance[0] * 100).toFixed(1)}% of variance)`, (W - 140) / 2, H - 12);
  ctx.save(); ctx.translate(14, H / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(`PC2 (${(d.explained_variance[1] * 100).toFixed(1)}%)`, 0, 0); ctx.restore();
  $("pcaNote").textContent = `${d.pc1.length.toLocaleString()} sampled training windows. PC1 + PC2 explain ${((d.explained_variance[0] + d.explained_variance[1]) * 100).toFixed(1)}% of the variance.`;
}

/* ── Evaluation: leakage chart ── */
function renderLeak(rows) {
  $("leakChart").innerHTML = rows.map(r => `
    <div class="leak-row">
      <div class="leak-name">${esc(SHORT_MODEL[r.Model] || r.Model)}</div>
      <div class="leak-bars">
        ${[["Random K-fold", r["Random window K-fold"], "#cbd5e1"], ["Grouped by person", r["Subject-grouped K-fold"], "#2563eb"]].map(([l, v, col]) => `
          <div class="hbar-row"><span class="hbar-label" style="width:130px">${l}</span>
            <div class="hbar-track"><div class="hbar-fill" style="width:${((v - 0.8) / 0.2) * 100}%;background:${col}"></div></div>
            <span class="hbar-val">${f3(v)}</span></div>`).join("")}
      </div>
      <div class="leak-gap">+${(r.Inflation * 100).toFixed(1)} pts</div>
    </div>`).join("") + `<p class="axis-note">Bars start at 0.80 macro-F1 to make the gap visible.</p>`;
}

/* ── Results table ── */
function renderResults(rows, dm) {
  const sel = rows.find(r => r.Selected);
  $("resultsTableBody").innerHTML = rows.map(r => `
    <tr class="${r.Selected ? "best-row" : ""}">
      <td>${esc(r.Model)}${r.Selected ? ' <span class="tag-selected">selected by CV</span>' : ""}</td>
      <td>${f3(r["CV Macro-F1 (mean)"])} <span class="muted-small">± ${f3(r["CV Macro-F1 (std)"])}</span></td>
      <td><strong>${f3(r["Test Macro-F1"])}</strong></td>
      <td><div class="ci"><div class="ci-bar" style="left:${r["CI low"] * 100}%;width:${(r["CI high"] - r["CI low"]) * 100}%"></div>
          <div class="ci-dot" style="left:${r["Test Macro-F1"] * 100}%"></div></div>
          <span class="muted-small">${f3(r["CI low"])}–${f3(r["CI high"])}</span></td>
      <td>${f3(r["Test Accuracy"])}</td>
      <td>${f3(r["Train Macro-F1"])}</td>
    </tr>`).join("");
  $("heroResult").innerHTML = `Selected model: <strong>${esc(sel.Model)}</strong> · test macro-F1 <strong>${f3(sel["Test Macro-F1"])}</strong>
    on 9 unseen people (95% interval ${f3(sel["CI low"])}–${f3(sel["CI high"])}) · majority baseline ${f3(rows[0]["Test Macro-F1"])}${dm ? ` · simple 8-feature baseline ${f3(dm.test_f1)}` : ""}`;
}

/* ── Confusion matrix explorer ── */
let CM = null, cmModel = null;
function initCM(cm, selectedModel) {
  CM = cm; cmModel = selectedModel;
  const sel = $("modelSelect");
  sel.innerHTML = Object.keys(cm).map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join("");
  sel.value = cmModel;
  sel.addEventListener("change", () => { cmModel = sel.value; renderCM(); });
  renderCM();
}
function renderCM() {
  const { labels, matrix } = CM[cmModel], grid = $("cmGrid");
  const short = { WALKING: "WALK", WALKING_UPSTAIRS: "UP", WALKING_DOWNSTAIRS: "DOWN", SITTING: "SIT", STANDING: "STAND", LAYING: "LAY" };
  grid.style.gridTemplateColumns = `64px repeat(${labels.length}, var(--cm-cell))`;
  let html = `<div class="cm-corner">true ↓</div>` + labels.map(l => `<div class="cm-head">${short[l]}</div>`).join("");
  matrix.forEach((row, ri) => {
    const tot = row.reduce((a, b) => a + b, 0);
    html += `<div class="cm-rowhead">${short[labels[ri]]}</div>`;
    row.forEach((v, ci) => {
      const share = tot ? v / tot : 0;
      const bg = ri === ci ? `rgba(37,99,235,${0.12 + share * 0.75})` : v ? `rgba(220,38,38,${Math.min(0.9, 0.12 + share * 4)})` : "rgba(0,0,0,0.03)";
      const fg = (ri === ci && share > 0.5) || (ri !== ci && share > 0.15) ? "#fff" : "#1a1917";
      html += `<button class="cm-cell" style="background:${bg};color:${fg}" data-ri="${ri}" data-ci="${ci}"
                aria-label="true ${labels[ri]}, predicted ${labels[ci]}: ${v}">${v}</button>`;
    });
  });
  grid.innerHTML = html;
  grid.querySelectorAll(".cm-cell").forEach(cell => cell.addEventListener("click", () => {
    grid.querySelectorAll(".cm-cell").forEach(c => c.classList.remove("selected"));
    cell.classList.add("selected");
    showCell(+cell.dataset.ri, +cell.dataset.ci);
  }));
}
function showCell(ri, ci) {
  const { labels, matrix, report } = CM[cmModel];
  const t = labels[ri], p = labels[ci], v = matrix[ri][ci], tot = matrix[ri].reduce((a, b) => a + b, 0);
  const across = Object.entries(CM).filter(([n]) => !n.startsWith("Majority")).map(([n, d]) => ({ label: SHORT_MODEL[n], value: d.matrix[ri][ci], color: n === cmModel ? "#2563eb" : "#94a3b8" }));
  const rep = a => `P ${f3(report[a].precision)} · R ${f3(report[a].recall)} · F1 ${f3(report[a]["f1-score"])}`;
  let why;
  if (ri === ci) why = `Recall for ${NICE[t]} is ${(v / tot * 100).toFixed(1)}%.`;
  else if ((t === "SITTING" && p === "STANDING") || (t === "STANDING" && p === "SITTING"))
    why = "Both are still postures, so the main cue is phone orientation relative to gravity, and that overlaps between people (see the Errors section).";
  else if (t.startsWith("WALKING") && p.startsWith("WALKING"))
    why = "Walking on flat ground and on stairs produce similar periodic motion in a 2.56 s window.";
  else if (t === "LAYING") why = "Rare for most models: laying has a very different gravity direction. Compare the models below.";
  else why = "An uncommon mix-up. Compare the models below to see if it is systematic.";
  $("cmDetail").innerHTML = `
    <h4>${ri === ci ? "Correct" : "Mistake"}: true ${NICE[t]} → predicted ${NICE[p]}</h4>
    <div class="cm-stat">${v}</div>
    <p class="muted-small">windows, ${(v / tot * 100).toFixed(1)}% of all true ${NICE[t]} windows (${esc(cmModel)})</p>
    <p style="font-size:0.85rem;margin:0.7rem 0">${why}</p>
    <p class="muted-small"><strong>${NICE[t]}</strong>: ${rep(t)}${ri !== ci ? `<br><strong>${NICE[p]}</strong>: ${rep(p)}` : ""}</p>
    <p class="muted-small" style="margin-top:0.8rem"><strong>Same cell in every model:</strong></p>
    <div id="cellAcross" class="bar-chart"></div>`;
  barRows($("cellAcross"), across, { labelWidth: 100, max: Math.max(1, ...across.map(a => a.value)) });
}

/* ── Feature importance ── */
let FI = null;
function initFI(fi) {
  FI = fi;
  document.querySelectorAll("[data-fi]").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll("[data-fi]").forEach(x => x.classList.toggle("active", x === b));
    renderFI(...b.dataset.fi.split("|"));
  }));
  renderFI("Random Forest", "top");
}
function renderFI(model, view) {
  const el = $("fiChart"), note = $("fiNote");
  if (view === "groups") {
    const names = Object.keys(FI["Random Forest"].groups);
    el.innerHTML = names.map(g => {
      const rf = FI["Random Forest"].groups[g], lr = FI["Logistic Regression"].groups[g] ?? 0;
      return `<div class="hbar-row"><span class="hbar-label" style="width:190px">${esc(g)}</span>
        <div class="hbar-track double"><div class="hbar-fill" style="width:${rf / 0.4 * 100}%;background:#2563eb"></div>
        <div class="hbar-fill" style="width:${lr / 0.4 * 100}%;background:#d97706"></div></div>
        <span class="hbar-val">${(rf * 100).toFixed(0)}% / ${(lr * 100).toFixed(0)}%</span></div>`;
    }).join("") + `<p class="axis-note"><span style="color:#2563eb">■</span> random forest &nbsp; <span style="color:#d97706">■</span> logistic regression (share of total |weight|)</p>`;
    note.textContent = "Both models lean heavily on gravity (phone orientation) and frequency-domain features. Logistic regression spreads more weight onto gyroscope features.";
    return;
  }
  const { features, importance } = FI[model];
  barRows(el, features.map((f, i) => ({ label: f, value: importance[i], color: f.startsWith("tGravity") || f.startsWith("angle") ? "#16a34a" : f.startsWith("f") ? "#7c3aed" : "#2563eb" })),
    { labelWidth: 230, fmt: v => v.toFixed(3) });
  note.innerHTML = `<span style="color:#16a34a">■</span> gravity / angle &nbsp; <span style="color:#7c3aed">■</span> frequency domain &nbsp; <span style="color:#2563eb">■</span> other time domain. ` +
    (model === "Random Forest" ? "All of the random forest's top 10 are gravity or angle features (mean decrease in impurity)." :
      "Mean absolute weight across the 6 classes, on standardised features.");
}

/* ── Errors ── */
function renderErrorPairs(e) {
  barRows($("errorPairs"), e.top_pairs.map(p => ({ label: `${NICE[p.true]} → ${NICE[p.pred]}`, value: p.n, color: COLOR[p.true],
    text: `${p.n} (${Math.round(p.n / e.n_errors * 100)}%)` })), { labelWidth: 170 });
}
function renderSubjects(ps) {
  const errs = Object.fromEntries(ps.errors.map(r => [r.subject, r]));
  const totalSS = ps.errors.reduce((a, r) => a + r.sit_stand, 0);
  $("subjChart").innerHTML = ps.rows.map(r => {
    const h = Math.max(4, (r["Macro-F1"] - 0.75) / 0.25 * 100);
    return `<button class="subj-bar" data-s="${r.Subject}" title="Subject ${r.Subject}: ${f3(r["Macro-F1"])}">
      <span class="subj-val">${r["Macro-F1"].toFixed(2)}</span>
      <span class="subj-fill" style="height:${h}%;background:${r["Macro-F1"] < 0.9 ? "#dc2626" : "#2563eb"}"></span>
      <span class="subj-id">${r.Subject}</span></button>`;
  }).join("") + `<p class="axis-note" style="grid-column:1/-1">Test person ID · bars start at 0.75</p>`;
  $("subjChart").querySelectorAll(".subj-bar").forEach(b => b.addEventListener("click", () => {
    $("subjChart").querySelectorAll(".subj-bar").forEach(x => x.classList.toggle("selected", x === b));
    const r = ps.rows.find(x => x.Subject === +b.dataset.s), e = errs[r.Subject];
    $("subjDetail").innerHTML = `<strong>Subject ${r.Subject}</strong>: ${r.Windows} windows, macro-F1 ${f3(r["Macro-F1"])}, accuracy ${f3(r.Accuracy)}.
      ${e.error} errors, of which ${e.sit_stand} are sitting ↔ standing (${totalSS ? Math.round(e.sit_stand / totalSS * 100) : 0}% of all such confusions).`;
  }));
}
let HIST = null, histOn = null;
function initHist(e) {
  HIST = e;
  const cols = { "SITTING, correct": "#dc2626", "SITTING -> predicted STANDING": "#f9a8d4", "STANDING, correct": "#d97706", "STANDING -> predicted SITTING": "#fcd34d" };
  HIST.colors = cols;
  histOn = new Set(["SITTING, correct", "SITTING -> predicted STANDING", "STANDING, correct"]);
  $("histToggles").innerHTML = Object.keys(cols).map(k => `<button class="btn-toggle ${histOn.has(k) ? "active" : ""}" data-h="${esc(k)}">
    <span style="color:${cols[k]}">■</span> ${esc(k.replace("->", "→"))} (n=${e.hist[k].reduce((a, b) => a + b, 0)})</button>`).join("");
  $("histToggles").querySelectorAll("[data-h]").forEach(b => b.addEventListener("click", () => {
    const k = b.dataset.h; histOn.has(k) ? histOn.delete(k) : histOn.add(k); b.classList.toggle("active"); drawHist();
  }));
  drawHist();
}
function drawHist() {
  const c = $("histCanvas"), ctx = c.getContext("2d"), W = c.width, H = c.height, pad = 40;
  const edges = HIST.bin_edges, nb = edges.length - 1;
  // focus on the populated range
  const used = Object.values(HIST.hist).reduce((acc, h) => h.map((v, i) => acc[i] + v), new Array(nb).fill(0));
  let lo = used.findIndex(v => v > 0), hi = nb - 1 - [...used].reverse().findIndex(v => v > 0);
  lo = Math.max(0, lo - 1); hi = Math.min(nb - 1, hi + 1);
  const dens = {}; let ymax = 0;
  for (const k of histOn) { const h = HIST.hist[k], n = h.reduce((a, b) => a + b, 0) || 1; dens[k] = h.map(v => v / n); ymax = Math.max(ymax, ...dens[k]); }
  ctx.clearRect(0, 0, W, H);
  const X = i => pad + (i - lo) / (hi - lo + 1) * (W - 2 * pad), bw = (W - 2 * pad) / (hi - lo + 1);
  for (const k of histOn) {
    ctx.fillStyle = HIST.colors[k] + "aa";
    for (let i = lo; i <= hi; i++) { const h = dens[k][i] / (ymax || 1) * (H - 2 * pad); ctx.fillRect(X(i) + 1, H - pad - h, bw - 2, h); }
  }
  ctx.strokeStyle = "#999"; ctx.beginPath(); ctx.moveTo(pad, H - pad); ctx.lineTo(W - pad, H - pad); ctx.stroke();
  ctx.fillStyle = "#666"; ctx.font = "11px Inter, sans-serif"; ctx.textAlign = "center";
  for (let i = lo; i <= hi + 1; i += 3) ctx.fillText(edges[i].toFixed(2), X(i), H - pad + 15);
  ctx.fillText(`${HIST.key_feature} (share of each group's windows per bin)`, W / 2, H - 6);
  // medians
  ctx.setLineDash([4, 3]);
  for (const k of histOn) {
    const m = HIST.medians[k], pos = pad + (m - edges[lo]) / (edges[hi + 1] - edges[lo]) * (W - 2 * pad);
    ctx.strokeStyle = HIST.colors[k]; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(pos, pad - 10); ctx.lineTo(pos, H - pad); ctx.stroke();
  }
  ctx.setLineDash([]); ctx.lineWidth = 1;
  ctx.textAlign = "left"; ctx.fillStyle = "#666"; ctx.fillText("dashed lines = group medians", pad, pad - 16);
}

/* ── Demo: real logistic regression ── */
let DM = null;
const DEMO_LABELS = {
  "tBodyAcc-std()-X": "Body acc X · std (shake)", "tBodyAccMag-mean()": "Body acc magnitude · mean",
  "tGravityAcc-mean()-X": "Gravity X · mean (upright?)", "tGravityAcc-mean()-Y": "Gravity Y · mean (tilt)",
  "tGravityAcc-mean()-Z": "Gravity Z · mean (tilt)", "tBodyAccJerk-std()-Z": "Jerk Z · std",
  "tBodyGyro-std()-Y": "Gyro Y · std (rotation)", "fBodyAccMag-meanFreq()": "Acc magnitude · mean frequency",
};
const sid = f => "sl_" + f.replace(/[^a-z0-9]/gi, "_");
function initDemo(dm) {
  DM = dm;
  initFigure();
  $("demoF1").textContent = f3(dm.test_f1);
  $("slidersGrid").innerHTML = dm.features.map((f, i) => `
    <div class="slider-item">
      <label for="${sid(f)}">${esc(DEMO_LABELS[f] || f)} <span class="slider-val" id="v_${sid(f)}"></span></label>
      <input type="range" id="${sid(f)}" min="${dm.ranges[i][0]}" max="${dm.ranges[i][1]}" step="0.01" value="${dm.presets.STANDING[i]}">
      <div class="slider-code">${esc(f)}</div>
    </div>`).join("");
  dm.features.forEach(f => $(sid(f)).addEventListener("input", () => { $("windowInfo").hidden = true; $("windowSelect").value = ""; predict(); }));
  $("presetButtons").innerHTML = ACTS.map(a => `<button class="btn-preset" data-p="${a}">${NICE[a]}</button>`).join(" ");
  $("presetButtons").querySelectorAll("[data-p]").forEach(b => b.addEventListener("click", () => { setVals(dm.presets[b.dataset.p]); $("windowInfo").hidden = true; $("windowSelect").value = ""; }));
  const opt = (w, i, withTrue) => `<option value="${i}">${w.full_model_pred !== w.true ? "✗ " : ""}${withTrue ? `${NICE[w.true]} → predicted ${NICE[w.full_model_pred]} · ` : ""}Subject ${w.subject} · row ${w.row}</option>`;
  const all = dm.windows.map((w, i) => [w, i]);
  const errs = all.filter(([w]) => w.error_example);
  $("windowSelect").innerHTML = `<option value="">— choose —</option>` +
    (errs.length ? `<optgroup label="Mistakes by the full model (representative errors)">${errs.map(([w, i]) => opt(w, i, true)).join("")}</optgroup>` : "") +
    ACTS.map(a => `<optgroup label="Random ${NICE[a]} windows">` +
      all.filter(([w]) => w.true === a && !w.error_example).map(([w, i]) => opt(w, i, false)).join("") + "</optgroup>").join("");
  $("windowSelect").addEventListener("change", e => e.target.value !== "" && loadWindow(+e.target.value));
  $("randomWindow").addEventListener("click", () => { const i = Math.floor(Math.random() * dm.windows.length); $("windowSelect").value = i; loadWindow(i); });
  setVals(dm.presets.STANDING);
}
function setVals(vals) { DM.features.forEach((f, i) => { $(sid(f)).value = vals[i]; }); predict(); }
function loadWindow(i) {
  const w = DM.windows[i]; setVals(w.values);
  const demoPred = predict();
  const ok = (a, b) => a === b ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>';
  $("windowInfo").hidden = false;
  $("windowInfo").innerHTML = `Real window from test subject ${w.subject} (row ${w.row}). True activity: <strong>${NICE[w.true]}</strong>.
    8-feature demo model says <strong>${NICE[demoPred]}</strong> ${ok(demoPred, w.true)} · full 561-feature model says <strong>${NICE[w.full_model_pred]}</strong> ${ok(w.full_model_pred, w.true)}.
    Now move a slider to see what would change the answer.`;
}
/* ── Cartoon figure that acts out the demo model's top prediction (illustration only) ── */
const LEN = { T: 50, HEAD: 13, UA: 27, LA: 25, TH: 36, SH: 36 };
const FIG = { pred: "STANDING", conf: 1, second: null, cur: null, el: {}, t0: 0, last: 0, changedAt: 0,
              running: false, visible: true,
              reduce: !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) };

function stairsPath(dir) {           // dir = +1: going up to the right, -1: going down to the right
  const w = 28, h = 16, x0 = -56, n = (150 - x0) / w;
  let d = `M ${x0} ${190 + dir * n * h}`;
  for (let x = x0; x < 360; x += w) d += ` h ${w} v ${-dir * h}`;
  return d + ` L 400 300 L ${x0} 300 Z`;
}
function limbSVG(id, l1, l2, back, isLeg) {
  const c = `fig-limb${back ? " back" : ""}`;
  const end = isLeg ? `<line x1="0" y1="${l2}" x2="8" y2="${l2}" class="${c}"/>`
                    : `<circle cx="0" cy="${l2}" r="4.5" class="fig-hand${back ? " back" : ""}"/>`;
  return `<g id="${id}"><line x1="0" y1="0" x2="0" y2="${l1}" class="${c}"/>
    <g id="${id}2"><line x1="0" y1="0" x2="0" y2="${l2}" class="${c}"/>${end}</g></g>`;
}
function initFigure() {
  const stage = $("figureStage");
  if (!stage) return;
  // Prefer the 3D stick-man model; fall back to the 2D drawing if WebGL or the model is unavailable
  if (window.HARFigure3D && HARFigure3D.available()) {
    try { FIG.three = HARFigure3D.create(stage); } catch (e) { console.warn("3D figure unavailable:", e); FIG.three = null; }
    if (FIG.three) return;
  }
  const headY = -LEN.T - LEN.HEAD - 2;
  stage.innerHTML = `
  <svg viewBox="0 0 300 220" id="figSvg" role="img" aria-label="Cartoon figure acting out the prediction">
    <line id="propFloor" class="fig-prop fig-floor on" x1="0" y1="190" x2="300" y2="190"/>
    <line id="propWalk" class="fig-prop fig-dash" x1="0" y1="198" x2="300" y2="198"/>
    <g id="propUp" class="fig-prop"><path id="stairsUp" class="fig-stairs" d="${stairsPath(1)}"/></g>
    <g id="propDown" class="fig-prop"><path id="stairsDown" class="fig-stairs" d="${stairsPath(-1)}"/></g>
    <g id="propChair" class="fig-prop">
      <rect class="fig-furn" x="98" y="100" width="7" height="60" rx="3"/>
      <rect class="fig-furn" x="98" y="154" width="50" height="7" rx="3"/>
      <rect class="fig-furn" x="101" y="161" width="5" height="29"/><rect class="fig-furn" x="140" y="161" width="5" height="29"/>
    </g>
    <g id="propBed" class="fig-prop">
      <rect class="fig-furn" x="74" y="174" width="200" height="11" rx="4"/>
      <rect class="fig-furn" x="78" y="185" width="6" height="5"/><rect class="fig-furn" x="264" y="185" width="6" height="5"/>
      <ellipse class="fig-pillow" cx="112" cy="171" rx="22" ry="6"/>
    </g>
    <g id="figRoot">
      ${limbSVG("legB", LEN.TH, LEN.SH, true, true)}
      <g id="armBwrap" transform="translate(0,${-LEN.T + 4})">${limbSVG("armB", LEN.UA, LEN.LA, true, false)}</g>
      <line id="figTorso" class="fig-torso" x1="0" y1="0" x2="0" y2="${-LEN.T}"/>
      ${limbSVG("legF", LEN.TH, LEN.SH, false, true)}
      <g id="figHead" transform="translate(0,${headY})">
        <circle class="fig-head" r="${LEN.HEAD}"/>
        <circle cx="5" cy="-3" r="1.8" fill="#334155"/>
        <path class="fig-face" d="M 2 5 Q 6 8 10 4"/>
      </g>
      <g id="armFwrap" transform="translate(0,${-LEN.T + 4})">${limbSVG("armF", LEN.UA, LEN.LA, false, false)}</g>
    </g>
    <text id="propZzz" class="fig-prop fig-zzz" x="122" y="138"><tspan>z</tspan><tspan dx="3" dy="-7">z</tspan><tspan dx="3" dy="-7">z</tspan></text>
    <g id="figBubble" class="fig-prop fig-bubble">
      <circle cx="196" cy="70" r="3"/><circle cx="205" cy="60" r="4.5"/>
      <ellipse cx="238" cy="36" rx="58" ry="22"/>
      <text id="bubbleText1" x="238" y="33">?</text><text id="bubbleText2" x="238" y="47"></text>
    </g>
  </svg>`;
  for (const id of ["figRoot", "legF", "legF2", "legB", "legB2", "armF", "armF2", "armB", "armB2", "figTorso", "figHead",
    "propFloor", "propWalk", "propUp", "propDown", "propChair", "propBed", "propZzz", "figBubble", "stairsUp", "stairsDown",
    "bubbleText1", "bubbleText2", "figSvg"]) FIG.el[id] = document.getElementById(id);
  FIG.el.legF2.setAttribute("transform", `translate(0,${LEN.TH})`);
  FIG.t0 = FIG.last = FIG.changedAt = performance.now();
  new IntersectionObserver(es => { FIG.visible = es[0].isIntersecting; if (FIG.visible) startFigure(); }).observe(stage);
  startFigure();
}
// Joint angles in degrees. Legs/arms hang down at 0; negative swings them forward (figure faces right).
function figTarget(act, t) {
  const br = Math.sin(t * 2.2);
  if (act === "WALKING") {
    const p = t * 2 * Math.PI * 1.4, s = Math.sin(p), c = Math.cos(p);
    return { hx: 150, hy: 113 + 5 * Math.abs(s), root: 5, lt: -28 * s, ls: 8 + 34 * Math.max(0, c), bt: 28 * s, bs: 8 + 34 * Math.max(0, -c),
             la1: 24 * s, la2: -28, ba1: -24 * s, ba2: -28 };
  }
  if (act === "WALKING_UPSTAIRS") {
    const p = t * 2 * Math.PI * 1.0, s = Math.sin(p), c = Math.cos(p);
    return { hx: 150, hy: 112 + 3 * Math.abs(s), root: 12, lt: -28 - 26 * s, ls: 18 + 50 * Math.max(0, c), bt: -28 + 26 * s, bs: 18 + 50 * Math.max(0, -c),
             la1: 20 * s, la2: -40, ba1: -20 * s, ba2: -40 };
  }
  if (act === "WALKING_DOWNSTAIRS") {
    const p = t * 2 * Math.PI * 1.2, s = Math.sin(p), c = Math.cos(p);
    return { hx: 150, hy: 115 + 3 * Math.abs(s), root: -6, lt: -14 - 22 * s, ls: 10 + 30 * Math.max(0, c), bt: -14 + 22 * s, bs: 10 + 30 * Math.max(0, -c),
             la1: 14 * s - 8, la2: -20, ba1: -14 * s - 8, ba2: -20 };
  }
  if (act === "SITTING")
    return { hx: 128, hy: 151 + 0.5 * br, root: -4, lt: -88, ls: 88, bt: -92, bs: 92, la1: -12, la2: -55, ba1: -8, ba2: -60 };
  if (act === "LAYING")
    return { hx: 178, hy: 167 + 0.6 * br, root: -90, lt: 0, ls: 0, bt: 3, bs: 0, la1: 4, la2: 0, ba1: -4, ba2: 0 };
  return { hx: 150, hy: 116 + 0.5 * br, root: 0, lt: -3, ls: 3, bt: 4, bs: 3, la1: -5 + 1.5 * br, la2: -10, ba1: 6, ba2: -10 };  // STANDING
}
function startFigure() {
  if (FIG.running || !FIG.el.figRoot) return;
  FIG.running = true; FIG.last = performance.now();
  requestAnimationFrame(figLoop);
}
function figLoop(now) {
  if (!FIG.visible) { FIG.running = false; return; }
  const dt = Math.min(0.05, (now - FIG.last) / 1000); FIG.last = now;
  const t = FIG.reduce ? 0 : (now - FIG.t0) / 1000;
  const tgt = figTarget(FIG.pred, t);
  if (!FIG.cur) FIG.cur = { ...tgt };
  const k = 1 - Math.exp(-dt * (now - FIG.changedAt < 800 ? 6 : 30));
  for (const key in tgt) FIG.cur[key] += (tgt[key] - FIG.cur[key]) * k;
  const P = FIG.cur, E = FIG.el;
  E.figRoot.setAttribute("transform", `translate(${P.hx.toFixed(1)},${P.hy.toFixed(1)}) rotate(${P.root.toFixed(1)})`);
  E.legF.setAttribute("transform", `rotate(${P.lt.toFixed(1)})`); E.legF2.setAttribute("transform", `translate(0,${LEN.TH}) rotate(${P.ls.toFixed(1)})`);
  E.legB.setAttribute("transform", `rotate(${P.bt.toFixed(1)})`); E.legB2.setAttribute("transform", `translate(0,${LEN.TH}) rotate(${P.bs.toFixed(1)})`);
  E.armF.setAttribute("transform", `rotate(${P.la1.toFixed(1)})`); E.armF2.setAttribute("transform", `translate(0,${LEN.UA}) rotate(${P.la2.toFixed(1)})`);
  E.armB.setAttribute("transform", `rotate(${P.ba1.toFixed(1)})`); E.armB2.setAttribute("transform", `translate(0,${LEN.UA}) rotate(${P.ba2.toFixed(1)})`);
  // moving scenery
  const up = (t * 2.0) % 1, down = (t * 2.4) % 1;
  E.stairsUp.setAttribute("transform", `translate(${(-28 * up).toFixed(1)},${(16 * up).toFixed(1)})`);
  E.stairsDown.setAttribute("transform", `translate(${(-28 * down).toFixed(1)},${(-16 * down).toFixed(1)})`);
  E.propWalk.style.strokeDashoffset = ((t * 70) % 24).toFixed(1);
  requestAnimationFrame(figLoop);
}
function setFigure(pred, conf, second) {
  const unsure3 = conf < 0.6;
  const caption = unsure3 ? `Unsure: ${NICE[pred]} ${(conf * 100).toFixed(0)}% vs ${NICE[second]}`
                          : `Acting out: ${NICE[pred]} (${(conf * 100).toFixed(0)}% sure)`;
  if (FIG.three) { FIG.three.set(pred, conf, second, COLOR[pred], NICE); $("figureCaption").textContent = caption; return; }
  if (!FIG.el.figRoot) return;
  if (pred !== FIG.pred) FIG.changedAt = performance.now();
  FIG.pred = pred; FIG.conf = conf;
  const E = FIG.el, on = (el, v) => el.classList.toggle("on", v);
  on(E.propFloor, !pred.startsWith("WALKING_")); on(E.propWalk, pred === "WALKING");
  on(E.propUp, pred === "WALKING_UPSTAIRS"); on(E.propDown, pred === "WALKING_DOWNSTAIRS");
  on(E.propChair, pred === "SITTING"); on(E.propBed, pred === "LAYING"); on(E.propZzz, pred === "LAYING");
  E.figTorso.style.stroke = COLOR[pred];
  const unsure = conf < 0.6;
  on(E.figBubble, unsure);
  E.bubbleText1.textContent = unsure ? `${NICE[pred]}?` : "";
  E.bubbleText2.textContent = unsure ? `or ${NICE[second]}?` : "";
  E.figSvg.setAttribute("aria-label", `Cartoon figure acting out the prediction: ${NICE[pred]}`);
  $("figureCaption").textContent = unsure
    ? `Unsure: ${NICE[pred]} ${(conf * 100).toFixed(0)}% vs ${NICE[second]}`
    : `Acting out: ${NICE[pred]} (${(conf * 100).toFixed(0)}% sure)`;
  startFigure();
}

function predict() {
  const x = DM.features.map((f, i) => { const v = +$(sid(f)).value; $("v_" + sid(f)).textContent = v.toFixed(2); return (v - DM.mean[i]) / DM.scale[i]; });
  const logits = DM.coef.map((w, k) => w.reduce((s, wj, j) => s + wj * x[j], DM.intercept[k]));
  const mx = Math.max(...logits), ex = logits.map(l => Math.exp(l - mx)), sum = ex.reduce((a, b) => a + b, 0);
  const probs = DM.classes.map((c, k) => [c, ex[k] / sum]).sort((a, b) => b[1] - a[1]);
  $("predValue").textContent = NICE[probs[0][0]];
  setFigure(probs[0][0], probs[0][1], probs[1][0]);
  $("predValue").style.color = COLOR[probs[0][0]];
  $("confBars").innerHTML = probs.map(([c, p]) => `
    <div class="conf-bar-row"><div class="conf-bar-label">${NICE[c]}</div>
      <div class="conf-bar-track"><div class="conf-bar-fill" style="width:${p * 100}%;background:${COLOR[c]}"></div></div>
      <div class="conf-bar-pct">${(p * 100).toFixed(0)}%</div></div>`).join("");
  return probs[0][0];
}

/* ── Init ── */
document.addEventListener("DOMContentLoaded", async () => {
  initChrome();
  renderFeatureGroups();
  try {
    const [cls, pca, cmp, cm, fi, ps, leak, err, dm] = await Promise.all([
      "class_distribution.json", "pca_clusters.json", "model_comparison.json", "confusion_matrices.json",
      "feature_importance.json", "per_subject.json", "cv_leakage.json", "error_analysis.json", "demo_model.json"].map(loadJSON));
    renderClassDist(cls); renderPCA(pca); renderLeak(leak); renderResults(cmp, dm);
    initCM(cm, cmp.find(r => r.Selected).Model); initFI(fi);
    renderErrorPairs(err); renderSubjects(ps); initHist(err); initDemo(dm);
  } catch (e) {
    console.error(e);
    $("loadError").hidden = false;
    $("heroResult").textContent = "Results not loaded (see the note at the top of the page).";
  }
});
