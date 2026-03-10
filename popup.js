const animeListEl = document.getElementById("anime-list");
const emptyStateEl = document.getElementById("empty-state");

const INTERNAL_KEYS = ["_domain", "_domain_history", "_gh_token", "_gist_id"];

let currentDomain = null;

// Charge et affiche tous les animes suivis
async function loadAnimeList() {
  const allData = await chrome.storage.local.get(null);
  animeListEl.innerHTML = "";

  // Récupérer le dernier domaine connu
  currentDomain = allData._domain || null;

  // Fonction pour vérifier si un anime a des saisons visibles
  function hasVisibleSeasons(anime) {
    if (!anime || !anime.seasons) return false;
    return Object.values(anime.seasons).some(
      (s) => s.watched && s.watched.length > 0
    );
  }

  const slugs = Object.keys(allData).filter(
    (key) => !INTERNAL_KEYS.includes(key) && hasVisibleSeasons(allData[key])
  );

  if (slugs.length === 0) {
    emptyStateEl.style.display = "block";
    return;
  }

  emptyStateEl.style.display = "none";

  slugs.sort((a, b) => {
    const nameA = allData[a].name || a;
    const nameB = allData[b].name || b;
    return nameA.localeCompare(nameB);
  });

  slugs.forEach((slug) => {
    const anime = allData[slug];
    const card = createAnimeCard(slug, anime);
    animeListEl.appendChild(card);
  });
}

// Construit l'URL vers une page anime-sama, avec hash vers le dernier épisode vu
function buildURL(slug, seasonKey, lastEpisode) {
  if (!currentDomain) return null;
  const base = `${currentDomain}/catalogue/${slug}/${seasonKey}/`;
  return lastEpisode ? `${base}#ep${lastEpisode}` : base;
}

