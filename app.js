"use strict";

const BICHOS = [
  "Avestruz", "Águia", "Burro", "Borboleta", "Cachorro", "Cabra", "Carneiro",
  "Camelo", "Cobra", "Coelho", "Cavalo", "Elefante", "Galo", "Gato", "Jacaré",
  "Leão", "Macaco", "Porco", "Pavão", "Peru", "Touro", "Tigre", "Urso", "Veado", "Vaca"
];

// Só carregados quando o usuário pede ("Carregar exemplo").
const EXAMPLE_BLOCKS = [
  ["8944", "5819", "7901", "3095", "6383"],
  ["9864", "1637", "3745", "0452", "6959"],
  ["0714", "3612", "3037", "6251", "7521"],
  ["0015", "0235", "3620", "8299", "1756"]
];

const STORAGE_KEY = "radar_milhares_v2";
const LEGACY_KEY = "radar_milhares_blocks_v1"; // formato antigo: array de arrays
const BACKUP_REMIND_DAYS = 14;
const POS_LABELS = ["Milhar", "Centena", "Dezena", "Unidade"];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad2 = (n) => String(n).padStart(2, "0");

let state = { blocks: [], lastBackupAt: null }; // carregado em "Início": { blocks: [{ nums, date, label }], lastBackupAt }
let period = "all";
let matrixMode = "freq";
let bichoSort = "grupo";
let currentProjections = [];
let selectedProjIdx = 0;
let variationSeed = 0;
let lastRemoved = null; // para desfazer
let editingIdx = null;
let pendingRestore = null;

/* ---------- Dados ---------- */

const isMilhar = (n) => typeof n === "string" && /^\d{4}$/.test(n);
const isISODate = (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);

// Aceita o formato antigo (array de milhares) e o novo ({ nums, date, label }).
// Retorna null se algo for inválido; blocos vazios são descartados.
function normalizeBlocks(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const b of list) {
    const nums = Array.isArray(b) ? b : b && Array.isArray(b.nums) ? b.nums : null;
    if (!nums || !nums.every(isMilhar)) return null;
    if (!nums.length) continue;
    out.push({
      nums: nums.slice(),
      date: !Array.isArray(b) && isISODate(b.date) ? b.date : null,
      label: !Array.isArray(b) && typeof b.label === "string" ? b.label.trim().slice(0, 20) : ""
    });
  }
  return out;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      const blocks = normalizeBlocks(parsed && parsed.blocks);
      if (blocks) {
        return { blocks, lastBackupAt: typeof parsed.lastBackupAt === "string" ? parsed.lastBackupAt : null };
      }
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy !== null) {
      const blocks = normalizeBlocks(JSON.parse(legacy));
      if (blocks) {
        const migrated = { blocks, lastBackupAt: null };
        writeState(migrated);
        return migrated;
      }
    }
  } catch (e) {}
  return { blocks: [], lastBackupAt: null };
}

function writeState(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) {}
}

function save() { writeState(state); }

// Pede ao navegador para não apagar os dados (importante no Safari/iOS).
function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persisted().then((ok) => ok || navigator.storage.persist()).catch(() => {});
    }
  } catch (e) {}
}

const sameNums = (a, b) => a.length === b.length && a.every((n, i) => n === b[i]);
const blockKey = (b) => `${b.date || ""}|${b.label}|${b.nums.join(",")}`;

/* ---------- Datas ---------- */

