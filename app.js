"use strict";

const BICHOS = [
  "Avestruz", "Águia", "Burro", "Borboleta", "Cachorro", "Cabra", "Carneiro",
  "Camelo", "Cobra", "Coelho", "Cavalo", "Elefante", "Galo", "Gato", "Jacaré",
  "Leão", "Macaco", "Porco", "Pavão", "Peru", "Touro", "Tigre", "Urso", "Veado", "Vaca"
];

const DEFAULT_BLOCKS = [
  ["8944", "5819", "7901", "3095", "6383"],
  ["9864", "1637", "3745", "0452", "6959"],
  ["0714", "3612", "3037", "6251", "7521"],
  ["0015", "0235", "3620", "8299", "1756"]
];

const STORAGE_KEY = "radar_milhares_blocks_v1";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let blocks = loadBlocks();
let currentProjections = [];
let selectedProjIdx = 0;
let variationSeed = 0;
let lastRemoved = null; // para desfazer

/* ---------- Dados ---------- */

function isValidBlocks(v) {
  return Array.isArray(v) && v.every((b) => Array.isArray(b) && b.every((n) => /^\d{4}$/.test(n)));
}

function loadBlocks() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      const parsed = JSON.parse(saved);
      if (isValidBlocks(parsed)) return parsed;
    }
  } catch (e) {}
  return JSON.parse(JSON.stringify(DEFAULT_BLOCKS));
}

function saveBlocks() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(blocks)); } catch (e) {}
}

/* ---------- Bichos ---------- */

function getBichoInfo(milhar) {
  const dz = parseInt(milhar.slice(2, 4), 10);
  const idx = dz === 0 ? 24 : Math.floor((dz - 1) / 4);
  return { dezena: milhar.slice(2, 4), grupo: String(idx + 1).padStart(2, "0"), nome: BICHOS[idx] };
}

/* ---------- Análise ---------- */

function analyze() {
  const flat = blocks.flat();
  const freq = [0, 1, 2, 3].map(() => Array(10).fill(0));
  const lastSeen = [0, 1, 2, 3].map(() => Array(10).fill(-1));

  flat.forEach((n, idx) => {
    for (let pos = 0; pos < 4; pos++) {
      const d = +n[pos];
      freq[pos][d]++;
      lastSeen[pos][d] = idx;
    }
  });

  // Do menos frequente / mais antigo para o mais frequente / mais recente.
  const rankedByPos = [0, 1, 2, 3].map((pos) =>
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].sort((a, b) =>
      freq[pos][a] - freq[pos][b] || lastSeen[pos][a] - lastSeen[pos][b] || a - b
    )
  );
  return { flat, freq, rankedByPos };
}

function buildProjections(stats) {
  const { freq, rankedByPos } = stats;
  const labels = ["Milhar", "Centena", "Dezena", "Unidade"];
  const out = [];
  const seen = new Set();

  // Cada casa anda em um ritmo diferente, para os 5 palpites não ficarem colados.
  const steps = [1, 2, 3, 1];
  for (let i = 0, tries = 0; out.length < 5 && tries < 200; tries++) {
    const k = tries;
    const digits = [];
    const breakdown = [];
    let zeroCount = 0;
    for (let pos = 0; pos < 4; pos++) {
      const idx = (k * steps[pos] + pos * variationSeed + (variationSeed ? k : 0)) % 6;
      const d = rankedByPos[pos][idx];
      const f = freq[pos][d];
      if (f === 0) zeroCount++;
      digits.push(d);
      breakdown.push({ posLabel: labels[pos], digit: d, freq: f });
    }
    const num = digits.join("");
    if (seen.has(num)) continue;
    seen.add(num);
    out.push({ num, bicho: getBichoInfo(num), zeroCount, breakdown });
    i++;
  }
  return out;
}

/* ---------- Render ---------- */

