import { fetchGscData } from "./adapters/gsc.js";
import { classifyIntents } from "./adapters/intentClassifier.js";
import { loadAhrefsData } from "./adapters/ahrefs.js";
import { fetchMagentoData } from "./adapters/magento.js";
import { writeFile, readFile, mkdir } from "fs/promises";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = resolve(__dirname, "../../data/site-context-cache.json");
const CACHE_MAX_AGE_HOURS = parseInt(process.env.SITE_CONTEXT_CACHE_HOURS || "12", 10);

export async function buildSiteContext() {
  console.log("\n" + "=".repeat(60));
  console.log("  BUILDING SITE CONTEXT (first-party data)");
  console.log("=".repeat(60) + "\n");

  const cached = await loadCache();
  if (cached) {
    console.log("  [Cache] Using cached site context (< " + CACHE_MAX_AGE_HOURS + "h old)\n");
    return cached;
  }

  const [gsc, ahrefs, magento] = await Promise.all([
    fetchGscData().catch((err) => { console.log(`  [GSC] Error: ${err.message}`); return null; }),
    loadAhrefsData().catch((err) => { console.log(`  [Ahrefs] Error: ${err.message}`); return null; }),
    fetchMagentoData().catch((err) => { console.log(`  [Magento] Error: ${err.message}`); return null; })
  ]);

  let intentDistribution = null;
  if (gsc?.querySet?.length > 0) {
    intentDistribution = await classifyIntents(gsc.querySet).catch((err) => {
      console.log(`  [Intent] Error: ${err.message}`);
      return null;
    });
  }

  const siteContext = {
    fetchedAt: new Date().toISOString(),
    dataAvailability: {
      gsc: !!gsc,
      intentClassification: !!intentDistribution,
      ahrefs: !!ahrefs,
      magento: !!magento
    },
    gsc: gsc || { source: "google_search_console", fetchedAt: null, unavailable: true },
    intentDistribution: intentDistribution || { source: "claude_classification", fetchedAt: null, unavailable: true },
    ahrefs: ahrefs || { source: "ahrefs_csv_export", fetchedAt: null, unavailable: true },
    magento: magento || { source: "magento", fetchedAt: null, unavailable: true }
  };

  logDataSummary(siteContext);
  await saveCache(siteContext);

  return siteContext;
}

function logDataSummary(ctx) {
  console.log("\n  [Site Context] Data availability:");
  console.log(`    GSC:      ${ctx.dataAvailability.gsc ? "✓" : "✗"} ${ctx.gsc.totalRows ? `(${ctx.gsc.totalRows} rows)` : ""}`);
  console.log(`    Intent:   ${ctx.dataAvailability.intentClassification ? "✓" : "✗"} ${ctx.intentDistribution.totalQueries ? `(${ctx.intentDistribution.totalQueries} classified)` : ""}`);
  console.log(`    Ahrefs:   ${ctx.dataAvailability.ahrefs ? "✓" : "✗"} ${ctx.ahrefs.keywordGap ? `(${ctx.ahrefs.keywordGap.length} keyword gaps)` : ""}`);
  console.log(`    Magento:  ${ctx.dataAvailability.magento ? "✓" : "✗"} ${ctx.magento.revenue ? `($${ctx.magento.revenue.last90Days} last 90d)` : ""}`);
  console.log("");
}

async function loadCache() {
  try {
    const raw = await readFile(CACHE_PATH, "utf-8");
    const cached = JSON.parse(raw);
    const age = (Date.now() - new Date(cached.fetchedAt).getTime()) / 3600000;
    if (age < CACHE_MAX_AGE_HOURS) return cached;
  } catch { /* no cache */ }
  return null;
}

async function saveCache(ctx) {
  try {
    await mkdir(resolve(__dirname, "../../data"), { recursive: true });
    await writeFile(CACHE_PATH, JSON.stringify(ctx));
  } catch { /* non-critical */ }
}