function toISO(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function todayISO() { return toISO(new Date()); }
function fmtDate(iso) { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; }

function periodCutoff() {
  if (period === "all") return null;
  const d = new Date();
  d.setDate(d.getDate() - (Number(period) - 1));
  return toISO(d);
}

function inPeriod(block) {
  const cutoff = periodCutoff();
  return cutoff === null || (block.date !== null && block.date >= cutoff);
}

function visibleEntries() {
  return state.blocks.map((block, idx) => ({ block, idx })).filter((e) => inPeriod(e.block));
}

function daysSince(isoDateTime) {
  return Math.floor((Date.now() - new Date(isoDateTime).getTime()) / 86400000);
}

/* ---------- Bichos ---------- */

function bichoIndex(milhar) {
  const dz = parseInt(milhar.slice(2, 4), 10);
  return dz === 0 ? 24 : Math.floor((dz - 1) / 4);
}

function getBichoInfo(milhar) {
  const idx = bichoIndex(milhar);
  return { idx, dezena: milhar.slice(2, 4), grupo: pad2(idx + 1), nome: BICHOS[idx] };
}

function grupoDezenas(idx) {
  const first = idx * 4 + 1;
  return [first, first + 1, first + 2, first + 3].map((n) => pad2(n % 100)).join(" ");
}

/* ---------- Entrada ---------- */

// Extrai milhares de texto digitado ou colado. Números colados (21784300)
// são quebrados de 4 em 4. Datas, horários e "1º" são descartados.
function parseMilhares(raw) {
  const cleaned = raw
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, " ")
    .replace(/\b\d{1,2}(:|h)\d{2}\b/gi, " ")
    .replace(/\b\d{1,2}\s*[º°ª]/g, " ");
  const valid = [];
  const ignored = [];
  for (const run of cleaned.match(/\d+/g) || []) {
    if (run.length % 4 === 0) {
      for (let i = 0; i < run.length; i += 4) valid.push(run.slice(i, i + 4));
    } else if (run.length >= 3) {
      ignored.push(run); // 1-2 dígitos soltos costumam ser grupo/posição
    }
  }
  return { valid, ignored };
}

/* ---------- Análise ---------- */

function analyze(entries) {
  const flat = entries.flatMap((e) => e.block.nums);
  const freq = [0, 1, 2, 3].map(() => Array(10).fill(0));
  const lastSeen = [0, 1, 2, 3].map(() => Array(10).fill(-1));
  const bichoFreq = Array(25).fill(0);
  const bichoLast = Array(25).fill(-1);

  flat.forEach((n, idx) => {
    for (let pos = 0; pos < 4; pos++) {
      const d = +n[pos];
      freq[pos][d]++;
      lastSeen[pos][d] = idx;
    }
    const b = bichoIndex(n);
    bichoFreq[b]++;
    bichoLast[b] = idx;
  });

  // Atraso: quantas milhares saíram depois da última aparição (null = nunca saiu).
  const delay = (last) => (last === -1 ? null : flat.length - 1 - last);
  const atraso = lastSeen.map((row) => row.map(delay));
  const bichoAtraso = bichoLast.map(delay);

  // Do menos frequente / mais antigo para o mais frequente / mais recente.
  const rankedByPos = [0, 1, 2, 3].map((pos) =>
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].sort((a, b) =>
      freq[pos][a] - freq[pos][b] || lastSeen[pos][a] - lastSeen[pos][b] || a - b
    )
  );
  return { flat, freq, atraso, bichoFreq, bichoAtraso, rankedByPos };
}

function buildProjections(stats) {
  if (!stats.flat.length) return [];
  const { freq, rankedByPos } = stats;
  const out = [];
  const seen = new Set();

  // Cada casa anda em um ritmo diferente, para as 5 combinações não ficarem coladas.
  const steps = [1, 2, 3, 1];
  for (let k = 0; out.length < 5 && k < 200; k++) {
    const digits = [];
    const breakdown = [];
    let zeroCount = 0;
    for (let pos = 0; pos < 4; pos++) {
      const idx = (k * steps[pos] + pos * variationSeed + (variationSeed ? k : 0)) % 6;
      const d = rankedByPos[pos][idx];
      const f = freq[pos][d];
      if (f === 0) zeroCount++;
      digits.push(d);
      breakdown.push({ posLabel: POS_LABELS[pos], digit: d, freq: f });
    }
    const num = digits.join("");
    if (seen.has(num)) continue;
    seen.add(num);
    out.push({ num, bicho: getBichoInfo(num), zeroCount, breakdown });
  }
  return out;
}

/* ---------- Render ---------- */

