import "dotenv/config";
import express from "express";
import { loadActions, updateActionStatus, getStats } from "./lib/actionsStore.js";

const app = express();
const PORT = parseInt(process.env.DASHBOARD_PORT || "3456", 10);

app.use(express.json());

app.get("/api/actions", async (req, res) => {
  const store = await loadActions();
  let actions = store.actions;

  const { status, category, impact, sort } = req.query;
  if (status) actions = actions.filter((a) => a.status === status);
  if (category) actions = actions.filter((a) => a.category === category);
  if (impact) actions = actions.filter((a) => a.impact_label === impact);

  if (sort === "score") actions.sort((a, b) => (b.scores?.normalized || 0) - (a.scores?.normalized || 0));
  else if (sort === "date") actions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  else actions.sort((a, b) => (b.scores?.normalized || 0) - (a.scores?.normalized || 0));

  res.json({ actions, total: actions.length });
});

app.patch("/api/actions/:id", async (req, res) => {
  const { status, notes } = req.body;
  const action = await updateActionStatus(req.params.id, status, notes);
  if (!action) return res.status(404).json({ error: "Action not found" });
  res.json(action);
});

app.get("/api/stats", async (req, res) => {
  const stats = await getStats();
  res.json(stats);
});

app.get("/api/runs", async (req, res) => {
  const store = await loadActions();
  res.json(store.runs || []);
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
  .header { background: #2c5530; color: white; padding: 20px 30px; display: flex; justify-content: space-between; align-items: center; }
  .header h1 { font-size: 20px; font-weight: 600; }
  .header .subtitle { opacity: 0.8; font-size: 13px; }

  .stats-bar { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; padding: 20px 30px; }
  .stat-card { background: white; border-radius: 10px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); text-align: center; }
  .stat-card .number { font-size: 32px; font-weight: 700; }
  .stat-card .label { font-size: 12px; color: #888; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
  .stat-card.critical .number { color: #c0392b; }
  .stat-card.high .number { color: #e67e22; }
  .stat-card.done .number { color: #27ae60; }
  .stat-card.todo .number { color: #2c5530; }

  .controls { padding: 10px 30px; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  .controls select, .controls button { padding: 8px 14px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px; background: white; cursor: pointer; }
  .controls button { background: #2c5530; color: white; border: none; }
  .controls button:hover { background: #1e3d22; }
  .controls button.secondary { background: #888; }

  .actions-list { padding: 10px 30px 40px; }
  .action-card { background: white; border-radius: 10px; padding: 16px 20px; margin-bottom: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); display: grid; grid-template-columns: 50px 70px 1fr auto; gap: 16px; align-items: center; transition: all 0.2s; }
  .action-card:hover { box-shadow: 0 3px 10px rgba(0,0,0,0.12); }
  .action-card.status-done { opacity: 0.5; }
  .action-card.status-skipped { opacity: 0.35; }

  .rank { font-size: 24px; font-weight: 700; color: #2c5530; text-align: center; }
  .score-badge { text-align: center; }
  .score-ring { width: 50px; height: 50px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; color: white; margin: 0 auto; }
  .score-ring.critical { background: #c0392b; }
  .score-ring.high { background: #e67e22; }
  .score-ring.medium { background: #f39c12; }
  .score-ring.low { background: #95a5a6; }
  .score-ring.minimal { background: #bdc3c7; }
  .impact-label { font-size: 10px; text-transform: uppercase; text-align: center; margin-top: 4px; color: #888; }

  .action-body h3 { font-size: 14px; margin-bottom: 6px; line-height: 1.4; }
  .action-meta { display: flex; gap: 10px; flex-wrap: wrap; }
  .tag { font-size: 11px; padding: 2px 8px; border-radius: 4px; background: #eee; color: #555; }
  .tag.engage { background: #d5f5e3; color: #1e8449; }
  .tag.content { background: #d6eaf8; color: #2471a3; }
  .tag.product_page { background: #fdebd0; color: #b9770e; }
  .tag.competitive { background: #fadbd8; color: #c0392b; }
  .tag.conversion { background: #e8daef; color: #7d3c98; }
  .tag.response { background: #d5f5e3; color: #1e8449; }
  .tag.competitor { background: #fadbd8; color: #c0392b; }

  .action-controls { display: flex; flex-direction: column; gap: 6px; min-width: 100px; }
  .btn-done { padding: 6px 14px; border: none; border-radius: 6px; font-size: 12px; cursor: pointer; background: #27ae60; color: white; }
  .btn-skip { padding: 6px 14px; border: none; border-radius: 6px; font-size: 12px; cursor: pointer; background: #95a5a6; color: white; }
  .btn-undo { padding: 6px 14px; border: none; border-radius: 6px; font-size: 12px; cursor: pointer; background: #3498db; color: white; }

  .response-preview { margin-top: 8px; background: #f8f9fa; border-left: 3px solid #2c5530; padding: 8px 12px; font-size: 13px; color: #555; font-style: italic; border-radius: 0 6px 6px 0; }
  .notes-input { margin-top: 6px; width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; }

  .empty-state { text-align: center; padding: 60px; color: #888; }
  .score-breakdown { font-size: 11px; color: #999; margin-top: 4px; }

  @media (max-width: 768px) {
    .action-card { grid-template-columns: 40px 50px 1fr; }
    .action-controls { grid-column: span 3; flex-direction: row; }
    .stats-bar { grid-template-columns: repeat(2, 1fr); }
  }
</style>
</head>
<body>

<div class="header">
  <div>
    <h1>Alphabet Trains & Toys — Growth Dashboard</h1>
    <div class="subtitle">Ranked actions by revenue potential, SEO value, and ease of execution</div>
  </div>
  <div class="subtitle" id="lastRun"></div>
</div>

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
  <button onclick="loadActions()">Refresh</button>
  <button class="secondary" onclick="exportCsv()">Export CSV</button>
</div>

<div class="actions-list" id="actionsList"></div>

<script>
async function loadStats() {
  const res = await fetch('/api/stats');
  const stats = await res.json();
  document.getElementById('statsBar').innerHTML = \`
    <div class="stat-card todo"><div class="number">\${stats.todo}</div><div class="label">To Do</div></div>
    <div class="stat-card done"><div class="number">\${stats.done}</div><div class="label">Done</div></div>
    <div class="stat-card"><div class="number">\${stats.total}</div><div class="label">Total Actions</div></div>
    <div class="stat-card"><div class="number">\${stats.runs}</div><div class="label">Runs</div></div>
    <div class="stat-card critical"><div class="number">\${stats.byImpact?.critical?.total || 0}</div><div class="label">Critical</div></div>
    <div class="stat-card high"><div class="number">\${stats.byImpact?.high?.total || 0}</div><div class="label">High Impact</div></div>
  \`;
}

async function loadActions() {
  const status = document.getElementById('filterStatus').value;
  const category = document.getElementById('filterCategory').value;
  const impact = document.getElementById('filterImpact').value;

  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (category) params.set('category', category);
  if (impact) params.set('impact', impact);
  params.set('sort', 'score');

  const res = await fetch('/api/actions?' + params);
  const data = await res.json();

  if (data.actions.length === 0) {
    document.getElementById('actionsList').innerHTML = '<div class="empty-state">No actions found. Run the agent first: <code>./run.sh</code></div>';
    return;
  }

  document.getElementById('actionsList').innerHTML = data.actions.map(a => \`
    <div class="action-card status-\${a.status}" id="card-\${a.id}">
      <div class="rank">#\${a.rank}</div>
      <div class="score-badge">
        <div class="score-ring \${a.impact_label}">\${a.scores?.normalized || 0}</div>
        <div class="impact-label">\${a.impact_label || ''}</div>
      </div>
      <div class="action-body">
        <h3>\${esc(a.action)}</h3>
        <div class="action-meta">
          <span class="tag \${a.category || ''}">\${a.category || a.type || ''}</span>
          <span class="tag">Revenue: \${a.revenue_potential || '?'}</span>
          <span class="tag">SEO: \${a.seo_value || '?'}</span>
          <span class="tag">Ease: \${a.ease_of_execution || '?'}</span>
          <span class="tag">\${a.deadline || ''}</span>
        </div>
        \${a.response_text ? '<div class="response-preview">' + esc(a.response_text) + '</div>' : ''}
        \${a.source_post ? '<div class="score-breakdown">Source: ' + esc(a.source_post) + '</div>' : ''}
        \${a.target_keyword ? '<div class="score-breakdown">Keyword: ' + esc(a.target_keyword) + '</div>' : ''}
        \${a.notes ? '<div class="score-breakdown">Notes: ' + esc(a.notes) + '</div>' : ''}
        <input class="notes-input" placeholder="Add notes..." value="\${esc(a.notes || '')}"
          onchange="updateAction('\${a.id}', '\${a.status}', this.value)" />
      </div>
      <div class="action-controls">
        \${a.status === 'todo' ? \`
          <button class="btn-done" onclick="updateAction('\${a.id}', 'done')">Mark Done</button>
          <button class="btn-skip" onclick="updateAction('\${a.id}', 'skipped')">Skip</button>
        \` : \`
          <button class="btn-undo" onclick="updateAction('\${a.id}', 'todo')">Undo</button>
        \`}
      </div>
    </div>
  \`).join('');

  loadStats();
}

async function updateAction(id, status, notes) {
  const body = { status };
  if (notes !== undefined) body.notes = notes;
  await fetch('/api/actions/' + id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (notes === undefined) loadActions();
}

function exportCsv() {
  window.location.href = '/api/actions?format=csv';
}

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

document.getElementById('filterStatus').addEventListener('change', loadActions);
document.getElementById('filterCategory').addEventListener('change', loadActions);
document.getElementById('filterImpact').addEventListener('change', loadActions);

loadActions();
loadStats();
</script>
</body>
</html>`;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`  [Dashboard] Running at http://localhost:${PORT}`);
  console.log(`  [Dashboard] Or from remote: http://YOUR_SERVER_IP:${PORT}`);
});
