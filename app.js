/* Intelligence Digest — Frontend */

const DATA_URL = "data/articles.json";

const CATEGORY_LABELS = {
  "IA": "IA",
  "Redes Sociais": "Redes Sociais",
  "Comportamento": "Comportamento",
  "Estratégia": "Estratégia",
  "Dados & Métricas": "Dados & Métricas",
};

let allArticles = [];
let activeFilter = "all";
let searchQuery = "";
let currentPage = 1;
const PAGE_SIZE = 10;

// --- Data loading ---

async function loadData() {
  try {
    const res = await fetch(`${DATA_URL}?_=${Date.now()}`);
    if (!res.ok) throw new Error("Arquivo não encontrado");
    const data = await res.json();
    allArticles = data.articles || [];
    updateLastUpdated(data.last_updated);
    renderNvds();
    renderAll();
  } catch (err) {
    document.getElementById("emptyState").style.display = "flex";
    document.getElementById("statsBar").textContent = "";
  }
}

function updateLastUpdated(iso) {
  const el = document.getElementById("lastUpdated");
  if (!iso) return;
  const d = new Date(iso);
  const opts = { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" };
  el.textContent = `Atualizado em ${d.toLocaleDateString("pt-BR", opts)}`;
}

// --- Filtering & search ---

function getFiltered() {
  return allArticles.filter(a => {
    const matchCat = activeFilter === "all" || a.category === activeFilter;
    const q = searchQuery.toLowerCase();
    const matchSearch = !q ||
      a.title_pt?.toLowerCase().includes(q) ||
      a.title?.toLowerCase().includes(q) ||
      a.summary?.toLowerCase().includes(q) ||
      a.key_insights?.some(i => i.toLowerCase().includes(q)) ||
      a.actionable_points?.some(p => p.toLowerCase().includes(q));
    return matchCat && matchSearch;
  });
}

// --- nvds ---

function renderNvds() {
  const section = document.getElementById("nvdsSection");
  const grid = document.getElementById("nvdsGrid");
  const summaryEl = document.getElementById("nvdsSummary");

  if (!allArticles.length) { section.style.display = "none"; return; }

  // Artigos da rodagem mais recente (data mais alta)
  const mostRecentDate = allArticles[0]?.date;
  const todayArticles = allArticles.filter(a => a.date === mostRecentDate);

  // Top 3 por relevância
  const top3 = [...todayArticles]
    .sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0))
    .slice(0, 3);

  // Resumo do dia
  const catCounts = {};
  todayArticles.forEach(a => { catCounts[a.category] = (catCounts[a.category] || 0) + 1; });
  const catStr = Object.entries(catCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, n]) => `${n} ${cat.toLowerCase()}`)
    .join(" · ");
  const d = new Date(mostRecentDate + "T12:00:00");
  const dateStr = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
  summaryEl.textContent = `${dateStr} · ${todayArticles.length} artigos coletados · ${catStr}`;

  const template = document.getElementById("cardTemplate");
  grid.innerHTML = "";
  top3.forEach(article => grid.appendChild(buildCard(template, article)));
}

// --- Rendering ---

function renderAll() {
  const filtered = getFiltered();
  const grid = document.getElementById("articlesGrid");
  const emptyState = document.getElementById("emptyState");
  const statsBar = document.getElementById("statsBar");

  grid.innerHTML = "";

  if (!allArticles.length) {
    emptyState.style.display = "flex";
    statsBar.textContent = "";
    renderPagination(0, 0);
    return;
  }

  emptyState.style.display = "none";

  const total = allArticles.length;
  const showing = filtered.length;
  const catLabel = activeFilter === "all" ? "todas as categorias" : activeFilter;
  const totalPages = Math.ceil(showing / PAGE_SIZE);
  if (currentPage > totalPages) currentPage = 1;

  statsBar.textContent = showing === total
    ? `${total} artigos dos últimos 3 meses`
    : `${showing} de ${total} artigos — ${catLabel}`;

  if (!filtered.length) {
    const msg = document.createElement("div");
    msg.className = "empty-state";
    msg.style.cssText = "display:flex;padding:40px 0";
    msg.innerHTML = `<p style="color:var(--text-muted);font-size:.875rem">Nenhum artigo encontrado para "<strong>${escapeHtml(searchQuery)}</strong>"</p>`;
    grid.appendChild(msg);
    renderPagination(0, 0);
    return;
  }

  const start = (currentPage - 1) * PAGE_SIZE;
  const paginated = filtered.slice(start, start + PAGE_SIZE);
  const template = document.getElementById("cardTemplate");
  paginated.forEach(article => grid.appendChild(buildCard(template, article)));
  renderPagination(currentPage, totalPages);
}