function renderAll() {
  const stats = analyze();
  $("kpi-total").textContent = stats.flat.length;

  let totalZeros = 0;
  const posLabels = ["Milhar (M)", "Centena (C)", "Dezena (D)", "Unidade (U)"];
  $("zeros-grid").innerHTML = posLabels.map((label, pos) => {
    const zeros = [];
    for (let d = 0; d < 10; d++) if (stats.freq[pos][d] === 0) zeros.push(d);
    totalZeros += zeros.length;
    const txt = !stats.flat.length ? "—" : zeros.length ? zeros.join(", ") : "Fechado";
    return `<div class="zero-tile"><span class="zero-tile-pos">${label}</span>
      <span class="zero-tile-digits ${zeros.length ? "" : "done"}">${txt}</span></div>`;
  }).join("");

  $("kpi-zeros").textContent = totalZeros;
  $("zeros-badge").textContent = `${totalZeros} dígito${totalZeros === 1 ? "" : "s"} zerado${totalZeros === 1 ? "" : "s"}`;

  currentProjections = buildProjections(stats);
  if (selectedProjIdx >= currentProjections.length) selectedProjIdx = 0;

  $("proj-carousel").innerHTML = currentProjections.map((p, idx) => `
    <div class="ticket-card ${idx === selectedProjIdx ? "active" : ""}" data-idx="${idx}">
      <div class="ticket-rank"><span>#${idx + 1}</span><span>${p.zeroCount > 0 ? p.zeroCount + "x 0" : "raro"}</span></div>
      <div class="ticket-number">${p.num}</div>
      <div>
        <div class="ticket-animal">${esc(p.bicho.nome)}</div>
        <div class="ticket-group">Grupo ${p.bicho.grupo} &bull; dz ${p.bicho.dezena}</div>
      </div>
    </div>`).join("");

  const sel = currentProjections[selectedProjIdx];
  $("inspector-box").innerHTML = sel ? `
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
    </div>` : "";

  let rows = "";
  for (let d = 0; d < 10; d++) {
    rows += `<tr><td>${d}</td>`;
    for (let pos = 0; pos < 4; pos++) {
      const f = stats.freq[pos][d];
      const cls = f === 0 ? "hm-zero" : f === 1 ? "hm-late" : "hm-norm";
      rows += `<td><span class="hm-pill ${cls}">${f}x</span></td>`;
    }
    rows += "</tr>";
  }
  $("heatmap-body").innerHTML = rows;

  const hist = $("history-container");
  if (!blocks.length) {
    hist.innerHTML = `<div style="color:var(--text-muted); font-size:13px;">Nenhum bloco lançado. Use a barra inferior para adicionar.</div>`;
  } else {
    hist.innerHTML = blocks.map((blk, bIdx) => ({ blk, bIdx })).reverse().map(({ blk, bIdx }) => `
      <div class="hist-card">
        <div class="hist-header">
          <span><strong>Bloco ${bIdx + 1}</strong> &bull; ${blk.length} milhares</span>
          <button data-del="${bIdx}" style="background:none;border:none;color:#fda4af;font-size:11px;font-weight:700;cursor:pointer;">Remover</button>
        </div>
        <div class="hist-list">
          ${blk.map((n) => `<div class="hist-pill">${n}<span>${esc(getBichoInfo(n).nome)}</span></div>`).join("")}
        </div>
      </div>`).join("");
  }
}

/* ---------- Ações ---------- */

let toastTimer;
function showToast(msg, action) {
  const t = $("toast");
  t.textContent = msg;
  if (action) {
    const a = document.createElement("span");
    a.className = "toast-action";
    a.textContent = action.label;
    a.onclick = () => { action.fn(); t.classList.remove("show"); };
    t.appendChild(a);
  }
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), action ? 5000 : 2000);
}

