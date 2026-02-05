// Service worker - gère l'installation et le push vers GitHub

const GIST_FILENAME = "anime-sama-tracker.json";
const INTERNAL_KEYS = ["_domain", "_gh_token", "_gist_id"];

// Debounce pour éviter trop de push rapprochés
let pushTimeout = null;
let pendingPush = false;
const PUSH_DELAY = 3000; // 3 secondes après la dernière modif

chrome.runtime.onInstalled.addListener(() => {
  console.log("Anime-Sama Watch Tracker installé.");
});

// Écoute les demandes
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "triggerPush") {
    debouncedPush();
    sendResponse({ ok: true });
  } else if (message.action === "canPull") {
    // Retourne si un pull est autorisé (pas de push en attente)
    sendResponse({ canPull: !pendingPush });
  }
  return false;
});

function debouncedPush() {
  pendingPush = true;
  if (pushTimeout) clearTimeout(pushTimeout);
  pushTimeout = setTimeout(async () => {
    await doPush();
    pendingPush = false;
  }, PUSH_DELAY);
}

// PUSH: local -> gist (le local écrase le gist)
async function doPush() {
  try {
    const { _gh_token: token, _gist_id: gistId } = await chrome.storage.local.get(["_gh_token", "_gist_id"]);

    // Pas de token ou pas de gist = pas de push
    if (!token || !gistId) return;

    const localData = await getTrackerData();
    await updateGist(token, gistId, localData);

    console.log("Push OK");
  } catch (err) {
    console.error("Push erreur:", err.message);
  }
}

async function getTrackerData() {
  const allData = await chrome.storage.local.get(null);
  const data = {};
  for (const [key, value] of Object.entries(allData)) {
    if (key === "_domain" && value) {
      data[key] = value;
    } else if (!INTERNAL_KEYS.includes(key) && value && value.seasons) {
      data[key] = value;
    }
  }
  return data;
}

async function updateGist(token, gistId, data) {
  const resp = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: "PATCH",
    headers: {
      Authorization: `token ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      files: { [GIST_FILENAME]: { content: JSON.stringify(data, null, 2) } }
    })
  });
  if (!resp.ok) throw new Error(`GitHub API: ${resp.status}`);
}
