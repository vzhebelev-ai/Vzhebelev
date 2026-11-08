/* global EXERCISES, WARMUP, DAYS, EXTRA, PROGRESSION, targetReps */
"use strict";

// ---------- Хранилище ----------
const KEY = "workout-tracker.v1";
const DEFAULT_STATE = { sessions: [], draft: null, settings: { startDate: "", rest: 90 } };

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const s = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_STATE), ...s, settings: { ...DEFAULT_STATE.settings, ...(s.settings || {}) } };
  } catch (e) {
    return structuredClone(DEFAULT_STATE);
  }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* хранилище недоступно */ }
}

let state = load();
let tab = (location.hash || "").slice(1) || "workout";
let ui = { day: null, confirm: null, reportPeriod: "6w", reportEx: "pullups", openHist: null };

// ---------- Утилиты ----------
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const parseISO = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const fmtDate = (s, opts = { day: "numeric", month: "short" }) => parseISO(s).toLocaleDateString("ru-RU", opts);
const fmtNum = (n) => Math.round(n).toLocaleString("ru-RU");
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const unitLabel = (ex) => (ex.unit === "sec" ? "сек" : "повт");
const range = (ex) => (ex.min === ex.max ? `${ex.min}` : `${ex.min}–${ex.max}`);
const scheme = (ex) => `${ex.sets}×${range(ex)}${ex.unit === "sec" ? " сек" : ""}${ex.perSide ? "/сторону" : ""}`;
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function startDate() {
  if (state.settings.startDate) return state.settings.startDate;
  const first = [...state.sessions].sort((a, b) => a.date.localeCompare(b.date))[0];
  return first ? first.date : todayISO();
}
function weekInfo(dateStr = todayISO()) {
  const days = Math.floor((parseISO(dateStr) - parseISO(startDate())) / 86400000);
  const abs = Math.max(1, Math.floor(days / 7) + 1);
  return { abs, cycle: Math.floor((abs - 1) / 6) + 1, week: ((abs - 1) % 6) + 1 };
}
function progressionText(week) {
  return (PROGRESSION.find((p) => p.weeks.includes(week)) || PROGRESSION[0]).text;
}
function sortedSessions() {
  return [...state.sessions].sort((a, b) => (b.date + b.finishedAt).localeCompare(a.date + a.finishedAt));
}
function suggestedDay() {
  const last = sortedSessions()[0];
  if (!last) return "A";
  return { A: "B", B: "C", C: "A" }[last.day] || "A";
}
// Последние выполненные подходы упражнения
function lastPerformance(exId, beforeId) {
  for (const s of sortedSessions()) {
    if (s.id === beforeId) continue;
    const it = s.items.find((i) => i.id === exId);
    if (it && it.sets.some((x) => x.done)) return { date: s.date, sets: it.sets.filter((x) => x.done) };
  }
  return null;
}
function setsSummary(sets, ex) {
  const reps = sets.map((x) => x.r).join(", ");
  const ws = [...new Set(sets.map((x) => +x.w || 0))];
  const unit = ex && ex.unit === "sec" ? " сек" : "";
  if (ws.length === 1 && ws[0] === 0) return reps + unit;
  if (ws.length === 1) return `${reps}${unit} × ${ws[0]} кг`;
  return sets.map((x) => `${x.r}${+x.w ? "×" + x.w : ""}`).join(", ") + (unit ? unit : "");
}

// ---------- Черновик тренировки ----------
function makeItem(exId, week) {
  const ex = EXERCISES[exId];
  const last = lastPerformance(exId);
  const w = last ? Math.max(...last.sets.map((s) => +s.w || 0)) : ex.defaultWeight;
  const r = targetReps(ex, week);
  return { id: exId, sets: Array.from({ length: ex.sets }, () => ({ r, w, done: false })) };
}
function newDraft(day) {
  const date = todayISO();
  const { week } = weekInfo(date);
  return {
    id: uid(), day, date,
    warmup: Object.fromEntries(WARMUP.map((id) => [id, false])),
    items: DAYS[day].exercises.map((id) => makeItem(id, week)),
    shoulder: false, ankle: false, note: "",
  };
}
function currentDraft() {
  if (!state.draft) state.draft = newDraft(ui.day || suggestedDay());
  return state.draft;
}
const draftStarted = (d) => d.items.some((i) => i.sets.some((s) => s.done)) || Object.values(d.warmup).some(Boolean);