function openView(name) {
  document.querySelectorAll(".view-section").forEach((v) => v.classList.remove("active"));
  document.querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  $("view-" + name).classList.add("active");
  window.scrollTo(0, 0);
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

function addBlock() {
  const input = $("block-input");
  const raw = input.value.trim();
  if (!raw) return;

  const tokens = raw.split(/[\s,;.\-/]+/).filter(Boolean);
  const valid = [];
  const ignored = [];
  for (const tok of tokens) {
    if (/^\d{4}$/.test(tok)) valid.push(tok);
    else ignored.push(tok);
  }

  if (!valid.length) {
    showToast("Digite milhares com 4 dígitos (ex: 2178, 4300)");
    return;
  }

  blocks.push(valid);
  saveBlocks();
  input.value = "";
  variationSeed = 0;
  selectedProjIdx = 0;
  renderAll();
  showToast(ignored.length
    ? `Bloco ${blocks.length} lançado. Ignorados: ${ignored.join(", ")}`
    : `Bloco ${blocks.length} lançado (${valid.length} milhares)!`);
}

function deleteBlock(idx) {
  lastRemoved = { idx, block: blocks[idx] };
  blocks.splice(idx, 1);
  saveBlocks();
  renderAll();
  showToast("Bloco removido.", {
    label: "Desfazer",
    fn: () => {
      if (!lastRemoved) return;
      blocks.splice(lastRemoved.idx, 0, lastRemoved.block);
      lastRemoved = null;
      saveBlocks();
      renderAll();
    }
  });
}

function backupFile() {
  const data = JSON.stringify({ app: "radar-milhares", version: 1, exportedAt: new Date().toISOString(), blocks }, null, 2);
  const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `radar-milhares-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Backup baixado!");
}

function restoreFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const incoming = Array.isArray(parsed) ? parsed : parsed.blocks;
      if (!isValidBlocks(incoming)) throw new Error("formato");
      if (!confirm(`Substituir o histórico atual por ${incoming.length} bloco(s) do backup?`)) return;
      blocks = incoming;
      saveBlocks();
      variationSeed = 0;
      selectedProjIdx = 0;
      renderAll();
      showToast("Backup restaurado!");
    } catch (e) {
      showToast("Arquivo de backup inválido.");
    }
  };
  reader.readAsText(file);
}

/* ---------- Eventos ---------- */

document.querySelectorAll(".seg-btn").forEach((b) => b.addEventListener("click", () => openView(b.dataset.view)));

$("proj-carousel").addEventListener("click", (e) => {
  const card = e.target.closest(".ticket-card");
  if (!card) return;
  selectedProjIdx = +card.dataset.idx;
  renderAll();
});

$("history-container").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-del]");
  if (btn) deleteBlock(+btn.dataset.del);
});

$("btn-regen").addEventListener("click", () => {
  variationSeed++;
  selectedProjIdx = 0;
  renderAll();
  showToast("Novos palpites gerados!");
});

$("btn-copy").addEventListener("click", () => {
  copyText(currentProjections.map((p) => `${p.num} (${p.bicho.nome} - G${p.bicho.grupo})`).join(", "), "Copiado com os bichos!");
});

$("btn-export-text").addEventListener("click", () => {
  copyText(blocks.map((b, i) => `Bloco ${i + 1}: ${b.join(", ")}`).join("\n"), "Histórico copiado!");
});

$("btn-add").addEventListener("click", addBlock);
$("block-input").addEventListener("keydown", (e) => { if (e.key === "Enter") addBlock(); });

$("btn-reset").addEventListener("click", () => {
  if (!confirm("Substituir o histórico pelos 4 blocos originais?")) return;
  blocks = JSON.parse(JSON.stringify(DEFAULT_BLOCKS));
  saveBlocks(); variationSeed = 0; renderAll();
  showToast("4 blocos originais restaurados!");
});

$("btn-clear").addEventListener("click", () => {
  if (!confirm("Apagar todo o histórico? Baixe um backup antes se quiser guardar.")) return;
  blocks = [];
  saveBlocks(); variationSeed = 0; renderAll();
  showToast("Histórico limpo.");
});

$("btn-backup").addEventListener("click", backupFile);
$("btn-restore").addEventListener("click", () => $("file-restore").click());
$("file-restore").addEventListener("change", (e) => {
  if (e.target.files[0]) restoreFile(e.target.files[0]);
  e.target.value = "";
});

/* ---------- PWA ---------- */

let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $("btn-install").style.display = "inline-flex";
});
$("btn-install").addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $("btn-install").style.display = "none";
});
window.addEventListener("appinstalled", () => { $("install-box").style.display = "none"; });
if (window.matchMedia("(display-mode: standalone)").matches || navigator.standalone) {
  $("install-box").style.display = "none";
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

renderAll();
