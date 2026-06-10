import { google } from "googleapis";
import { readFile } from "fs/promises";

export async function fetchGscData() {
  const keyFilePath = process.env.GSC_SERVICE_ACCOUNT_KEY;
  const siteUrl = process.env.GSC_SITE_URL || "sc-domain:alphabet-trains.com";

  if (!keyFilePath) {
    console.log("  [GSC] Skipped — GSC_SERVICE_ACCOUNT_KEY not set");
    return null;
  }

  let auth;
  try {
    const keyData = JSON.parse(await readFile(keyFilePath, "utf-8"));
    auth = new google.auth.GoogleAuth({
      credentials: keyData,
      scopes: ["https://www.googleapis.com/auth/webmasters.readonly"]
    });
  } catch (err) {
    console.log(`  [GSC] Auth failed: ${err.message}`);
    return null;
  }

  const searchconsole = google.searchconsole({ version: "v1", auth });
  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() - 3);
  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - 16);

  const formatDate = (d) => d.toISOString().split("T")[0];

  console.log(`  [GSC] Fetching ${formatDate(startDate)} → ${formatDate(endDate)}...`);

  let allRows = [];
  let startRow = 0;
  const batchSize = 25000;

  while (true) {
    const res = await searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        dimensions: ["query", "page"],
        rowLimit: batchSize,
        startRow
      }
    });

    const rows = res.data.rows || [];
    allRows = allRows.concat(rows);
    if (rows.length < batchSize) break;
    startRow += batchSize;
  }

  console.log(`  [GSC] Fetched ${allRows.length} query×page rows`);

  const topPages = deriveTopPages(allRows);
  const strikingDistance = deriveStrikingDistance(allRows);
  const querySet = deriveQuerySet(allRows);

  return {
    source: "google_search_console",
    fetchedAt: new Date().toISOString(),
    siteUrl,
    dateRange: { start: formatDate(startDate), end: formatDate(endDate) },
    totalRows: allRows.length,
    topPages,
    strikingDistanceKeywords: strikingDistance,
    querySet
  };
}

function deriveTopPages(rows) {
  const pageMap = new Map();
  for (const row of rows) {
    const page = row.keys[1];
    if (!pageMap.has(page)) {
      pageMap.set(page, { page, clicks: 0, impressions: 0, ctrSum: 0, posSum: 0, count: 0 });
    }
    const p = pageMap.get(page);
    p.clicks += row.clicks;
    p.impressions += row.impressions;
    p.ctrSum += row.ctr * row.impressions;
    p.posSum += row.position * row.impressions;
    p.count++;
  }

  return Array.from(pageMap.values())
    .map((p) => ({
      page: p.page,
      clicks: p.clicks,
      impressions: p.impressions,
      avgCtr: p.impressions > 0 ? Math.round((p.ctrSum / p.impressions) * 10000) / 100 : 0,
      avgPosition: p.impressions > 0 ? Math.round((p.posSum / p.impressions) * 10) / 10 : 0
    }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 100);
}

function deriveStrikingDistance(rows) {
  const queryMap = new Map();
  for (const row of rows) {
    const query = row.keys[0];
    const page = row.keys[1];
    if (row.position >= 4 && row.position <= 15 && row.impressions >= 10) {
      const expectedCtr = estimateExpectedCtr(row.position);
      if (row.ctr < expectedCtr * 0.7) {
        queryMap.set(`${query}|${page}`, {
          query,
          page,
          clicks: row.clicks,
          impressions: row.impressions,
          position: Math.round(row.position * 10) / 10,
          ctr: Math.round(row.ctr * 10000) / 100,
          expectedCtr: Math.round(expectedCtr * 10000) / 100,
          ctrGap: Math.round((expectedCtr - row.ctr) * 10000) / 100
        });
      }
    }
  }

  return Array.from(queryMap.values())
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 200);
}

function estimateExpectedCtr(position) {
  const ctrCurve = { 1: 0.28, 2: 0.15, 3: 0.11, 4: 0.08, 5: 0.065, 6: 0.05, 7: 0.04, 8: 0.035, 9: 0.03, 10: 0.025, 11: 0.02, 12: 0.018, 13: 0.015, 14: 0.013, 15: 0.011 };
  const pos = Math.round(position);
  return ctrCurve[pos] || 0.01;
}

function deriveQuerySet(rows) {
  const queryMap = new Map();
  for (const row of rows) {
    const query = row.keys[0];
    if (!queryMap.has(query)) {
      queryMap.set(query, { query, clicks: 0, impressions: 0 });
    }
    const q = queryMap.get(query);
    q.clicks += row.clicks;
    q.impressions += row.impressions;
  }

  return Array.from(queryMap.values())
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 500);
}