// ---------- Таймер отдыха ----------
let timerEnd = 0, timerId = null;
function startTimer(sec) {
  timerEnd = Date.now() + sec * 1000;
  $("#timer").hidden = false;
  $("#timer").classList.remove("finished");
  clearInterval(timerId);
  tickTimer();
  timerId = setInterval(tickTimer, 250);
}
function tickTimer() {
  const left = Math.max(0, Math.round((timerEnd - Date.now()) / 1000));
  $("#timerTime").textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  if (left === 0) {
    clearInterval(timerId);
    $("#timer").classList.add("finished");
    $("#timerTime").textContent = "Пора!";
    try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) { /* ignore */ }
    setTimeout(() => { if (Date.now() >= timerEnd) $("#timer").hidden = true; }, 4000);
  }
}
function stopTimer() { clearInterval(timerId); $("#timer").hidden = true; }

// ---------- Отрисовка ----------
function render() {
  document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-current", b.dataset.tab === tab ? "page" : "false"));
  const wi = weekInfo();
  $("#weekPill").textContent = `Неделя ${wi.week}/6${wi.cycle > 1 ? ` · цикл ${wi.cycle}` : ""}`;
  const view = $("#view");
  view.innerHTML = { workout: viewWorkout, history: viewHistory, report: viewReport, plan: viewPlan }[tab]();
}

function techBlock(ex) {
  return `<details class="tech"><summary>Техника</summary>
    <ul>${ex.cues.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
    <a href="${ex.video}" target="_blank" rel="noopener">Видео с техникой на YouTube ↗</a></details>`;
}