function renderAll() {
  const entries = visibleEntries();
  const stats = analyze(entries);
  $("kpi-total").textContent = stats.flat.length;

  renderPeriodNote(entries);
  renderZeros(stats);
  renderProjections(stats);
  renderMatrix(stats);
  renderBichos(stats);
  renderHistory(entries);
  renderBackupInfo();
}

function renderPeriodNote(entries) {
  const note = $("period-note");
  if (period === "all") { note.hidden = true; return; }
  const undated = state.blocks.filter((b) => b.date === null).length;
  let txt = `${entries.length} de ${state.blocks.length} bloco(s) nos últimos ${period} dias.`;
  if (undated) txt += ` ${undated} sem data só aparecem em "Tudo".`;
  note.textContent = txt;
  note.hidden = false;
}

function renderZeros(stats) {
  let totalZeros = 0;
  $("zeros-grid").innerHTML = POS_LABELS.map((label, pos) => {
    const zeros = [];
    for (let d = 0; d < 10; d++) if (stats.freq[pos][d] === 0) zeros.push(d);
    totalZeros += zeros.length;
    const txt = !stats.flat.length ? "—" : zeros.length ? zeros.join(", ") : "Fechado";
    return `<div class="zero-tile"><span class="zero-tile-pos">${label} (${label[0]})</span>
      <span class="zero-tile-digits ${zeros.length ? "" : "done"}">${txt}</span></div>`;
  }).join("");

  if (!stats.flat.length) totalZeros = 0;
  $("kpi-zeros").textContent = totalZeros;
  $("zeros-badge").textContent = `${totalZeros} dígito${totalZeros === 1 ? "" : "s"} zerado${totalZeros === 1 ? "" : "s"}`;
}

function renderProjections(stats) {
  currentProjections = buildProjections(stats);
  if (selectedProjIdx >= currentProjections.length) selectedProjIdx = 0;
  $("proj-actions").hidden = !currentProjections.length;

  if (!currentProjections.length) {
    $("proj-carousel").innerHTML = `<div class="empty-note">Lance blocos na barra de baixo para ver as combinações.</div>`;
    $("inspector-box").hidden = true;
    return;
  }

  $("proj-carousel").innerHTML = currentProjections.map((p, idx) => `
    <button type="button" class="ticket-card ${idx === selectedProjIdx ? "active" : ""}" data-idx="${idx}"
            aria-pressed="${idx === selectedProjIdx}" aria-label="Combinação ${idx + 1}: ${p.num}, ${esc(p.bicho.nome)}">
      <span class="ticket-rank"><span>#${idx + 1}</span><span>${p.zeroCount > 0 ? p.zeroCount + "x 0" : "raro"}</span></span>
      <span class="ticket-number">${p.num}</span>
      <span>
        <span class="ticket-animal">${esc(p.bicho.nome)}</span>
        <span class="ticket-group">Grupo ${p.bicho.grupo} &bull; dz ${p.bicho.dezena}</span>
      </span>
    </button>`).join("");
  renderInspector();
}

function renderInspector() {
  const sel = currentProjections[selectedProjIdx];
  const box = $("inspector-box");
  box.hidden = !sel;
  if (!sel) return;
  box.innerHTML = `
    <div class="inspector-top">
      <span class="inspector-title">Milhar ${sel.num}</span>
      <span class="inspector-bicho">G${sel.bicho.grupo} &bull; ${esc(sel.bicho.nome)} (${sel.bicho.dezena})</span>
    </div>
    <div class="digit-breakdown">
      ${sel.breakdown.map((b) => {
        const cls = b.freq === 0 ? "is-zero" : b.freq === 1 ? "is-late" : "is-norm";
        const txt = b.freq === 0 ? "Zerado (0x)" : `${b.freq}x saiu`;
        return `<div class="db-item"><div class="db-pos">${b.posLabel}</div>
          <div class="db-val">${b.digit}</div><div class="db-stat ${cls}">${txt}</div></div>`;
      }).join("")}
    </div>`;
}