function renderPagination(page, total) {
  const bar = document.getElementById("paginationBar");
  bar.innerHTML = "";
  if (total <= 1) return;

  const prev = document.createElement("button");
  prev.className = "page-btn" + (page <= 1 ? " disabled" : "");
  prev.disabled = page <= 1;
  prev.innerHTML = "← anterior";
  prev.addEventListener("click", () => { currentPage--; renderAll(); window.scrollTo({top: document.getElementById("tdsSection").offsetTop - 120, behavior:"smooth"}); });

  const info = document.createElement("span");
  info.className = "page-info";
  info.textContent = `${page} / ${total}`;

  const next = document.createElement("button");
  next.className = "page-btn" + (page >= total ? " disabled" : "");
  next.disabled = page >= total;
  next.innerHTML = "próximo →";
  next.addEventListener("click", () => { currentPage++; renderAll(); window.scrollTo({top: document.getElementById("tdsSection").offsetTop - 120, behavior:"smooth"}); });

  bar.appendChild(prev);
  bar.appendChild(info);
  bar.appendChild(next);
}

function buildCard(template, article) {
  const clone = template.content.cloneNode(true);
  const card = clone.querySelector(".card");

  // Category accent
  card.dataset.cat = article.category || "";

  // Top row
  card.querySelector(".card-badge").textContent = CATEGORY_LABELS[article.category] || article.category || "—";
  card.querySelector(".card-date").textContent = formatDate(article.date);

  // Relevance score
  const scoreEl = card.querySelector(".card-score");
  const score = article.relevance_score || 0;
  scoreEl.textContent = `${score}/10`;
  if (score >= 8) scoreEl.classList.add("high");
  else if (score >= 6) scoreEl.classList.add("med");

  // Title & summary
  card.querySelector(".card-title").textContent = article.title_pt || article.title || "Sem título";
  card.querySelector(".card-summary").textContent = article.summary || "";

  // Key insights
  const insightsList = card.querySelector(".key-insights-list");
  (article.key_insights || []).forEach(text => {
    const li = document.createElement("li");
    li.textContent = text;
    insightsList.appendChild(li);
  });

  // Actionable points
  const actionList = card.querySelector(".actionable-list");
  (article.actionable_points || []).forEach(text => {
    const li = document.createElement("li");
    li.textContent = text;
    actionList.appendChild(li);
  });

  // Toggle insights
  const toggle = card.querySelector(".insights-toggle");
  const body = card.querySelector(".insights-body");
  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    body.hidden = expanded;
  });

  // Link
  card.querySelector(".card-link").href = article.url || "#";

  return clone;
}

// --- Event listeners ---

document.getElementById("filterBar").addEventListener("click", e => {
  const pill = e.target.closest(".filter-pill");
  if (!pill) return;
  document.querySelectorAll(".filter-pill").forEach(p => p.classList.remove("active"));
  pill.classList.add("active");
  activeFilter = pill.dataset.cat;
  currentPage = 1;
  renderAll();
});

let searchTimeout;
document.getElementById("searchInput").addEventListener("input", e => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    searchQuery = e.target.value.trim();
    currentPage = 1;
    renderAll();
  }, 250);
});

// --- Utils ---

function formatDate(dateStr) {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

// --- Init ---
loadData();