function viewWorkout() {
  const d = currentDraft();
  const started = draftStarted(d);
  const wi = weekInfo(d.date);
  const sugg = suggestedDay();
  const daySeg = Object.entries(DAYS).map(([k, v]) => `
    <button type="button" data-act="day" data-day="${k}" aria-pressed="${d.day === k}">
      День ${k}${k === sugg ? ' <span class="tag">● следующий</span>' : ""}<small>${esc(v.name)}</small>
    </button>`).join("");

  const lastFlags = sortedSessions()[0];
  const alerts = [];
  if (lastFlags && lastFlags.shoulder) alerts.push("В прошлый раз плечо ныло — снизьте вес на жимах и махах на шаг.");
  if (lastFlags && lastFlags.ankle) alerts.push("В прошлый раз был отёк/боль в голеностопе — шаг назад по нагрузке на ногу.");

  const warmDone = WARMUP.filter((id) => d.warmup[id]).length;
  const warm = WARMUP.map((id) => {
    const ex = EXERCISES[id];
    return `<label class="check ${d.warmup[id] ? "on" : ""}">
      <input type="checkbox" data-act="warm" data-id="${id}" ${d.warmup[id] ? "checked" : ""}>
      <span>${esc(ex.name)}</span><span class="sr">${scheme(ex)}</span></label>`;
  }).join("");

  const cards = d.items.map((it, idx) => {
    const ex = EXERCISES[it.id];
    const done = it.sets.filter((s) => s.done).length;
    const last = lastPerformance(it.id, d.id);
    const rows = it.sets.map((s, si) => `
      <div class="set ${s.done ? "done" : ""}">
        <span class="set-n">${si + 1}</span>
        <label class="field"><input type="number" inputmode="numeric" min="0" step="1" aria-label="${unitLabel(ex)}, подход ${si + 1}"
          id="r-${idx}-${si}" data-act="r" data-i="${idx}" data-s="${si}" value="${esc(s.r)}"><span>${unitLabel(ex)}</span></label>
        <label class="field"><input type="number" inputmode="decimal" min="0" step="0.5" aria-label="кг, подход ${si + 1}"
          id="w-${idx}-${si}" data-act="w" data-i="${idx}" data-s="${si}" value="${esc(s.w)}"><span>кг</span></label>
        <button type="button" class="tick" data-act="tick" data-i="${idx}" data-s="${si}" aria-label="Отметить подход ${si + 1}">✓</button>
      </div>`).join("");
    return `<section class="panel">
      <div class="ex-head">
        <div>
          <div class="ex-title">${esc(ex.name)}</div>
          <div class="ex-meta"><b>${scheme(ex)}</b>${ex.weight ? " · " + esc(ex.weight) : ""} · цель недели: <b>${targetReps(ex, wi.week)} ${unitLabel(ex)}</b></div>
          ${last ? `<div class="ex-meta">Прошлый раз (${fmtDate(last.date)}): ${esc(setsSummary(last.sets, ex))}</div>` : ""}
        </div>
        <span class="ex-count ${done >= it.sets.length ? "full" : ""}">${done}/${it.sets.length}</span>
      </div>
      ${ex.note ? `<div class="note">${esc(ex.note)}</div>` : ""}
      <div class="sets">${rows}</div>
      <div class="set-actions">
        <button type="button" class="btn ghost small" data-act="addset" data-i="${idx}">+ подход</button>
        ${it.sets.length > 1 ? `<button type="button" class="btn ghost small" data-act="delset" data-i="${idx}">− подход</button>` : ""}
        ${EXTRA.includes(it.id) || !DAYS[d.day].exercises.includes(it.id) ? `<button type="button" class="btn ghost small" data-act="delex" data-i="${idx}">Убрать упражнение</button>` : ""}
      </div>
      ${techBlock(ex)}
    </section>`;
  }).join("");

  const extraOpts = Object.entries(EXERCISES)
    .filter(([id]) => !WARMUP.includes(id) && !d.items.some((i) => i.id === id))
    .map(([id, ex]) => `<option value="${id}">${esc(ex.name)}${EXTRA.includes(id) ? " (после 10 ноября)" : ""}</option>`).join("");

  const totalSets = d.items.reduce((a, i) => a + i.sets.length, 0);
  const doneSets = d.items.reduce((a, i) => a + i.sets.filter((s) => s.done).length, 0);

  return `
    <div class="seg" role="group" aria-label="День программы">${daySeg}</div>
    ${ui.confirm === "switch" ? `<div class="confirm"><span>Текущая тренировка начата. Сбросить отметки и перейти на день ${ui.pendingDay}?</span>
      <button type="button" class="btn danger small" data-act="switch-yes">Сбросить</button>
      <button type="button" class="btn ghost small" data-act="cancel">Отмена</button></div>` : ""}
    <div class="row spread">
      <label class="row small muted">Дата <input type="date" id="draftDate" data-act="date" value="${d.date}"></label>
      <span class="small muted num">Неделя ${wi.week}: ${esc(progressionText(wi.week))}</span>
    </div>
    ${alerts.map((a) => `<div class="note">${esc(a)}</div>`).join("")}
    <section class="panel">
      <div class="ex-head"><h2>Разминка плеча · 5 мин</h2><span class="ex-count ${warmDone === WARMUP.length ? "full" : ""}">${warmDone}/${WARMUP.length}</span></div>
      <div class="checks">${warm}</div>
    </section>
    ${cards}
    <section class="panel flat">
      <label class="small muted" for="addEx">Добавить упражнение</label>
      <div class="row"><select id="addEx">${extraOpts}</select><button type="button" class="btn ghost small" data-act="addex">Добавить</button></div>
    </section>
    <section class="panel">
      <h2>Самочувствие</h2>
      <div class="toggles">
        <label class="check ${d.shoulder ? "on" : ""}"><input type="checkbox" data-act="flag" data-f="shoulder" ${d.shoulder ? "checked" : ""}><span>Левое плечо ноет</span></label>
        <label class="check ${d.ankle ? "on" : ""}"><input type="checkbox" data-act="flag" data-f="ankle" ${d.ankle ? "checked" : ""}><span>Отёк или боль в голеностопе</span></label>
      </div>
      <label class="small muted" for="draftNote">Заметка</label>
      <textarea id="draftNote" data-act="note" placeholder="Как прошло, что поменять">${esc(d.note)}</textarea>
    </section>
    ${ui.confirm === "reset" ? `<div class="confirm"><span>Удалить все отметки этой тренировки?</span>
      <button type="button" class="btn danger small" data-act="reset-yes">Сбросить</button>
      <button type="button" class="btn ghost small" data-act="cancel">Отмена</button></div>` : ""}
    <button type="button" class="btn block" data-act="finish" ${doneSets ? "" : "disabled"}>Завершить тренировку · ${doneSets}/${totalSets} подходов</button>
    ${started ? `<button type="button" class="btn ghost" data-act="reset">Сбросить тренировку</button>` : ""}
  `;
}

function sessionStats(s) {
  let sets = 0, reps = 0, tonnage = 0;
  for (const it of s.items) for (const x of it.sets) if (x.done) {
    sets++;
    const ex = EXERCISES[it.id];
    if (ex && ex.unit === "reps") { reps += +x.r || 0; tonnage += (+x.r || 0) * (+x.w || 0); }
  }
  return { sets, reps, tonnage };
}