function selectProjection(idx) {
  selectedProjIdx = idx;
  document.querySelectorAll("#proj-carousel .ticket-card").forEach((c) => {
    const on = +c.dataset.idx === idx;
    c.classList.toggle("active", on);
    c.setAttribute("aria-pressed", String(on));
  });
  renderInspector();
}

function renderMatrix(stats) {
  const isFreq = matrixMode === "freq";
  $("matrix-legend").innerHTML = isFreq
    ? `<span class="hm-pill hm-zero">0x</span> zerado &bull; <span class="hm-pill hm-late">1x</span> raro`
    : `Milhares desde a última vez. <span class="hm-pill hm-zero">nunca</span> não saiu &bull; <span class="hm-pill hm-late">maior</span> mais atrasado da casa`;

  const maxAtraso = stats.atraso.map((col) => Math.max(-1, ...col.filter((v) => v !== null)));
  let rows = "";
  for (let d = 0; d < 10; d++) {
    rows += `<tr><th scope="row">${d}</th>`;
    for (let pos = 0; pos < 4; pos++) {
      let cls, txt, title;
      if (isFreq) {
        const f = stats.freq[pos][d];
        cls = f === 0 ? "hm-zero" : f === 1 ? "hm-late" : "hm-norm";
        txt = `${f}x`;
        title = f === 0 ? "zerado" : f === 1 ? "raro" : `${f} vezes`;
      } else {
        const a = stats.atraso[pos][d];
        cls = a === null ? "hm-zero" : a === maxAtraso[pos] && a > 0 ? "hm-late" : "hm-norm";
        txt = a === null ? "nunca" : String(a);
        title = a === null ? "nunca saiu" : `${a} milhares desde a última vez`;
      }
      if (!stats.flat.length) { cls = "hm-norm"; txt = "—"; title = "sem dados"; }
      rows += `<td><span class="hm-pill ${cls}" title="${title}">${txt}</span></td>`;
    }
    rows += "</tr>";
  }
  $("heatmap-body").innerHTML = rows;
}

function renderBichos(stats) {
  const list = $("bichos-list");
  if (!stats.flat.length) {
    list.innerHTML = `<div class="empty-note">Sem milhares no período.</div>`;
    return;
  }
  const max = Math.max(1, ...stats.bichoFreq);
  const order = [...Array(25).keys()];
  if (bichoSort === "freq") order.sort((a, b) => stats.bichoFreq[b] - stats.bichoFreq[a] || a - b);

  list.innerHTML = order.map((i) => {
    const f = stats.bichoFreq[i];
    const a = stats.bichoAtraso[i];
    return `<div class="bicho-row${f === 0 ? " is-zero" : ""}">
      <span class="bicho-g">${pad2(i + 1)}</span>
      <span class="bicho-name">${esc(BICHOS[i])}<small>${grupoDezenas(i)}</small></span>
      <span class="bicho-bar" aria-hidden="true"><span style="width:${Math.round((f / max) * 100)}%"></span></span>
      <span class="bicho-count">${f}x</span>
      <span class="bicho-late">${a === null ? "nunca" : "atraso " + a}</span>
    </div>`;
  }).join("");
}

function blockMeta(block) {
  const parts = [];
  if (block.date) parts.push(fmtDate(block.date));
  if (block.label) parts.push(esc(block.label));
  return parts.join(" &bull; ");
}

function renderHistory(entries) {
  const hist = $("history-container");
  if (!state.blocks.length) {
    hist.innerHTML = `<div class="empty-note">Nenhum bloco lançado. Use a barra inferior para adicionar.
      <button type="button" class="btn btn-ghost btn-sm" data-action="example">Carregar exemplo</button></div>`;
    return;
  }
  if (!entries.length) {
    hist.innerHTML = `<div class="empty-note">Nenhum bloco nesse período.</div>`;
    return;
  }
  hist.innerHTML = entries.slice().reverse().map(({ block, idx }) => {
    const meta = blockMeta(block);
    return `
    <div class="hist-card${idx === editingIdx ? " editing" : ""}">
      <div class="hist-header">
        <span><strong>Bloco ${idx + 1}</strong>${meta ? " &bull; " + meta : ""} &bull; ${block.nums.length} milhares</span>
        <span class="hist-actions">
          <button type="button" class="link-btn" data-edit="${idx}">Editar</button>
          <button type="button" class="link-btn link-danger" data-del="${idx}">Remover</button>
        </span>
      </div>
      <div class="hist-list">
        ${block.nums.map((n) => `<div class="hist-pill">${n}<span>${esc(getBichoInfo(n).nome)}</span></div>`).join("")}
      </div>
    </div>`;
  }).join("");
}

