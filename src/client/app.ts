import type { LabEvent, LabInfo, RunSummary, StreamMessage, VariantInfo } from "../types.ts";

interface VState {
  events: LabEvent[];
  summary?: RunSummary;
  running: boolean;
  startedAt: number;
  pings: number[];
  pendingSince: number | null;
  error?: string;
}

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const state = new Map<string, VState>();
let labs: LabInfo[] = [];
let current: LabInfo;
let busy = false;

const vs = (l: LabInfo, v: VariantInfo): VState => {
  const k = `${l.id}/${v.id}`;
  let s = state.get(k);
  if (!s) state.set(k, (s = { events: [], running: false, startedAt: 0, pings: [], pendingSince: null }));
  return s;
};
const fmt = (ms: number) => (ms >= 1000 ? (ms / 1000).toFixed(2) + " s" : Math.round(ms) + " ms");
const pingColor = (ms: number) => (ms < 60 ? "var(--green)" : ms < 250 ? "var(--yellow)" : "var(--red)");

async function init() {
  labs = (await (await fetch("/api/labs")).json()) as LabInfo[];
  $("#nav").innerHTML = labs.map((l) => `<button data-id="${l.id}">${l.emoji} ${esc(l.title)}</button>`).join("");
  $("#nav").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (b && !busy) select(b.dataset.id!);
  });
  select(location.hash.slice(1) || labs[0].id);
  requestAnimationFrame(frame);
}

