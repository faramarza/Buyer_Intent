import "dotenv/config";
import express from "express";
import { loadActions, updateActionStatus, getStats } from "./lib/actionsStore.js";

const app = express();
const PORT = parseInt(process.env.DASHBOARD_PORT || "3456", 10);

app.use(express.json());

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

app.get("/api/actions", async (req, res) => {
  try {
  const store = await loadActions();
  let actions = store.actions;

  // Deduplicate using similarity matching
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
  actions = deduped;

  const { status, category, impact, sort, speculative, funnel_stage } = req.query;
  if (status) actions = actions.filter((a) => a.status === status);
  if (category) actions = actions.filter((a) => a.category === category);
  if (impact) actions = actions.filter((a) => a.impact_label === impact);
  if (speculative === "true") actions = actions.filter((a) => a.speculative);
  if (speculative === "false") actions = actions.filter((a) => !a.speculative);
  if (funnel_stage) actions = actions.filter((a) => a.funnel_stage === funnel_stage);

  if (sort === "score") actions.sort((a, b) => (b.scores?.normalized || 0) - (a.scores?.normalized || 0));
  else if (sort === "date") actions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  else actions.sort((a, b) => (b.scores?.normalized || 0) - (a.scores?.normalized || 0));

  res.json({ actions, total: actions.length });
  } catch (err) {
    console.error(`[Dashboard] /api/actions error: ${err.message}`);
    res.status(500).json({ actions: [], total: 0, error: err.message });
  }
});