function backupAge() {
  return state.lastBackupAt ? daysSince(state.lastBackupAt) : null;
}

function needsBackupReminder() {
  const age = backupAge();
  return state.blocks.length > 0 && (age === null || age >= BACKUP_REMIND_DAYS);
}

function renderBackupInfo() {
  const age = backupAge();
  const when = age === null ? "nunca" : age === 0 ? "hoje" : age === 1 ? "ontem" : `há ${age} dias`;
  $("backup-info").textContent = `Os dados ficam só neste aparelho. Último backup: ${when}.`;

  const alert = $("backup-alert");
  alert.hidden = !needsBackupReminder();
  if (!alert.hidden) {
    $("backup-alert-text").textContent = age === null
      ? "Você ainda não fez nenhum backup. Se o navegador limpar os dados, o histórico se perde."
      : `Seu último backup foi há ${age} dias.`;
  }

  const choice = $("restore-choice");
  choice.hidden = !pendingRestore;
  if (pendingRestore) {
    $("restore-choice-text").textContent =
      `O backup tem ${pendingRestore.length} bloco(s). Juntar com os ${state.blocks.length} atuais ou substituir tudo?`;
  }
}

/* ---------- Ações ---------- */

let toastTimer;
function showToast(msg, action) {
  const t = $("toast");
  t.textContent = msg;
  if (action) {
    const a = document.createElement("button");
    a.type = "button";
    a.className = "toast-action";
    a.textContent = action.label;
    a.onclick = () => { action.fn(); t.classList.remove("show"); };
    t.appendChild(a);
  }
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), action ? 6000 : 2500);
}

function openView(name) {
  document.querySelectorAll(".view-section").forEach((v) => v.classList.remove("active"));
  document.querySelectorAll(".seg-btn").forEach((b) => {
    const on = b.dataset.view === name;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", String(on));
  });
  $("view-" + name).classList.add("active");
  window.scrollTo(0, 0);
}

function setChip(attr, value) {
  document.querySelectorAll(`[data-${attr}]`).forEach((c) => {
    const on = c.dataset[attr] === value;
    c.classList.toggle("active", on);
    c.setAttribute("aria-pressed", String(on));
  });
}

async function copyText(text, okMsg) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  showToast(okMsg);
}

function resetProjections() {
  variationSeed = 0;
  selectedProjIdx = 0;
}

function submitBlock() {
  const input = $("block-input");
  const raw = input.value.trim();
  if (!raw) return;

  const { valid, ignored } = parseMilhares(raw);
  if (!valid.length) {
    showToast("Digite milhares com 4 dígitos (ex: 2178 4300 ou 21784300)");
    return;
  }

  const dateVal = $("block-date").value;
  const block = {
    nums: valid,
    date: isISODate(dateVal) ? dateVal : null,
    label: $("block-label").value.trim().slice(0, 20)
  };

  const dupIdx = state.blocks.findIndex((b, i) => i !== editingIdx && sameNums(b.nums, valid));
  if (dupIdx !== -1) {
    const dup = state.blocks[dupIdx];
    const when = dup.date ? ` (${fmtDate(dup.date)})` : "";
    if (!confirm(`Esse bloco é igual ao Bloco ${dupIdx + 1}${when}. Lançar mesmo assim?`)) return;
  }

  let msg;
  if (editingIdx !== null) {
    state.blocks[editingIdx] = block;
    msg = `Bloco ${editingIdx + 1} atualizado (${valid.length} milhares).`;
    exitEdit();
  } else {
    state.blocks.push(block);
    msg = `Bloco ${state.blocks.length} lançado (${valid.length} milhares)!`;
    input.value = "";
    $("block-label").value = "";
  }
  if (ignored.length) msg += ` Ignorados: ${ignored.join(", ")}`;
  if (!inPeriod(block)) msg += " Está fora do período filtrado.";

  save();
  requestPersistence();
  resetProjections();
  renderAll();
  showToast(msg);
}