// Crée une carte pour un anime
function createAnimeCard(slug, anime) {
  const card = document.createElement("div");
  card.className = "anime-card";

  // Header avec nom + bouton supprimer
  const header = document.createElement("div");
  header.className = "anime-header";

  const name = document.createElement("a");
  name.className = "anime-name";
  name.textContent = anime.name || slug;

  // Filtrer: saisons avec au moins 1 épisode vu
  const seasonKeys = Object.keys(anime.seasons || {})
    .filter((key) => {
      const s = anime.seasons[key];
      return s.watched && s.watched.length > 0;
    })
    .sort();

  // Lien vers la dernière saison consultée (celle avec le lastWatched le plus récent)
  let lastSeasonKey = seasonKeys[0] || null;
  for (const key of seasonKeys) {
    const s = anime.seasons[key];
    if (s.lastEpisode && (!lastSeasonKey || (s.lastWatched || "") > (anime.seasons[lastSeasonKey].lastWatched || ""))) {
      lastSeasonKey = key;
    }
  }
  const lastEp = lastSeasonKey ? anime.seasons[lastSeasonKey].lastEpisode : null;
  const animeURL = lastSeasonKey ? buildURL(slug, lastSeasonKey, lastEp) : null;
  if (animeURL) {
    name.href = animeURL;
    name.title = `Ouvrir ${anime.name || slug}`;
    name.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: animeURL });
    });
  }

  const btnDel = document.createElement("button");
  btnDel.className = "btn-delete";
  btnDel.textContent = "\u00d7";
  btnDel.title = "Supprimer cet anime";
  btnDel.addEventListener("click", async () => {
    if (confirm(`Supprimer l'historique de "${anime.name || slug}" ?`)) {
      await chrome.storage.local.remove(slug);
      chrome.runtime.sendMessage({ action: "triggerPush" });
      loadAnimeList();
    }
  });

  header.appendChild(name);
  header.appendChild(btnDel);
  card.appendChild(header);

  // Saisons
  seasonKeys.forEach((key) => {
    const season = anime.seasons[key];
    const watched = season.watched ? season.watched.length : 0;
    const total = season.total || 0;
    const pct = total > 0 ? Math.round((watched / total) * 100) : 0;

    const entry = document.createElement("div");
    entry.className = "season-entry";

    const label = document.createElement("div");
    label.className = "season-label";

    // Lien cliquable vers la saison, au dernier épisode vu
    const seasonURL = buildURL(slug, key, season.lastEpisode);
    const prettyKey = key
      .replace(/saison(\d+)/, "S$1")
      .replace(/\//, " ")
      .toUpperCase();

    const labelText = document.createElement(seasonURL ? "a" : "span");
    labelText.textContent = prettyKey;
    if (seasonURL) {
      labelText.href = seasonURL;
      labelText.className = "season-link";
      labelText.title = `Ouvrir ${prettyKey}`;
      labelText.addEventListener("click", (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: seasonURL });
      });
    }

    const progressText = document.createElement("span");
    progressText.className = "season-progress-text";
    progressText.textContent = `${watched}/${total}`;

    const btnDelSeason = document.createElement("button");
    btnDelSeason.className = "btn-delete-season";
    btnDelSeason.textContent = "\u00d7";
    btnDelSeason.title = `Supprimer ${prettyKey}`;
    btnDelSeason.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (confirm(`Supprimer "${prettyKey}" de ${anime.name || slug} ?`)) {
        delete anime.seasons[key];
        // Si plus de saisons, supprimer l'anime entier
        if (Object.keys(anime.seasons).length === 0) {
          await chrome.storage.local.remove(slug);
        } else {
          await chrome.storage.local.set({ [slug]: anime });
        }
        chrome.runtime.sendMessage({ action: "triggerPush" });
        loadAnimeList();
      }
    });

    label.appendChild(labelText);
    label.appendChild(progressText);
    label.appendChild(btnDelSeason);

    const barBg = document.createElement("div");
    barBg.className = "progress-bar-bg";

    const barFill = document.createElement("div");
    barFill.className = "progress-bar-fill";
    barFill.style.width = `${pct}%`;

    barBg.appendChild(barFill);

    entry.appendChild(label);
    entry.appendChild(barBg);
    card.appendChild(entry);
  });

  return card;
}

// ===================== Domain Section =====================

const domainToggle = document.getElementById("domain-toggle");
const domainConfig = document.getElementById("domain-config");
const domainCurrentEl = document.getElementById("domain-current");
const domainHistoryList = document.getElementById("domain-history-list");
const domainInput = document.getElementById("domain-input");
const btnDomainSet = document.getElementById("btn-domain-set");

// Toggle la section domaine
domainToggle.addEventListener("click", () => {
  domainConfig.style.display = domainConfig.style.display === "none" ? "block" : "none";
});

async function loadDomainSection() {
  const { _domain: domain, _domain_history: history } =
    await chrome.storage.local.get(["_domain", "_domain_history"]);

  // Afficher le domaine actuel dans le header
  if (domain) {
    try {
      domainCurrentEl.textContent = new URL(domain).hostname;
    } catch {
      domainCurrentEl.textContent = domain;
    }
  } else {
    domainCurrentEl.textContent = "non défini";
  }

  // Peupler la liste historique
  domainHistoryList.innerHTML = "";
  const entries = history || [];
  if (entries.length === 0) {
    domainHistoryList.innerHTML = '<div class="domain-history-empty">Aucun historique</div>';
    return;
  }

  entries.slice().reverse().forEach((entry) => {
    const item = document.createElement("div");
    item.className = "domain-history-item";
    if (entry.domain === domain) item.classList.add("domain-active");

    const label = document.createElement("span");
    try {
      label.textContent = new URL(entry.domain).hostname;
    } catch {
      label.textContent = entry.domain;
    }

    const date = document.createElement("span");
    date.className = "domain-history-date";
    date.textContent = entry.date;

    item.appendChild(label);
    item.appendChild(date);

    if (entry.domain !== domain) {
      item.style.cursor = "pointer";
      item.title = "Utiliser ce domaine";
      item.addEventListener("click", async () => {
        await chrome.storage.local.set({ _domain: entry.domain });
        await loadDomainSection();
        await loadAnimeList();
      });
    }

    domainHistoryList.appendChild(item);
  });
}

