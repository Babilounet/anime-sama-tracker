// IIFE pour pouvoir faire un return early si pas anime-sama
(async function () {
  // Filtre: ne rien faire si le site n'est pas anime-sama
  if (!/^(www\.)?anime-sama\./i.test(window.location.hostname)) return;

  // Parse l'URL pour extraire slug, saison, langue
  function parseURL() {
    const path = window.location.pathname;
    const match = path.match(/\/catalogue\/([^/]+)\/([^/]+)\/([^/]+)/);
    if (!match) return null;
    return {
      slug: match[1],
      saison: match[2],
      langue: match[3],
      seasonKey: `${match[2]}/${match[3]}`
    };
  }

  function slugToName(slug) {
    return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  async function loadData(slug) {
    const result = await chrome.storage.local.get(slug);
    return result[slug] || null;
  }

  async function saveData(slug, data) {
    await chrome.storage.local.set({ [slug]: data });
  }

  function getEpisodeNumber(text) {
    const match = text.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  function getOrCreateWrapper(select) {
    let wrapper = document.getElementById("ast-tracker-wrapper");
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.id = "ast-tracker-wrapper";
      const container = select.parentElement;
      container.parentElement.insertBefore(wrapper, container.nextSibling);
    }
    return wrapper;
  }

  function renderTrackerPanel(select, seasonData) {
    const wrapper = getOrCreateWrapper(select);

    const total = select.options.length;
    const watchedCount = seasonData.watched.length;
    const pct = total > 0 ? (watchedCount / total) * 100 : 0;

    let html = `<div id="ast-tracker-panel">`;
    html += `<div class="ast-header"><span class="ast-title">Tracker</span><span class="ast-count">${watchedCount}/${total}</span></div>`;
    html += `<div class="ast-progress-bg"><div class="ast-progress-fill" style="width:${pct}%"></div></div>`;
    html += `<div class="ast-grid">`;

    for (let i = 0; i < total; i++) {
      const option = select.options[i];
      const epNum = getEpisodeNumber(option.textContent);
      if (epNum === null) continue;

      const isWatched = seasonData.watched.includes(epNum);
      const cls = isWatched ? "ast-dot ast-dot-watched" : "ast-dot";
      const title = isWatched
        ? `Episode ${epNum} - Vu (clic droit pour démarquer)`
        : `Episode ${epNum} - Clic pour marquer comme vu`;
      html += `<div class="${cls}" data-ep="${epNum}" title="${title}">${epNum}</div>`;
    }

    html += `</div></div>`;
    wrapper.innerHTML = html;
  }

  function updateSelectOptions(select, watched) {
    for (const option of select.options) {
      const raw = option.textContent.replace(/^✓\s*/, "");
      const epNum = getEpisodeNumber(raw);
      if (epNum !== null && watched.includes(epNum)) {
        option.textContent = `✓ ${raw}`;
      } else {
        option.textContent = raw;
      }
    }
  }

  // Badges sur la page catalogue
  async function handleCataloguePage(slug) {
    const animeData = await loadData(slug);
    if (!animeData || !animeData.seasons) return;

    // Attendre que les liens de saisons soient chargés
    function addBadges() {
      const links = [...document.querySelectorAll('a')].filter(
        (a) => /\/catalogue\/[^/]+\/[^/]+\/[^/]+/i.test(a.href) && !a.dataset.astBadged
      );
      if (links.length === 0) return false;

      links.forEach((link) => {
        link.dataset.astBadged = "true";
        // Extraire saison + langue du href
        const m = link.href.match(/\/([^/]+)\/([^/]+)\/?$/);
        if (!m) return;

        const seasonKey = `${m[1]}/${m[2]}`;
        const season = animeData.seasons[seasonKey];
        if (!season || !season.watched || season.watched.length === 0) return;

        const watched = season.watched.length;
        const total = season.total || 0;
        const isComplete = total > 0 && watched >= total;

        // Badge
        const badge = document.createElement("div");
        badge.className = isComplete ? "ast-badge ast-badge-complete" : "ast-badge";
        badge.textContent = total > 0 ? `${watched}/${total}` : `${watched}`;
        link.style.position = "relative";
        link.appendChild(badge);
      });

      return true;
    }

    if (!addBadges()) {
      const observer = new MutationObserver(() => {
        if (addBadges()) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  // Stocker le domaine actuel pour les liens dans le popup
  await chrome.storage.local.set({ _domain: window.location.origin });

  // Page catalogue (/catalogue/{slug}/) → afficher badges sur les saisons
  const catalogueMatch = window.location.pathname.match(/\/catalogue\/([^/]+)\/?$/);
  if (catalogueMatch) {
    await handleCataloguePage(catalogueMatch[1]);
    return;
  }

  const info = parseURL();
  if (!info) return;

  const { slug, seasonKey } = info;

  let animeData = (await loadData(slug)) || {
    name: slugToName(slug),
    seasons: {}
  };

  if (!animeData.seasons[seasonKey]) {
    animeData.seasons[seasonKey] = {
      watched: [],
      total: 0,
      lastWatched: null,
      lastEpisode: null
    };
  }

  const seasonData = animeData.seasons[seasonKey];

  // Marquer un épisode comme vu (factorisé)
  async function markEpisode(epNum, select) {
    if (seasonData.watched.includes(epNum)) return;
    seasonData.watched.push(epNum);
    seasonData.watched.sort((a, b) => a - b);
    seasonData.lastWatched = new Date().toISOString().split("T")[0];
    seasonData.lastEpisode = epNum;
    await saveData(slug, animeData);
    updateSelectOptions(select, seasonData.watched);
    renderTrackerPanel(select, seasonData);
    // Déclencher auto-sync
    chrome.runtime.sendMessage({ action: "triggerPush" });
  }

  // Sélectionner un épisode dans le dropdown du site
  function selectEpisode(select, epNum) {
    for (const option of select.options) {
      const raw = option.textContent.replace(/^✓\s*/, "");
      if (getEpisodeNumber(raw) === epNum) {
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }
    return false;
  }

  function setup(select) {
    if (select.dataset.trackerBound) return;
    select.dataset.trackerBound = "true";

    const total = select.options.length;
    if (total > seasonData.total) {
      seasonData.total = total;
      saveData(slug, animeData);
    }

    updateSelectOptions(select, seasonData.watched);
    renderTrackerPanel(select, seasonData);

    // Auto-sélectionner l'épisode depuis le hash (#ep5)
    const hashMatch = window.location.hash.match(/^#ep(\d+)$/);
    if (hashMatch) {
      const targetEp = parseInt(hashMatch[1], 10);
      selectEpisode(select, targetEp);
    }

    const wrapper = getOrCreateWrapper(select);

    // Épisodes démarqués manuellement (ignorés par le polling)
    const unmarkedEpisodes = new Set();

    select.addEventListener("change", async () => {
      const epNum = getEpisodeNumber(select.value);
      if (epNum === null) return;
      unmarkedEpisodes.delete(epNum); // Re-autorise le marquage si changement manuel
      await markEpisode(epNum, select);
    });

    // Les boutons Suivant/Précédent/Dernier changent le select sans
    // déclencher l'événement "change". On surveille la valeur du select.
    let lastSelectValue = select.value;
    setInterval(() => {
      if (select.value !== lastSelectValue) {
        lastSelectValue = select.value;
        const epNum = getEpisodeNumber(select.value);
        // Ne pas remarquer un épisode démarqué manuellement
        if (epNum !== null && !unmarkedEpisodes.has(epNum)) {
          markEpisode(epNum, select);
        }
      }
    }, 500);

    wrapper.addEventListener("click", async (e) => {
      const dot = e.target.closest(".ast-dot");
      if (!dot) return;
      const epNum = parseInt(dot.dataset.ep, 10);
      unmarkedEpisodes.delete(epNum); // Re-autorise le marquage
      await markEpisode(epNum, select);
    });

    wrapper.addEventListener("contextmenu", async (e) => {
      const dot = e.target.closest(".ast-dot");
      if (!dot) return;
      const epNum = parseInt(dot.dataset.ep, 10);
      const idx = seasonData.watched.indexOf(epNum);

      if (idx !== -1) {
        e.preventDefault();
        unmarkedEpisodes.add(epNum); // Empêche le polling de le remettre
        seasonData.watched.splice(idx, 1);
        await saveData(slug, animeData);
        updateSelectOptions(select, seasonData.watched);
        renderTrackerPanel(select, seasonData);
        // Déclencher auto-sync
        chrome.runtime.sendMessage({ action: "triggerPush" });
      }
    });
  }

  function trySetup() {
    const select = document.getElementById("selectEpisodes");
    if (select && select.options.length > 0) {
      setup(select);
      return true;
    }
    return false;
  }

  if (!trySetup()) {
    const observer = new MutationObserver(() => {
      if (trySetup()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();