function startEdit(idx) {
  const b = state.blocks[idx];
  if (!b) return;
  editingIdx = idx;
  $("block-input").value = b.nums.join(" ");
  $("block-date").value = b.date || "";
  $("block-label").value = b.label;
  $("btn-add").textContent = "Salvar";
  $("btn-cancel-edit").hidden = false;
  $("quick-dock").classList.add("editing");
  renderHistory(visibleEntries());
  $("block-input").focus();
  showToast(`Editando o Bloco ${idx + 1}`);
}

function exitEdit() {
  editingIdx = null;
  $("block-input").value = "";
  $("block-label").value = "";
  $("block-date").value = todayISO();
  $("btn-add").textContent = "+ Lançar";
  $("btn-cancel-edit").hidden = true;
  $("quick-dock").classList.remove("editing");
}

function deleteBlock(idx) {
  if (editingIdx !== null) exitEdit();
  lastRemoved = { idx, block: state.blocks[idx] };
  state.blocks.splice(idx, 1);
  save();
  renderAll();
  showToast(`Bloco ${idx + 1} removido.`, {
    label: "Desfazer",
    fn: () => {
      if (!lastRemoved) return;
      state.blocks.splice(lastRemoved.idx, 0, lastRemoved.block);
      lastRemoved = null;
      save();
      renderAll();
    }
  });
}

function loadExample() {
  state.blocks = EXAMPLE_BLOCKS.map((nums) => ({ nums: nums.slice(), date: null, label: "Exemplo" }));
  save();
  resetProjections();
  renderAll();
  showToast("Exemplo carregado. Use \"Limpar tudo\" para começar do zero.");
}