// Bouton Appliquer : domaine manuel
btnDomainSet.addEventListener("click", async () => {
  let value = domainInput.value.trim();
  if (!value) return;

  // Normaliser en URL
  if (!value.startsWith("http")) {
    value = "https://" + value;
  }
  // Retirer le trailing slash
  value = value.replace(/\/+$/, "");

  const { _domain_history: history } = await chrome.storage.local.get("_domain_history");
  const domainHistory = history || [];

  if (!domainHistory.some(e => e.domain === value)) {
    domainHistory.push({ domain: value, date: new Date().toISOString().split("T")[0] });
  }

  await chrome.storage.local.set({
    _domain: value,
    _domain_history: domainHistory
  });

  domainInput.value = "";
  chrome.runtime.sendMessage({ action: "triggerPush" });
  await loadDomainSection();
  await loadAnimeList();
});

// ===================== GitHub Gist Sync =====================

const syncToggle = document.getElementById("sync-toggle");
const syncConfig = document.getElementById("sync-config");
const ghTokenInput = document.getElementById("gh-token");
const btnSync = document.getElementById("btn-sync");
const btnDisconnect = document.getElementById("btn-sync-disconnect");
const syncStatus = document.getElementById("sync-status");
const syncMsg = document.getElementById("sync-msg");

const GIST_FILENAME = "anime-sama-tracker.json";

function showSyncMsg(text, type) {
  syncMsg.textContent = text;
  syncMsg.className = `sync-msg ${type}`;
}

// Toggle la section sync
syncToggle.addEventListener("click", () => {
  syncConfig.style.display = syncConfig.style.display === "none" ? "block" : "none";
});

// Lien vers création de token
document.getElementById("token-link").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: e.target.href });
});

// Charge la config sync au démarrage
async function loadSyncConfig() {
  const { _gh_token, _gist_id } = await chrome.storage.local.get(["_gh_token", "_gist_id"]);
  if (_gh_token) {
    ghTokenInput.value = _gh_token;
    btnDisconnect.style.display = "block";
    syncStatus.textContent = _gist_id ? "connecte" : "token ok";
    syncStatus.style.color = "#4caf50";
  }
}

// Chercher un Gist existant avec le bon fichier
async function findExistingGist(token) {
  const resp = await fetch("https://api.github.com/gists?per_page=100", {
    headers: { Authorization: `token ${token}` }
  });
  if (!resp.ok) throw new Error(`GitHub API: ${resp.status}`);
  const gists = await resp.json();
  for (const gist of gists) {
    if (gist.files && gist.files[GIST_FILENAME]) {
      return gist.id;
    }
  }
  return null;
}

// Lire un Gist existant
async function readGist(token, gistId) {
  const resp = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: { Authorization: `token ${token}` }
  });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`GitHub API: ${resp.status}`);
  const gist = await resp.json();
  const file = gist.files[GIST_FILENAME];
  if (!file) return null;
  return JSON.parse(file.content);
}