function viewHistory() {
  const list = sortedSessions();
  if (!list.length) return `<div class="panel empty"><h2>Пока пусто</h2><p>Отметьте подходы на вкладке «Тренировка» и нажмите «Завершить» — тренировка появится здесь.</p></div>`;
  return `<h2>История · ${list.length} ${plural(list.length, "тренировка", "тренировки", "тренировок")}</h2>
  <div class="hist">${list.map((s) => {
    const st = sessionStats(s);
    const wi = weekInfo(s.date);
    return `<details class="panel hist-item" ${ui.openHist === s.id ? "open" : ""} data-hist="${s.id}">
      <summary>
        <span class="day-badge">${s.day}</span>
        <span class="hist-main"><span class="t">${fmtDate(s.date, { weekday: "short", day: "numeric", month: "long" })}</span><br>
          <span class="small muted num">Нед. ${wi.week} · ${st.sets} подх. · ${fmtNum(st.reps)} повт. · ${fmtNum(st.tonnage)} кг</span></span>
        ${s.shoulder ? '<span class="flag">плечо</span>' : ""}${s.ankle ? '<span class="flag">голеностоп</span>' : ""}
      </summary>
      <div class="hist-sets">
        <div><span>Разминка</span><span>${Object.values(s.warmup || {}).filter(Boolean).length}/${WARMUP.length}</span></div>
        ${s.items.filter((i) => i.sets.some((x) => x.done)).map((i) => {
          const ex = EXERCISES[i.id] || { name: i.id };
          return `<div><span>${esc(ex.name)}</span><span>${esc(setsSummary(i.sets.filter((x) => x.done), ex))}</span></div>`;
        }).join("")}
      </div>
      ${s.note ? `<p class="small">${esc(s.note)}</p>` : ""}
      ${ui.confirm === "del:" + s.id
        ? `<div class="confirm"><span>Удалить эту тренировку?</span><button type="button" class="btn danger small" data-act="del-yes" data-id="${s.id}">Удалить</button><button type="button" class="btn ghost small" data-act="cancel">Отмена</button></div>`
        : `<div class="row"><button type="button" class="btn ghost small" data-act="del" data-id="${s.id}">Удалить</button></div>`}
    </details>`;
  }).join("")}</div>`;
}