app.patch("/api/actions/:id", async (req, res) => {
  try {
    const { status, notes } = req.body;
    const action = await updateActionStatus(req.params.id, status, notes);
    if (!action) return res.status(404).json({ error: "Action not found" });
    res.json(action);
  } catch (err) {
    console.error(`[Dashboard] /api/actions/:id error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/stats", async (req, res) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (err) {
    console.error(`[Dashboard] /api/stats error: ${err.message}`);
    res.status(500).json({ total: 0, done: 0, skipped: 0, todo: 0, byImpact: {}, byCategory: {}, runs: 0 });
  }
});

app.get("/api/runs", async (req, res) => {
  try {
    const store = await loadActions();
    res.json(store.runs || []);
  } catch (err) {
    console.error(`[Dashboard] /api/runs error: ${err.message}`);
    res.json([]);
  }
});

app.get("/", (req, res) => {
  res.send(DASHBOARD_HTML);
});

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Alphabet Trains — Growth Dashboard</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f7f5; color: #333; }
  .header { background: #2c5530; color: white; padding: 20px 30px; }
  .header h1 { font-size: 20px; font-weight: 600; }
  .header .subtitle { opacity: 0.8; font-size: 13px; margin-top: 4px; }
  .objective-bar { background: #1e3d22; color: #a8d5b0; padding: 10px 30px; font-size: 13px; }

  .stats-bar { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; padding: 16px 30px; }
  .stat-card { background: white; border-radius: 10px; padding: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); text-align: center; }
  .stat-card .number { font-size: 28px; font-weight: 700; }
  .stat-card .label { font-size: 11px; color: #888; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
  .stat-card.critical .number { color: #c0392b; }
  .stat-card.high .number { color: #e67e22; }
  .stat-card.done .number { color: #27ae60; }
  .stat-card.todo .number { color: #2c5530; }

  .controls { padding: 10px 30px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .controls select, .controls button { padding: 7px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 12px; background: white; cursor: pointer; }
  .controls button { background: #2c5530; color: white; border: none; }
  .controls button:hover { background: #1e3d22; }

  .actions-list { padding: 10px 30px 40px; }
  .action-card { background: white; border-radius: 10px; padding: 14px 18px; margin-bottom: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); display: grid; grid-template-columns: 45px 60px 1fr auto; gap: 14px; align-items: start; }
  .action-card:hover { box-shadow: 0 3px 10px rgba(0,0,0,0.12); }
  .action-card.status-done { opacity: 0.5; }
  .action-card.status-skipped { opacity: 0.35; }
  .action-card.speculative { border-left: 3px solid #f39c12; }

  .rank { font-size: 22px; font-weight: 700; color: #2c5530; text-align: center; padding-top: 4px; }
  .score-badge { text-align: center; }
  .score-ring { width: 46px; height: 46px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 15px; color: white; margin: 0 auto; }
  .score-ring.critical { background: #c0392b; }
  .score-ring.high { background: #e67e22; }
  .score-ring.medium { background: #f39c12; }
  .score-ring.low { background: #95a5a6; }
  .score-ring.minimal { background: #bdc3c7; }
  .impact-label { font-size: 9px; text-transform: uppercase; text-align: center; margin-top: 3px; color: #888; }

  .action-body h3 { font-size: 13px; margin-bottom: 5px; line-height: 1.4; }
  .action-meta { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
  .tag { font-size: 10px; padding: 2px 7px; border-radius: 4px; background: #eee; color: #555; }
  .tag.engage { background: #d5f5e3; color: #1e8449; }
  .tag.content { background: #d6eaf8; color: #2471a3; }
  .tag.product_page { background: #fdebd0; color: #b9770e; }
  .tag.competitive { background: #fadbd8; color: #c0392b; }
  .tag.conversion { background: #e8daef; color: #7d3c98; }
  .tag.speculative { background: #fff3cd; color: #856404; border: 1px solid #ffc107; }
  .tag.grounded { background: #d4edda; color: #155724; border: 1px solid #28a745; }

  .evidence-box { background: #f0f7f1; border-left: 3px solid #2c5530; padding: 6px 10px; font-size: 11px; color: #555; margin: 6px 0; border-radius: 0 4px 4px 0; }
  .evidence-box.no-data { background: #fff3cd; border-left-color: #ffc107; }
  .revenue-badge { font-weight: 600; font-size: 12px; }
  .revenue-badge.computed { color: #27ae60; }
  .revenue-badge.nodata { color: #999; font-style: italic; }

  .action-controls { display: flex; flex-direction: column; gap: 5px; min-width: 90px; }
  .btn-done { padding: 5px 12px; border: none; border-radius: 5px; font-size: 11px; cursor: pointer; background: #27ae60; color: white; }
  .btn-skip { padding: 5px 12px; border: none; border-radius: 5px; font-size: 11px; cursor: pointer; background: #95a5a6; color: white; }
  .btn-undo { padding: 5px 12px; border: none; border-radius: 5px; font-size: 11px; cursor: pointer; background: #3498db; color: white; }

  .response-preview { margin-top: 6px; background: #f8f9fa; border-left: 3px solid #4a7c50; padding: 8px 10px; font-size: 12px; color: #555; font-style: italic; border-radius: 0 4px 4px 0; }
  .notes-input { margin-top: 4px; width: 100%; padding: 5px; border: 1px solid #ddd; border-radius: 4px; font-size: 11px; }
  .empty-state { text-align: center; padding: 60px; color: #888; }

  @media (max-width: 768px) {
    .action-card { grid-template-columns: 35px 45px 1fr; }
    .action-controls { grid-column: span 3; flex-direction: row; }
    .stats-bar { grid-template-columns: repeat(2, 1fr); }
  }
</style>
</head>
<body>

<div class="header">
  <h1>Alphabet Trains & Toys — Growth Dashboard</h1>
  <div class="subtitle">Data-grounded recommendations ranked by strategic objective alignment</div>
</div>
<div class="objective-bar" id="objectiveBar">Loading strategic objective...</div>

<div class="stats-bar" id="statsBar"></div>

<div class="controls">
  <select id="filterStatus">
    <option value="">All Status</option>
    <option value="todo" selected>To Do</option>
    <option value="done">Done</option>
    <option value="skipped">Skipped</option>
  </select>
  <select id="filterCategory">
    <option value="">All Categories</option>
    <option value="engage">Engage</option>
    <option value="content">Content</option>
    <option value="product_page">Product Page</option>
    <option value="competitive">Competitive</option>
    <option value="conversion">Conversion</option>
  </select>
  <select id="filterImpact">
    <option value="">All Impact</option>
    <option value="critical">Critical</option>
    <option value="high">High</option>
    <option value="medium">Medium</option>
    <option value="low">Low</option>
  </select>
  <select id="filterSpeculative">
    <option value="">All Evidence</option>
    <option value="false">Grounded Only</option>
    <option value="true">Speculative Only</option>
  </select>
  <select id="filterFunnel">
    <option value="">All Funnel Stages</option>
    <option value="awareness">Awareness</option>
    <option value="consideration">Consideration</option>
    <option value="conversion">Conversion</option>
    <option value="retention">Retention</option>
  </select>
  <button onclick="loadActions()">Refresh</button>
</div>

<div class="actions-list" id="actionsList"></div>

<script>
function filterByImpact(level) {
  document.getElementById('filterImpact').value = level;
  document.getElementById('filterStatus').value = '';
  loadActions();
}

function filterByStatus(s) {
  document.getElementById('filterStatus').value = s;
  loadActions();
}

async function loadStats() {
  const res = await fetch('/api/stats');
  const stats = await res.json();
  document.getElementById('statsBar').innerHTML =
    '<div class="stat-card todo" onclick="filterByStatus(&#39;todo&#39;)" style="cursor:pointer"><div class="number">'+stats.todo+'</div><div class="label">To Do</div></div>'+
    '<div class="stat-card done" onclick="filterByStatus(&#39;done&#39;)" style="cursor:pointer"><div class="number">'+stats.done+'</div><div class="label">Done</div></div>'+
    '<div class="stat-card"><div class="number">'+stats.total+'</div><div class="label">Total</div></div>'+
    '<div class="stat-card"><div class="number">'+stats.runs+'</div><div class="label">Runs</div></div>'+
    '<div class="stat-card critical" onclick="filterByImpact(&#39;critical&#39;)" style="cursor:pointer"><div class="number">'+(stats.byImpact?.critical?.total||0)+'</div><div class="label">Critical</div></div>'+
    '<div class="stat-card high" onclick="filterByImpact(&#39;high&#39;)" style="cursor:pointer"><div class="number">'+(stats.byImpact?.high?.total||0)+'</div><div class="label">High Impact</div></div>';
}

async function loadActions() {
  var status = document.getElementById('filterStatus').value;
  var category = document.getElementById('filterCategory').value;
  var impact = document.getElementById('filterImpact').value;
  var speculative = document.getElementById('filterSpeculative').value;
  var funnel = document.getElementById('filterFunnel').value;

  var params = new URLSearchParams();
  if (status) params.set('status', status);
  if (category) params.set('category', category);
  if (impact) params.set('impact', impact);
  if (speculative) params.set('speculative', speculative);
  if (funnel) params.set('funnel_stage', funnel);
  params.set('sort', 'score');

  var res = await fetch('/api/actions?' + params);
  var data = await res.json();

  if (data.actions.length === 0) {
    document.getElementById('actionsList').innerHTML = '<div class="empty-state">No actions found. Run the agent first: <code>./run.sh</code></div>';
    return;
  }

  document.getElementById('actionsList').innerHTML = data.actions.map(function(a, idx) {
    var revenueDisplay = typeof a.revenueImpact === 'number'
      ? '<span class="revenue-badge computed">$'+a.revenueImpact.toLocaleString()+'</span>'
      : '<span class="revenue-badge nodata">'+(a.revenueImpact||'insufficient_data')+'</span>';

    var evidenceHtml = a.evidence && a.evidence !== 'insufficient_data'
      ? '<div class="evidence-box">'+esc(a.evidence)+'</div>'
      : '<div class="evidence-box no-data">No evidence — speculative recommendation</div>';

    var specTag = a.speculative
      ? '<span class="tag speculative">Speculative</span>'
      : '<span class="tag grounded">Grounded</span>';

    return '<div class="action-card status-'+a.status+(a.speculative?' speculative':'')+'" id="card-'+a.id+'">'+
      '<div class="rank">#'+(idx+1)+'</div>'+
      '<div class="score-badge">'+
        '<div class="score-ring '+(a.impact_label||'')+'">'+(a.scores?.normalized||0)+'</div>'+
        '<div class="impact-label">'+(a.impact_label||'')+'</div>'+
      '</div>'+
      '<div class="action-body">'+
        '<h3>'+esc(a.action)+'</h3>'+
        '<div class="action-meta">'+
          '<span class="tag '+(a.category||'')+'">'+(a.category||a.type||'')+'</span>'+
          (a.funnel_stage ? '<span class="tag">'+a.funnel_stage+'</span>' : '')+
          specTag+
          '<span class="tag">Revenue: '+revenueDisplay+'</span>'+
          '<span class="tag">Ease: '+(a.ease_of_execution||'?')+'</span>'+
          '<span class="tag">'+(a.deadline||'')+'</span>'+
        '</div>'+
        evidenceHtml+
        (a.response_text ? '<div class="response-preview">'+esc(a.response_text)+'</div>' : '')+
        (a.notes ? '<div style="font-size:11px;color:#666;margin-top:4px">Notes: '+esc(a.notes)+'</div>' : '')+
        '<input class="notes-input" placeholder="Add notes..." value="'+esc(a.notes||'')+'"'+
          ' onchange="updateAction(\\''+a.id+'\\', \\''+a.status+'\\', this.value)" />'+
      '</div>'+
      '<div class="action-controls">'+
        (a.status === 'todo'
          ? '<button class="btn-done" onclick="updateAction(\\''+a.id+'\\', \\'done\\')">Mark Done</button>'+
            '<button class="btn-skip" onclick="updateAction(\\''+a.id+'\\', \\'skipped\\')">Skip</button>'
          : '<button class="btn-undo" onclick="updateAction(\\''+a.id+'\\', \\'todo\\')">Undo</button>'
        )+
      '</div>'+
    '</div>';
  }).join('');

  loadStats();
}

async function updateAction(id, status, notes) {
  var body = { status: status };
  if (notes !== undefined) body.notes = notes;
  await fetch('/api/actions/' + id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (notes === undefined) loadActions();
}

function esc(s) {
  if (!s) return '';
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

document.getElementById('filterStatus').addEventListener('change', loadActions);
document.getElementById('filterCategory').addEventListener('change', loadActions);
document.getElementById('filterImpact').addEventListener('change', loadActions);
document.getElementById('filterSpeculative').addEventListener('change', loadActions);
document.getElementById('filterFunnel').addEventListener('change', loadActions);

loadActions();
loadStats();
</script>
</body>
</html>`;

process.on("uncaughtException", (err) => {
  console.error(`[Dashboard] CRASH (uncaughtException): ${err.message}`);
  console.error(err.stack);
});

process.on("unhandledRejection", (err) => {
  console.error(`[Dashboard] CRASH (unhandledRejection): ${err}`);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`  [Dashboard] Running at http://localhost:${PORT}`);
  console.log(`  [Dashboard] Started at ${new Date().toISOString()}`);
});