export function summarizeSiteContext(ctx) {
  const parts = [];

  if (ctx.gsc && !ctx.gsc.unavailable) {
    parts.push(`## Google Search Console Data (source: GSC, fetched: ${ctx.gsc.fetchedAt})`);
    parts.push(`Date range: ${ctx.gsc.dateRange?.start} to ${ctx.gsc.dateRange?.end}`);
    parts.push(`Total query×page rows: ${ctx.gsc.totalRows}`);

    if (ctx.gsc.topPages?.length > 0) {
      parts.push("\n### Top Pages by Clicks (top 20)");
      for (const p of ctx.gsc.topPages.slice(0, 20)) {
        parts.push(`- ${p.page} — ${p.clicks} clicks, ${p.impressions} imp, pos ${p.avgPosition}, CTR ${p.avgCtr}%`);
      }
    }

    if (ctx.gsc.strikingDistanceKeywords?.length > 0) {
      parts.push("\n### Striking-Distance Keywords (position 4-15, below-expected CTR, top 30)");
      for (const k of ctx.gsc.strikingDistanceKeywords.slice(0, 30)) {
        parts.push(`- "${k.query}" → ${k.page} — pos ${k.position}, CTR ${k.ctr}% (expected ${k.expectedCtr}%), ${k.impressions} imp/mo`);
      }
    }
  } else {
    parts.push("## Google Search Console: NOT AVAILABLE");
  }

  if (ctx.intentDistribution && !ctx.intentDistribution.unavailable) {
    parts.push(`\n## Intent Distribution (source: claude_classification, fetched: ${ctx.intentDistribution.fetchedAt})`);
    parts.push(`Classified ${ctx.intentDistribution.totalQueries} queries from GSC:`);
    const d = ctx.intentDistribution.distribution;
    for (const [intent, pct] of Object.entries(d)) {
      parts.push(`- ${intent}: ${pct}%`);
    }
  } else {
    parts.push("\n## Intent Distribution: NOT AVAILABLE (no GSC data)");
  }

  if (ctx.ahrefs && !ctx.ahrefs.unavailable) {
    parts.push(`\n## Ahrefs Data (source: CSV export, fetched: ${ctx.ahrefs.fetchedAt})`);
    if (ctx.ahrefs.keywordGap?.length > 0) {
      parts.push(`\n### Keyword/Content Gap (top 30)`);
      for (const k of ctx.ahrefs.keywordGap.slice(0, 30)) {
        parts.push(`- "${k.keyword}" — vol ${k.volume}, KD ${k.difficulty}, our pos: ${k.yourPosition || "none"}`);
      }
    }
    if (ctx.ahrefs.backlinkProfile?.length > 0) {
      parts.push(`\n### Backlink Profile (top 20 referring domains)`);
      for (const b of ctx.ahrefs.backlinkProfile.slice(0, 20)) {
        parts.push(`- ${b.referringDomain} (DR ${b.domainRating}) → ${b.targetUrl || "?"} [${b.anchorText || "no anchor"}]`);
      }
    }
  } else {
    parts.push("\n## Ahrefs Data: NOT AVAILABLE");
  }

  if (ctx.magento && !ctx.magento.unavailable) {
    parts.push(`\n## Magento Data (source: ${ctx.magento.source}, fetched: ${ctx.magento.fetchedAt})`);
    if (ctx.magento.revenue) {
      const r = ctx.magento.revenue;
      parts.push(`Last 90 days: $${r.last90Days} revenue, ${r.totalOrders} orders, $${r.aov} AOV`);
    }
    if (ctx.magento.productConversion?.length > 0) {
      parts.push("\n### Top Products by Revenue (top 20)");
      for (const p of ctx.magento.productConversion.slice(0, 20)) {
        parts.push(`- ${p.name} (${p.sku}) — $${p.revenue} rev, ${p.orders} orders, $${p.avgPrice} avg price`);
      }
    }
    if (ctx.magento.categoryRevenue?.length > 0) {
      parts.push("\n### Category Revenue");
      for (const c of ctx.magento.categoryRevenue) {
        parts.push(`- ${c.category} — $${c.revenue} rev, ${c.orders} orders`);
      }
    }
    if (ctx.magento.siteConversion) {
      parts.push(`\nSite-wide conversion rate: ${ctx.magento.siteConversion}%`);
    }
  } else {
    parts.push("\n## Magento Data: NOT AVAILABLE");
  }

  return parts.join("\n");
}
