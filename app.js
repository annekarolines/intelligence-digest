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

  grid.innerHTML = "";
  top3.forEach(article => grid.appendChild(buildNvdsCard(article)));
}

function buildNvdsCard(article) {
  const card = document.createElement("a");
  card.className = "nvds-card";
  card.href = article.url || "#";
  card.target = "_blank";
  card.rel = "noopener";
  card.dataset.cat = article.category || "";

  // Visual: imagem ou gradiente
  const visual = document.createElement("div");
  visual.className = "nvds-card-visual";
  if (article.image_url) {
    const img = document.createElement("img");
    img.className = "nvds-card-img";
    img.src = article.image_url;
    img.alt = "";
    img.loading = "lazy";
    img.onerror = () => { img.replaceWith(makeGradient()); };
    visual.appendChild(img);
  } else {
    visual.appendChild(makeGradient());
  }

  // Body
  const body = document.createElement("div");
  body.className = "nvds-card-body";

  const top = document.createElement("div");
  top.className = "nvds-card-top";
  const badge = document.createElement("span");
  badge.className = "card-badge";
  badge.textContent = article.category || "—";
  const s = article.relevance_score || 0;
  const score = document.createElement("span");
  score.className = `card-score${s >= 8 ? " high" : s >= 6 ? " med" : ""}`;
  score.textContent = `${s}/10`;
  top.appendChild(badge);
  top.appendChild(score);

  const title = document.createElement("h3");
  title.className = "nvds-card-title";
  title.textContent = article.title_pt || article.title || "";

  const summary = document.createElement("p");
  summary.className = "nvds-card-summary";
  summary.textContent = article.summary || "";

  body.appendChild(top);
  body.appendChild(title);
  body.appendChild(summary);
  card.appendChild(visual);
  card.appendChild(body);
  return card;
}

function makeGradient() {
  const div = document.createElement("div");
  div.className = "nvds-card-gradient";
  return div;
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
    return;
  }

  emptyState.style.display = "none";

  const total = allArticles.length;
  const showing = filtered.length;
  const catLabel = activeFilter === "all" ? "todas as categorias" : activeFilter;

  statsBar.textContent = showing === total
    ? `${total} artigos dos últimos 3 meses`
    : `${showing} de ${total} artigos — ${catLabel}`;

  if (!filtered.length) {
    const msg = document.createElement("div");
    msg.className = "empty-state";
    msg.style.cssText = "display:flex;padding:40px 0";
    msg.innerHTML = `<p style="color:var(--text-muted);font-size:.875rem">Nenhum artigo encontrado para "<strong>${escapeHtml(searchQuery)}</strong>"</p>`;
    grid.appendChild(msg);
    return;
  }

  const template = document.getElementById("cardTemplate");
  filtered.forEach(article => {
    const card = buildCard(template, article);
    grid.appendChild(card);
  });
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
  renderAll();
});

let searchTimeout;
document.getElementById("searchInput").addEventListener("input", e => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    searchQuery = e.target.value.trim();
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