// ---------- Отчёт ----------
function weekStart(dateStr) {
  const d = parseISO(dateStr);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d;
}
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function barChart(weeks) {
  const W = 360, H = 190, pl = 34, pr = 8, pt = 22, pb = 30;
  const maxT = Math.max(1, ...weeks.map((w) => w.tonnage));
  const nice = niceMax(maxT);
  const bw = (W - pl - pr) / weeks.length;
  const y = (v) => pt + (H - pt - pb) * (1 - v / nice);
  const ticks = [0, nice / 2, nice];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Тоннаж по неделям">
    ${ticks.map((t) => `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}"/><text x="${pl - 6}" y="${y(t) + 4}" text-anchor="end">${t >= 1000 ? (t / 1000).toLocaleString("ru-RU") + "т" : fmtNum(t)}</text>`).join("")}
    ${weeks.map((w, i) => {
      const x = pl + i * bw + bw * 0.18, bwi = bw * 0.64;
      const h = Math.max(w.tonnage ? 2 : 0, y(0) - y(w.tonnage));
      return `<rect class="bar ${w.count >= 3 ? "target" : ""}" x="${x}" y="${y(0) - h}" width="${bwi}" height="${h}" rx="3"/>
        <text class="val" x="${x + bwi / 2}" y="${y(0) - h - 5}" text-anchor="middle">${w.count ? w.count + "×" : ""}</text>
        <text x="${x + bwi / 2}" y="${H - 10}" text-anchor="middle">${w.label}</text>`;
    }).join("")}
  </svg>`;
}
function niceMax(v) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
function lineChart(points, unit) {
  const W = 360, H = 180, pl = 34, pr = 14, pt = 20, pb = 28;
  if (!points.length) return `<p class="muted small">Нет данных по этому упражнению за период.</p>`;
  const vals = points.map((p) => p.v);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo === hi) { lo = Math.max(0, lo - 2); hi = hi + 2; }
  const pad = (hi - lo) * 0.15; lo = Math.max(0, lo - pad); hi = hi + pad;
  const x = (i) => points.length === 1 ? (pl + W - pr) / 2 : pl + (W - pl - pr) * (i / (points.length - 1));
  const y = (v) => pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo));
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = `${path} L${x(points.length - 1).toFixed(1)},${y(lo)} L${x(0).toFixed(1)},${y(lo)} Z`;
  const ticks = [lo, (lo + hi) / 2, hi];
  const step = Math.ceil(points.length / 4);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Прогресс упражнения">
    ${ticks.map((t) => `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}"/><text x="${pl - 6}" y="${y(t) + 4}" text-anchor="end">${Math.round(t * 10) / 10}</text>`).join("")}
    <path class="area" d="${area}"/>
    <path class="line" d="${path}"/>
    ${points.map((p, i) => `<circle class="dot ${i === points.length - 1 ? "last" : ""}" cx="${x(i)}" cy="${y(p.v)}" r="4"/>`).join("")}
    <text class="val" x="${x(points.length - 1)}" y="${y(points[points.length - 1].v) - 9}" text-anchor="${points.length === 1 ? "middle" : "end"}">${points[points.length - 1].v} ${unit}</text>
    ${points.map((p, i) => (i % step === 0 || i === points.length - 1) ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${fmtDate(p.date)}</text>` : "").join("")}
  </svg>`;
}

function viewReport() {
  const all = sortedSessions();
  if (!all.length) return `<div class="panel empty"><h2>Отчёт появится после первой тренировки</h2><p>Здесь будут тоннаж по неделям, регулярность, прогресс по каждому упражнению и личные рекорды.</p></div>`;
  const periods = { "4w": 28, "6w": 42, all: Infinity };
  const days = periods[ui.reportPeriod];
  const cutoff = days === Infinity ? "0000" : isoOf(new Date(Date.now() - days * 86400000));
  const list = all.filter((s) => s.date >= cutoff).reverse();

  const tot = list.reduce((a, s) => { const st = sessionStats(s); a.sets += st.sets; a.reps += st.reps; a.t += st.tonnage; return a; }, { sets: 0, reps: 0, t: 0 });

  // Недели
  const firstWeek = weekStart(list.length ? list[0].date : todayISO());
  const lastWeek = weekStart(todayISO());
  const weeks = [];
  for (let d = new Date(firstWeek); d <= lastWeek; d.setDate(d.getDate() + 7)) {
    const k = isoOf(d);
    weeks.push({ key: k, label: d.toLocaleDateString("ru-RU", { day: "numeric", month: "numeric" }), count: 0, tonnage: 0 });
  }
  const shown = weeks.slice(-12);
  for (const s of list) {
    const w = shown.find((x) => x.key === isoOf(weekStart(s.date)));
    if (w) { w.count++; w.tonnage += sessionStats(s).tonnage; }
  }
  const fullWeeks = shown.slice(0, -1);
  const adherence = fullWeeks.length ? Math.round(100 * fullWeeks.reduce((a, w) => a + Math.min(3, w.count), 0) / (fullWeeks.length * 3)) : null;

  // Прогресс упражнения
  const usedEx = Object.keys(EXERCISES).filter((id) => !WARMUP.includes(id) && all.some((s) => s.items.some((i) => i.id === id && i.sets.some((x) => x.done))));
  if (!usedEx.includes(ui.reportEx)) ui.reportEx = usedEx[0];
  const ex = EXERCISES[ui.reportEx];
  const weighted = list.some((s) => s.items.some((i) => i.id === ui.reportEx && i.sets.some((x) => x.done && +x.w > 0)));
  const rows = [];
  const points = [];
  for (const s of list) {
    const it = s.items.find((i) => i.id === ui.reportEx);
    if (!it) continue;
    const dn = it.sets.filter((x) => x.done);
    if (!dn.length) continue;
    const reps = dn.reduce((a, x) => a + (+x.r || 0), 0);
    const maxW = Math.max(...dn.map((x) => +x.w || 0));
    points.push({ date: s.date, v: weighted ? maxW : reps });
    rows.push({ date: s.date, sets: dn, reps, maxW });
  }

  // Рекорды
  const records = usedEx.map((id) => {
    const e = EXERCISES[id];
    let bestW = 0, bestWR = 0, bestSet = 0, bestTotal = 0, lastDate = "", sessions = 0;
    for (const s of all) {
      const it = s.items.find((i) => i.id === id);
      if (!it) continue;
      const dn = it.sets.filter((x) => x.done);
      if (!dn.length) continue;
      sessions++;
      if (s.date > lastDate) lastDate = s.date;
      bestTotal = Math.max(bestTotal, dn.reduce((a, x) => a + (+x.r || 0), 0));
      for (const x of dn) {
        const w = +x.w || 0, r = +x.r || 0;
        if (w > bestW || (w === bestW && r > bestWR)) { bestW = w; bestWR = r; }
        bestSet = Math.max(bestSet, r);
      }
    }
    return { id, e, bestW, bestWR, bestSet, bestTotal, lastDate, sessions };
  });

  const shoulderCount = list.filter((s) => s.shoulder).length;
  const ankleCount = list.filter((s) => s.ankle).length;
  const unit = weighted ? "кг" : unitLabel(ex);

  return `
    <div class="seg" role="group" aria-label="Период">
      ${[["4w", "4 недели"], ["6w", "6 недель"], ["all", "Всё время"]].map(([k, l]) => `<button type="button" data-act="period" data-p="${k}" aria-pressed="${ui.reportPeriod === k}">${l}</button>`).join("")}
    </div>
    <div class="kpis">
      <div class="kpi"><b>${list.length}</b><span>${plural(list.length, "тренировка", "тренировки", "тренировок")}</span></div>
      <div class="kpi"><b>${fmtNum(tot.sets)}</b><span>подходов</span></div>
      <div class="kpi"><b>${fmtNum(tot.reps)}</b><span>повторов</span></div>
      <div class="kpi"><b>${fmtNum(tot.t)}</b><span>кг тоннаж</span></div>
    </div>
    <section class="panel">
      <div class="row spread"><h2>По неделям</h2>${adherence !== null ? `<span class="small muted">Регулярность: <b class="num">${adherence}%</b> от 3 тренировок в неделю</span>` : ""}</div>
      ${barChart(shown)}
      <p class="small muted">Высота столбца — тоннаж (кг × повторы), над ним — число тренировок. Зелёный — неделя с 3 и более тренировками.</p>
    </section>
    <section class="panel">
      <div class="row spread">
        <h2>Прогресс</h2>
        <select id="reportEx" data-act="reportEx" aria-label="Упражнение">${usedEx.map((id) => `<option value="${id}" ${id === ui.reportEx ? "selected" : ""}>${esc(EXERCISES[id].name)}</option>`).join("")}</select>
      </div>
      <p class="small muted">${weighted ? "Максимальный рабочий вес за тренировку, кг" : `Сумма ${ex.unit === "sec" ? "секунд" : "повторов"} во всех подходах за тренировку`}</p>
      ${lineChart(points, unit)}
      <div class="table-wrap"><table>
        <thead><tr><th>Дата</th><th>Подходы</th><th class="n">${ex.unit === "sec" ? "Сек" : "Повт"}</th>${weighted ? '<th class="n">Макс, кг</th>' : ""}</tr></thead>
        <tbody>${rows.slice().reverse().map((r) => `<tr><td>${fmtDate(r.date)}</td><td>${esc(setsSummary(r.sets, ex))}</td><td class="n">${r.reps}</td>${weighted ? `<td class="n">${r.maxW}</td>` : ""}</tr>`).join("")}</tbody>
      </table></div>
    </section>
    <section class="panel">
      <h2>Личные рекорды</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Упражнение</th><th class="n">Лучший подход</th><th class="n">Сумма за трен.</th><th class="n">Трен.</th><th class="n">Последний раз</th></tr></thead>
        <tbody>${records.map((r) => `<tr><td>${esc(r.e.name)}</td>
          <td class="n">${r.bestW ? `${r.bestWR} × ${r.bestW} кг` : `${r.bestSet} ${unitLabel(r.e)}`}</td>
          <td class="n">${r.bestTotal}</td><td class="n">${r.sessions}</td><td class="n">${fmtDate(r.lastDate)}</td></tr>`).join("")}</tbody>
      </table></div>
    </section>
    <section class="panel">
      <h2>Самочувствие за период</h2>
      <div class="row">
        <span class="flag" style="${shoulderCount ? "" : "opacity:.5"}">Плечо ныло: ${shoulderCount}</span>
        <span class="flag" style="${ankleCount ? "" : "opacity:.5"}">Голеностоп: ${ankleCount}</span>
      </div>
      <p class="small muted">Плечо ноет дольше 24 ч — снизьте вес на жимах и махах. Отёк дольше 24 ч или боль в голеностопе — шаг назад.</p>
    </section>`;
}

function viewPlan() {
  const wi = weekInfo();
  const day = (k) => `<section class="panel">
    <h2>День ${k} · ${esc(DAYS[k].name)}</h2>
    ${DAYS[k].exercises.map((id) => {
      const ex = EXERCISES[id];
      return `<div><div class="row spread"><b>${esc(ex.name)}</b><span class="num muted small">${scheme(ex)}${ex.weight ? " · " + esc(ex.weight) : ""}</span></div>
        ${ex.note ? `<div class="small muted">${esc(ex.note)}</div>` : ""}${techBlock(ex)}</div>`;
    }).join("")}
  </section>`;
  return `
    <section class="panel">
      <h2>Программа дома · A/B/C, 3 раза в неделю</h2>
      <p class="small">Сейчас <b>неделя ${wi.week} из 6</b>${wi.cycle > 1 ? `, цикл ${wi.cycle}` : ""}: ${esc(progressionText(wi.week))}</p>
      <div class="row">
        <label class="small muted" for="startDate">Начало программы</label>
        <input type="date" id="startDate" data-act="start" value="${startDate()}">
      </div>
    </section>
    <section class="panel">
      <h2>Стартовые веса</h2>
      <ul class="plan-list">
        <li><span>Жим лёжа на полу (сборная)</span><span>16–18 кг</span></li>
        <li><span>Тяга в наклоне (сборная)</span><span>18–20 кг</span></li>
        <li><span>Гоблет-присед (позже)</span><span>12–16 кг</span></li>
        <li><span>Жим сидя, махи в стороны</span><span>6 кг (махи с 4 кг)</span></li>
        <li><span>Подтягивания</span><span>4×6–8 с запасом</span></li>
        <li><span>Брусья — до параллели</span><span>4×8–10</span></li>
      </ul>
    </section>
    <section class="panel">
      <h2>Разминка плеча · 5 мин</h2>
      ${WARMUP.map((id) => { const ex = EXERCISES[id]; return `<div><div class="row spread"><b>${esc(ex.name)}</b><span class="num muted small">${scheme(ex)}</span></div>${techBlock(ex)}</div>`; }).join("")}
      <div class="note">Если после тренировки плечо ноет дольше 24 ч — снижайте вес на жимах и махах на шаг.</div>
    </section>
    ${day("A")}${day("B")}${day("C")}
    <section class="panel">
      <h2>Прогрессия на 6 недель</h2>
      <ol class="prog">
        <li>Недели 1–2: нижняя граница повторов, техника, плечо под контролем.</li>
        <li>Недели 3–4: +1–2 повтора или +2 кг на сборной.</li>
        <li>Недели 5–6: верхняя граница повторов → +2–4 кг на сборной, снова нижняя граница.</li>
        <li>Подтягивания: когда 4×8 легко — добавьте вес (гантель между ног или рюкзак) или 4×8–10 с паузой внизу.</li>
        <li>Брусья: когда 4×10 легко — добавьте вес или замедлите негатив (3 сек вниз).</li>
      </ol>
    </section>
    <section class="panel">
      <h2>После 10 ноября</h2>
      <ol class="prog">
        <li>Недели 1–2: реабилитация голеностопа + A/B + C без нагрузки на больную ногу.</li>
        <li>Недели 3–4: гоблет-присед 12–16 кг, румынская тяга с малым весом — только без отёка и боли.</li>
        <li>Недели 5–6: полноценные приседания и румынская тяга со сборной, прогрессия.</li>
      </ol>
      <p class="small muted">Гоблет-присед и румынскую тягу можно добавить в любой день кнопкой «Добавить упражнение».</p>
      ${EXTRA.map((id) => { const ex = EXERCISES[id]; return `<div><div class="row spread"><b>${esc(ex.name)}</b><span class="num muted small">${scheme(ex)} · ${esc(ex.weight)}</span></div>${techBlock(ex)}</div>`; }).join("")}
      <div class="note">Отёк дольше 24 ч или боль в голеностопе — шаг назад.</div>
    </section>
    <section class="panel">
      <h2>Настройки и данные</h2>
      <div class="row"><label class="small muted" for="restSec">Таймер отдыха, сек</label>
        <input type="number" class="plain num" id="restSec" data-act="rest" min="0" step="15" value="${state.settings.rest}" style="width:90px"></div>
      <p class="small muted">Данные хранятся в этом браузере. Делайте резервную копию, чтобы перенести их на другое устройство.</p>
      <div class="row">
        <button type="button" class="btn ghost small" data-act="export">Скачать копию (JSON)</button>
        <label class="btn ghost small" for="importFile">Загрузить копию</label>
        <input type="file" id="importFile" accept="application/json,.json" hidden>
      </div>
      <div id="dataMsg" class="small"></div>
      ${ui.confirm === "wipe"
        ? `<div class="confirm"><span>Удалить все тренировки без возможности восстановления?</span><button type="button" class="btn danger small" data-act="wipe-yes">Удалить всё</button><button type="button" class="btn ghost small" data-act="cancel">Отмена</button></div>`
        : `<div><button type="button" class="btn ghost small" data-act="wipe">Удалить все данные</button></div>`}
    </section>`;
}

// ---------- События ----------
function rerenderKeepScroll() { const y = window.scrollY; render(); window.scrollTo(0, y); }

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-act], [data-tab]");
  if (!t) return;
  if (t.dataset.tab) {
    tab = t.dataset.tab; ui.confirm = null;
    history.replaceState(null, "", "#" + tab);
    render(); window.scrollTo(0, 0);
    return;
  }
  const act = t.dataset.act;
  const d = state.draft;
  const i = +t.dataset.i, si = +t.dataset.s;
  switch (act) {
    case "day": {
      const day = t.dataset.day;
      if (d && d.day === day) return;
      if (d && draftStarted(d)) { ui.confirm = "switch"; ui.pendingDay = day; break; }
      ui.day = day; state.draft = newDraft(day); break;
    }
    case "switch-yes": ui.day = ui.pendingDay; state.draft = newDraft(ui.pendingDay); ui.confirm = null; break;
    case "cancel": ui.confirm = null; break;
    case "tick": {
      const s = d.items[i].sets[si];
      s.done = !s.done;
      if (s.done && state.settings.rest > 0) startTimer(state.settings.rest);
      break;
    }
    case "addset": {
      const sets = d.items[i].sets;
      const prev = sets[sets.length - 1];
      sets.push({ r: prev ? prev.r : "", w: prev ? prev.w : 0, done: false });
      break;
    }
    case "delset": d.items[i].sets.pop(); break;
    case "delex": d.items.splice(i, 1); break;
    case "addex": {
      const id = $("#addEx").value;
      if (id) d.items.push(makeItem(id, weekInfo(d.date).week));
      break;
    }
    case "reset": ui.confirm = "reset"; break;
    case "reset-yes": state.draft = newDraft(d.day); ui.confirm = null; break;
    case "finish": {
      d.items.forEach((it) => it.sets.forEach((s) => { s.r = s.r === "" ? 0 : +s.r; s.w = +s.w || 0; }));
      state.sessions.push({ ...d, finishedAt: new Date().toISOString() });
      if (!state.settings.startDate) state.settings.startDate = startDate();
      state.draft = null; ui.day = null; stopTimer();
      save(); tab = "history"; ui.openHist = d.id;
      history.replaceState(null, "", "#history");
      render(); window.scrollTo(0, 0);
      return;
    }
    case "del": ui.confirm = "del:" + t.dataset.id; ui.openHist = t.dataset.id; break;
    case "del-yes": state.sessions = state.sessions.filter((s) => s.id !== t.dataset.id); ui.confirm = null; break;
    case "period": ui.reportPeriod = t.dataset.p; break;
    case "timer-add": timerEnd += 30000; $("#timer").classList.remove("finished"); clearInterval(timerId); timerId = setInterval(tickTimer, 250); tickTimer(); return;
    case "timer-stop": stopTimer(); return;
    case "export": exportData(); return;
    case "wipe": ui.confirm = "wipe"; break;
    case "wipe-yes": state = structuredClone(DEFAULT_STATE); ui.confirm = null; break;
    default: return;
  }
  save(); rerenderKeepScroll();
});