function backupFile() {
  const data = JSON.stringify({ app: "radar-milhares", version: 2, exportedAt: new Date().toISOString(), blocks: state.blocks }, null, 2);
  const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `radar-milhares-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  state.lastBackupAt = new Date().toISOString();
  save();
  renderBackupInfo();
  showToast("Backup baixado!");
}

function restoreFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let incoming = null;
    try {
      const parsed = JSON.parse(reader.result);
      incoming = normalizeBlocks(Array.isArray(parsed) ? parsed : parsed && parsed.blocks);
    } catch (e) {}
    if (!incoming || !incoming.length) {
      showToast("Arquivo de backup inválido.");
      return;
    }
    if (!state.blocks.length) {
      applyRestore(incoming, "replace");
      return;
    }
    pendingRestore = incoming;
    renderBackupInfo();
  };
  reader.readAsText(file);
}

function applyRestore(incoming, mode) {
  if (editingIdx !== null) exitEdit();
  let msg;
  if (mode === "merge") {
    const existing = new Set(state.blocks.map(blockKey));
    const fresh = incoming.filter((b) => !existing.has(blockKey(b)));
    state.blocks.push(...fresh);
    msg = `${fresh.length} bloco(s) adicionado(s)` +
      (incoming.length - fresh.length ? `, ${incoming.length - fresh.length} já existia(m).` : ".");
  } else {
    state.blocks = incoming;
    msg = `Backup restaurado (${incoming.length} blocos).`;
  }
  pendingRestore = null;
  save();
  requestPersistence();
  resetProjections();
  renderAll();
  showToast(msg);
}

/* ---------- Eventos ---------- */

document.querySelectorAll(".seg-btn").forEach((b) => b.addEventListener("click", () => openView(b.dataset.view)));

document.querySelectorAll("[data-period]").forEach((c) => c.addEventListener("click", () => {
  period = c.dataset.period;
  setChip("period", period);
  resetProjections();
  renderAll();
}));

document.querySelectorAll("[data-matrix]").forEach((c) => c.addEventListener("click", () => {
  matrixMode = c.dataset.matrix;
  setChip("matrix", matrixMode);
  renderMatrix(analyze(visibleEntries()));
}));

document.querySelectorAll("[data-bsort]").forEach((c) => c.addEventListener("click", () => {
  bichoSort = c.dataset.bsort;
  setChip("bsort", bichoSort);
  renderBichos(analyze(visibleEntries()));
}));

$("proj-carousel").addEventListener("click", (e) => {
  const card = e.target.closest(".ticket-card");
  if (card) selectProjection(+card.dataset.idx);
});

$("history-container").addEventListener("click", (e) => {
  const del = e.target.closest("[data-del]");
  if (del) return deleteBlock(+del.dataset.del);
  const edit = e.target.closest("[data-edit]");
  if (edit) return startEdit(+edit.dataset.edit);
  if (e.target.closest("[data-action='example']")) loadExample();
});

$("btn-regen").addEventListener("click", () => {
  variationSeed++;
  selectedProjIdx = 0;
  renderProjections(analyze(visibleEntries()));
  showToast("Novas combinações geradas!");
});

$("btn-copy").addEventListener("click", () => {
  copyText(currentProjections.map((p) => `${p.num} (${p.bicho.nome} - G${p.bicho.grupo})`).join(", "), "Copiado com os bichos!");
});

$("btn-export-text").addEventListener("click", () => {
  const lines = visibleEntries().map(({ block, idx }) => {
    const meta = [block.date && fmtDate(block.date), block.label].filter(Boolean).join(" - ");
    return `Bloco ${idx + 1}${meta ? ` (${meta})` : ""}: ${block.nums.join(", ")}`;
  });
  if (!lines.length) return showToast("Nada para copiar.");
  copyText(lines.join("\n"), "Histórico copiado!");
});

$("btn-add").addEventListener("click", submitBlock);
$("block-input").addEventListener("keydown", (e) => { if (e.key === "Enter") submitBlock(); });
$("btn-cancel-edit").addEventListener("click", () => { exitEdit(); renderHistory(visibleEntries()); });

$("btn-clear").addEventListener("click", () => {
  if (!state.blocks.length) return;
  if (!confirm("Apagar todo o histórico? Baixe um backup antes se quiser guardar.")) return;
  if (editingIdx !== null) exitEdit();
  state.blocks = [];
  save();
  resetProjections();
  renderAll();
  showToast("Histórico limpo.");
});

$("btn-backup").addEventListener("click", backupFile);
$("btn-backup-alert").addEventListener("click", backupFile);
$("btn-restore").addEventListener("click", () => $("file-restore").click());
$("file-restore").addEventListener("change", (e) => {
  if (e.target.files[0]) restoreFile(e.target.files[0]);
  e.target.value = "";
});
$("btn-restore-merge").addEventListener("click", () => pendingRestore && applyRestore(pendingRestore, "merge"));
$("btn-restore-replace").addEventListener("click", () => pendingRestore && applyRestore(pendingRestore, "replace"));
$("btn-restore-cancel").addEventListener("click", () => { pendingRestore = null; renderBackupInfo(); });

/* ---------- PWA ---------- */

let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $("btn-install").hidden = false;
});
$("btn-install").addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $("btn-install").hidden = true;
});
window.addEventListener("appinstalled", () => { $("install-box").hidden = true; });
if (window.matchMedia("(display-mode: standalone)").matches || navigator.standalone) {
  $("install-box").hidden = true;
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

/* ---------- Início ---------- */

state = loadState();
$("block-date").value = todayISO();
renderAll();
if (state.blocks.length) requestPersistence();
if (needsBackupReminder()) {
  const age = backupAge();
  showToast(age === null ? "Você ainda não fez backup dos seus dados." : `Faz ${age} dias desde o último backup.`, {
    label: "Baixar",
    fn: backupFile
  });
}
