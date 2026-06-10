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

export async function getStats() {
  const store = await loadActions();
  const total = store.actions.length;
  const done = store.actions.filter((a) => a.status === "done").length;
  const skipped = store.actions.filter((a) => a.status === "skipped").length;
  const todo = total - done - skipped;

  const byImpact = {};
  for (const a of store.actions) {
    const label = a.impact_label || "unknown";
    if (!byImpact[label]) byImpact[label] = { total: 0, done: 0 };
    byImpact[label].total++;
    if (a.status === "done") byImpact[label].done++;
  }

  const byCategory = {};
  for (const a of store.actions) {
    const cat = a.category || "other";
    if (!byCategory[cat]) byCategory[cat] = { total: 0, done: 0 };
    byCategory[cat].total++;
    if (a.status === "done") byCategory[cat].done++;
  }

  return { total, done, skipped, todo, byImpact, byCategory, runs: store.runs.length };
}