document.addEventListener("change", (e) => {
  const t = e.target;
  const act = t.dataset.act;
  const d = state.draft;
  if (act === "warm") d.warmup[t.dataset.id] = t.checked;
  else if (act === "flag") d[t.dataset.f] = t.checked;
  else if (act === "date" && t.value) d.date = t.value;
  else if (act === "start" && t.value) state.settings.startDate = t.value;
  else if (act === "rest") state.settings.rest = Math.max(0, +t.value || 0);
  else if (act === "reportEx") ui.reportEx = t.value;
  else if (t.id === "importFile") { importData(t.files[0]); return; }
  else return;
  save();
  if (act !== "rest") rerenderKeepScroll();
});

document.addEventListener("input", (e) => {
  const t = e.target;
  const d = state.draft;
  if (!d) return;
  if (t.dataset.act === "r" || t.dataset.act === "w") {
    d.items[+t.dataset.i].sets[+t.dataset.s][t.dataset.act] = t.value === "" ? "" : +t.value;
    save();
  } else if (t.dataset.act === "note") { d.note = t.value; save(); }
});

document.addEventListener("toggle", (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.hist) { if (el.open) ui.openHist = el.dataset.hist; else if (ui.openHist === el.dataset.hist) ui.openHist = null; }
}, true);

function exportData() {
  const blob = new Blob([JSON.stringify({ app: "workout-tracker", version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `trenirovki-${todayISO()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function importData(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    const msg = $("#dataMsg");
    try {
      const data = JSON.parse(r.result);
      if (!Array.isArray(data.sessions)) throw new Error("no sessions");
      const ids = new Set(state.sessions.map((s) => s.id));
      const added = data.sessions.filter((s) => !ids.has(s.id));
      state.sessions.push(...added);
      if (data.settings && data.settings.startDate && !state.settings.startDate) state.settings.startDate = data.settings.startDate;
      save(); render();
      $("#dataMsg").textContent = `Загружено тренировок: ${added.length}.`;
    } catch (err) {
      msg.textContent = "Файл не похож на копию дневника. Выберите JSON, скачанный кнопкой «Скачать копию».";
    }
  };
  r.readAsText(file);
}

window.addEventListener("hashchange", () => {
  const h = location.hash.slice(1);
  if (["workout", "history", "report", "plan"].includes(h) && h !== tab) { tab = h; render(); }
});

if (!["workout", "history", "report", "plan"].includes(tab)) tab = "workout";
render();