function select(id: string) {
  current = labs.find((l) => l.id === id) ?? labs[0];
  location.hash = current.id;
  document.querySelectorAll<HTMLElement>("nav button").forEach((b) => b.classList.toggle("active", b.dataset.id === current.id));
  renderLab();
}

 function renderLab() {
  const l = current;
  



  



  $("#main").innerHTML = `
    <h2>${l.emoji} ${esc(l.title)}</h2>
    <div class="muted">${esc(l.blurb)}</div>
    <div class="lesson">💡 ${esc(l.lesson).replace(/`([^`]+)`/g, "<code>$1</code>")}</div>
    <div class="toolbar"><button class="run alt" id="all">▶ Run all variants</button>
      <span class="muted">Runs are serialized so they don't disturb each other's timings.</span></div>
    <div class="compare" id="compare"></div>
    ${l.variants
      .map(
        (v) => `<section class="card ${v.kind}" data-v="${v.id}">
        <div class="card-head"><div><span class="badge ${v.kind}">${v.kind === "blocking" ? "BLOCKING" : "ASYNC"}</span><b>${esc(v.name)}</b>
          <div class="muted">${esc(v.summary)}</div></div><button class="run">▶ Run</button></div>
        <div class="body"></div></section>`,
      )
      .join("")}
    <details><summary>Show source: src/labs/${l.id}.ts</summary><div class="md">${l.sourceHtml}</div></details>`;
  $("#all").addEventListener("click", async () => {
    for (const v of l.variants) await run(l, v);
  });
  document.querySelectorAll<HTMLElement>(".card").forEach((card) => {
    const v = l.variants.find((x) => x.id === card.dataset.v)!;
    $(".run", card).addEventListener("click", () => void run(l, v));
  });
  renderAll();
}

function setBusy(b: boolean) {
  busy = b;
  document.querySelectorAll<HTMLButtonElement>("button.run, nav button").forEach((x) => (x.disabled = b));
}

function run(l: LabInfo, v: VariantInfo): Promise<void> {
  const s = vs(l, v);
  Object.assign(s, { events: [], summary: undefined, running: true, startedAt: performance.now(), pings: [], pendingSince: null, error: undefined });
  setBusy(true);
  renderAll();

  // Ping the server's main thread while the lab runs: a blocked thread can't answer.
  const pinger = setInterval(async () => {
    if (s.pendingSince !== null) return;
    const t = performance.now();
    s.pendingSince = t;
    try {
      await fetch("/api/ping", { cache: "no-store" });
    } catch {
      /* ignore */
    }
    s.pings.push(performance.now() - t);
    s.pendingSince = null;
  }, 100);

  return new Promise((resolve) => {
    const es = new EventSource(`/api/run?lab=${l.id}&variant=${v.id}`);
    const finish = () => {
      es.close();
      clearInterval(pinger);
      s.running = false;
      setBusy(false);
      renderAll();
      resolve();
    };
    es.onmessage = (m) => {
      const msg = JSON.parse(m.data) as StreamMessage;
      if (msg.type === "event") s.events.push(msg.event);
      else if (msg.type === "done") {
        s.summary = msg.summary;
        finish();
      } else {
        s.error = msg.message;
        finish();
      }
    };
    es.onerror = () => {
      if (s.running) {
        s.error ??= "connection lost";
        finish();
      }
    };
  });
}

function renderAll() {
  if (!current) return;
  const scale = scaleFor(current);
  for (const v of current.variants) renderCard(v, scale);
  renderCompare();
}

function scaleFor(l: LabInfo): number {
  let max = 500;
  for (const v of l.variants) {
    const s = vs(l, v);
    max = Math.max(max, s.summary?.total ?? 0, s.running ? performance.now() - s.startedAt : 0);
  }
  return max * 1.02;
}

function renderCard(v: VariantInfo, scale: number) {
  const card = $(`.card[data-v="${v.id}"]`);
  if (!card) return;
  const s = vs(current, v);
  card.classList.toggle("running", s.running);
  const elapsed = s.running ? performance.now() - s.startedAt : (s.summary?.total ?? 0);

  const tasks = new Map<string, { label: string; lane?: number; start: number; end?: number; fail?: boolean; note?: string }>();
  for (const e of s.events) {
    if (!e.task) continue;
    if (e.kind === "start") tasks.set(e.task, { label: e.label ?? e.task, lane: e.lane, start: e.t });
    else if (e.kind === "end" || e.kind === "fail") {
      const t = tasks.get(e.task);
      if (t) Object.assign(t, { end: e.t, fail: e.kind === "fail", note: e.msg });
    }
  }
  const rows = [...tasks.values()]
    .map((t) => {
      const end = t.end ?? elapsed;
      const cls = `bar${t.end === undefined ? " open" : ""}${t.fail ? " fail" : ""}`;
      return `<div class="row"><div class="name" title="${esc(t.note ?? t.label)}">${t.lane === undefined ? "" : `<span class="dot lane${t.lane % 8}"></span>`}${t.fail ? "✗ " : ""}${esc(t.label)}</div>
        <div class="track"><div class="${cls}${t.lane === undefined ? "" : ` lane${t.lane % 8}`}" style="left:${(t.start / scale) * 100}%;width:${(Math.max(end - t.start, 0) / scale) * 100}%"></div></div></div>`;
    })
    .join("");

  const sum = s.summary;
  const pending = s.pendingSince !== null ? performance.now() - s.pendingSince : 0;
  const waiting = s.running && s.events.length === 0 && pending > 300;
  const worst = Math.max(pending, ...s.pings, 0);
  const logs = s.events
    .filter((e) => e.kind === "log" || e.kind === "fail")
    .map((e) => `<div class="${e.kind === "fail" ? "err" : ""}">[${fmt(e.t)}] ${e.kind === "fail" ? `✗ ${esc(e.task!)}: ` : ""}${esc(e.msg ?? "")}</div>`)
    .join("");

  const html = `
    <div class="stats">
      <div class="stat"><b>${s.running || sum ? fmt(elapsed) : "–"}</b><span>total time</span></div>
      <div class="stat ${sum ? (sum.maxStall > 100 ? "bad" : "good") : ""}"><b>${sum ? fmt(sum.maxStall) : "–"}</b><span>longest server freeze</span></div>
      <div class="stat ${sum ? (sum.ticks < sum.expectedTicks * 0.5 ? "bad" : "good") : ""}"><b>${sum ? Math.round((sum.ticks / Math.max(1, sum.expectedTicks)) * 100) + "%" : "–"}</b><span>event loop alive</span></div>
      <div class="stat ${worst > 250 ? "bad" : ""}"><b>${s.running || sum ? fmt(worst) : "–"}</b><span>worst ping from this page</span></div>
    </div>
    ${s.running || s.pings.length ? `<div class="ping">${s.pings.map((p) => `<div style="height:${Math.min(100, 8 + p / 4)}%;background:${pingColor(p)}"></div>`).join("")}${pending > 120 ? `<div style="height:100%;width:${Math.min(300, pending / 10)}px;background:var(--red)"></div>` : ""}</div>` : ""}
    ${waiting ? `<div class="waiting">🧊 The server isn't answering: its thread is blocked, so it can't report progress or even reply to a ping (${fmt(pending)} and counting)…</div>` : ""}
    ${s.error ? `<div class="logs"><span class="err">${esc(s.error)}</span></div>` : ""}
    ${rows ? `<div class="gantt">${rows}</div><div class="axis"><span>0</span><span>${fmt(scale / 2)}</span><span>${fmt(scale)}</span></div>` : ""}
    <div class="logs">${logs}</div>`;
  const body = $(".body", card);
  if (body.dataset.h !== html) {
    body.innerHTML = html;
    body.dataset.h = html;
  }
}

function renderCompare() {
  const done = current.variants.filter((v) => vs(current, v).summary);
  const el = $("#compare");
  if (done.length < 2) {
    el.innerHTML = "";
    return;
  }
  const totals = done.map((v) => vs(current, v).summary!.total);
  const max = Math.max(...totals);
  const best = Math.min(...totals);
  el.innerHTML =
    `<b>Comparison</b>` +
    done
      .map((v, i) => {
        const color = v.kind === "blocking" ? "var(--orange)" : "var(--blue)";
        return `<div class="cmp"><div class="name">${v.kind === "blocking" ? "🧱" : "⚡"} ${esc(v.name)}</div>
      <div class="track"><div class="fill" style="width:${Math.max(8, (totals[i] / max) * 100)}%;background:${color}">${fmt(totals[i])}${totals[i] === best ? " 🏆" : ""}</div></div></div>`;
      })
      .join("");
}

function frame() {
  if (current && current.variants.some((v) => vs(current, v).running)) renderAll();
  requestAnimationFrame(frame);
}

void init();
