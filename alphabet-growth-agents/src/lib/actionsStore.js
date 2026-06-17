import { readFile, writeFile, mkdir } from "fs/promises";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE_PATH = resolve(__dirname, "../../data/actions.json");

async function ensureDir() {
  await mkdir(resolve(__dirname, "../../data"), { recursive: true });
}

export async function loadActions() {
  try {
    const data = await readFile(STORE_PATH, "utf-8");
    return JSON.parse(data);
  } catch {
    return { runs: [], actions: [] };
  }
}

export async function saveActions(store) {
  await ensureDir();
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2));
}

export async function addRun(rankedActions, digest) {
  const store = await loadActions();
  const runId = `run_${Date.now()}`;
  const timestamp = new Date().toISOString();

  store.runs.push({
    id: runId,
    timestamp,
    post_count: digest.summary?.posts_analyzed || 0,
    action_count: rankedActions.length
  });

  for (const action of rankedActions) {
    store.actions.push({
      id: `${runId}_${action.rank}`,
      run_id: runId,
      created_at: timestamp,
      status: "todo",
      completed_at: null,
      notes: "",
      ...action
    });
  }

  await saveActions(store);
  return runId;
}

export async function updateActionStatus(actionId, status, notes) {
  const store = await loadActions();
  const action = store.actions.find((a) => a.id === actionId);
  if (!action) return null;

  action.status = status;
  if (status === "done") {
    action.completed_at = new Date().toISOString();
  }
  if (notes !== undefined) {
    action.notes = notes;
  }

  await saveActions(store);
  return action;
}

function normalizeText(text) {
  return (text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getWords(text) {
  return normalizeText(text).split(/\s+/).filter(Boolean);
}

function firstNWords(text, n) {
  return getWords(text).slice(0, n).join(" ");
}

function extractPageUrl(text) {
  const match = (text || "").match(/[\w-]+\.html/i);
  return match ? match[0].toLowerCase() : null;
}

function wordOverlap(textA, textB) {
  const wordsA = new Set(getWords(textA));
  const wordsB = new Set(getWords(textB));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let shared = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) shared++;
  }
  const smaller = Math.min(wordsA.size, wordsB.size);
  return shared / smaller;
}

function areSimilarActions(a, b) {
  // Same first 8 words
  if (firstNWords(a.action, 8) === firstNWords(b.action, 8) && firstNWords(a.action, 8).length > 0) return true;
  // Same target page URL
  const urlA = extractPageUrl(a.action);
  const urlB = extractPageUrl(b.action);
  if (urlA && urlB && urlA === urlB) return true;
  // 70%+ word overlap
  if (wordOverlap(a.action, b.action) >= 0.7) return true;
  return false;
}

function deduplicateActions(actions) {
  const deduped = [];
  for (const a of actions) {
    let isDup = false;
    for (let i = 0; i < deduped.length; i++) {
      if (areSimilarActions(a, deduped[i])) {
        // Keep the one with the higher score
        if ((a.scores?.normalized || 0) > (deduped[i].scores?.normalized || 0)) {
          deduped[i] = a;
        }
        isDup = true;
        break;
      }
    }
    if (!isDup) deduped.push(a);
  }
  return deduped;
}

export async function getStats() {
  const store = await loadActions();
  const actions = deduplicateActions(store.actions);
  const total = actions.length;
  const done = actions.filter((a) => a.status === "done").length;
  const skipped = actions.filter((a) => a.status === "skipped").length;
  const todo = total - done - skipped;

  const byImpact = {};
  for (const a of actions) {
    const label = a.impact_label || "unknown";
    if (!byImpact[label]) byImpact[label] = { total: 0, done: 0 };
    byImpact[label].total++;
    if (a.status === "done") byImpact[label].done++;
  }

  const byCategory = {};
  for (const a of actions) {
    const cat = a.category || "other";
    if (!byCategory[cat]) byCategory[cat] = { total: 0, done: 0 };
    byCategory[cat].total++;
    if (a.status === "done") byCategory[cat].done++;
  }

  return { total, done, skipped, todo, byImpact, byCategory, runs: store.runs.length };
}