// Créer un nouveau Gist
async function createGist(token, data) {
  const resp = await fetch("https://api.github.com/gists", {
    method: "POST",
    headers: {
      Authorization: `token ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      description: "Anime-Sama Watch Tracker - sync data",
      public: false,
      files: { [GIST_FILENAME]: { content: JSON.stringify(data, null, 2) } }
    })
  });
  if (!resp.ok) throw new Error(`GitHub API: ${resp.status}`);
  return await resp.json();
}

// Bouton Synchroniser - fait un PULL (gist -> local)
btnSync.addEventListener("click", async () => {
  const token = ghTokenInput.value.trim();
  if (!token) {
    showSyncMsg("Entre ton GitHub token", "error");
    return;
  }

  btnSync.disabled = true;
  btnSync.textContent = "Sync...";
  showSyncMsg("", "");

  try {
    await chrome.storage.local.set({ _gh_token: token });

    let { _gist_id: gistId } = await chrome.storage.local.get("_gist_id");

    if (!gistId) {
      // Chercher un Gist existant
      gistId = await findExistingGist(token);
      if (gistId) {
        await chrome.storage.local.set({ _gist_id: gistId });
      }
    }

    if (gistId) {
      // PULL: Gist -> local (le gist fait foi)
      const remoteData = await readGist(token, gistId);
      if (remoteData) {
        // Supprimer toutes les anciennes données locales (sauf clés internes)
        const allLocal = await chrome.storage.local.get(null);
        const keysToRemove = Object.keys(allLocal).filter(k => !INTERNAL_KEYS.includes(k));
        if (keysToRemove.length > 0) {
          await chrome.storage.local.remove(keysToRemove);
        }
        // Écrire les données du gist
        for (const [key, value] of Object.entries(remoteData)) {
          await chrome.storage.local.set({ [key]: value });
        }
        showSyncMsg("Pull OK - donnees du gist chargees", "success");
      } else {
        showSyncMsg("Gist vide ou corrompu", "error");
      }
    } else {
      // Pas de Gist : en créer un avec les données locales
      const allLocal = await chrome.storage.local.get(null);
      const data = {};
      for (const [key, value] of Object.entries(allLocal)) {
        if (!INTERNAL_KEYS.includes(key) && value && value.seasons) {
          data[key] = value;
        }
        if (key === "_domain" && value) {
          data[key] = value;
        }
        if (key === "_domain_history" && value) {
          data[key] = value;
        }
      }
      const gist = await createGist(token, data);
      await chrome.storage.local.set({ _gist_id: gist.id });
      showSyncMsg("Gist cree avec donnees locales", "success");
    }

    syncStatus.textContent = "connecte";
    syncStatus.style.color = "#4caf50";
    btnDisconnect.style.display = "block";
    loadAnimeList();
    loadDomainSection();
  } catch (err) {
    showSyncMsg(`Erreur: ${err.message}`, "error");
  }

  btnSync.disabled = false;
  btnSync.textContent = "Synchroniser";
});

// Déconnecter
btnDisconnect.addEventListener("click", async () => {
  await chrome.storage.local.remove(["_gh_token", "_gist_id"]);
  ghTokenInput.value = "";
  syncStatus.textContent = "";
  btnDisconnect.style.display = "none";
  showSyncMsg("Deconnecte", "success");
});

// Pull silencieux à l'ouverture du popup (gist fait foi)
async function autoPullOnOpen() {
  const { _gh_token: token, _gist_id: gistId } = await chrome.storage.local.get(["_gh_token", "_gist_id"]);
  if (!token || !gistId) return;

  try {
    // Vérifier si un push est en attente
    const response = await chrome.runtime.sendMessage({ action: "canPull" });
    if (!response || !response.canPull) {
      console.log("Pull bloqué - push en attente");
      return;
    }

    const remoteData = await readGist(token, gistId);
    if (remoteData) {
      // Supprimer toutes les anciennes données locales (sauf clés internes)
      const allLocal = await chrome.storage.local.get(null);
      const keysToRemove = Object.keys(allLocal).filter(k => !INTERNAL_KEYS.includes(k));
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
      }
      // Écrire les données du gist
      for (const [key, value] of Object.entries(remoteData)) {
        await chrome.storage.local.set({ [key]: value });
      }
      loadAnimeList();
      loadDomainSection();
    }
  } catch (err) {
    console.error("Auto-pull erreur:", err.message);
  }
}

// Chargement initial
loadAnimeList();
loadDomainSection();
loadSyncConfig();
autoPullOnOpen();
