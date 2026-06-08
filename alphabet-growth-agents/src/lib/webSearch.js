import * as cheerio from "cheerio";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
];

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function searchDuckDuckGo(query, maxResults = 10) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": randomUA(),
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9"
    }
  });

  if (!res.ok) {
    throw new Error(`DuckDuckGo search failed: ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const results = [];

  $(".result").each((i, el) => {
    if (i >= maxResults) return false;

    const titleEl = $(el).find(".result__a");
    const snippetEl = $(el).find(".result__snippet");
    const urlEl = $(el).find(".result__url");

    const title = titleEl.text().trim();
    const snippet = snippetEl.text().trim();
    let href = titleEl.attr("href") || "";

    if (href.includes("uddg=")) {
      try {
        const parsed = new URL(href, "https://duckduckgo.com");
        href = parsed.searchParams.get("uddg") || href;
      } catch {
        // keep original
      }
    }

    const displayUrl = urlEl.text().trim();

    if (title && snippet) {
      results.push({
        title,
        snippet,
        url: href || displayUrl,
        displayUrl
      });
    }
  });

  return results;
}

export function detectPlatform(url) {
  if (!url) return "web";
  const u = url.toLowerCase();
  if (u.includes("reddit.com")) return "reddit";
  if (u.includes("quora.com")) return "quora";
  if (u.includes("pinterest.com") || u.includes("pin.it")) return "pinterest";
  if (u.includes("facebook.com") || u.includes("fb.com")) return "facebook";
  if (u.includes("linkedin.com")) return "linkedin";
  if (u.includes("babycenter.com")) return "babycenter";
  if (u.includes("whattoexpect.com")) return "whattoexpect";
  if (u.includes("mumsnet.com")) return "mumsnet";
  return "web";
}

export function normalizeSearchResult(result, query) {
  const platform = detectPlatform(result.url);
  return {
    id: `web_${Buffer.from(result.url || result.title).toString("base64url").slice(0, 20)}`,
    platform,
    subreddit: null,
    title: result.title,
    body: result.snippet,
    author: "unknown",
    timestamp: new Date().toISOString(),
    upvotes: 0,
    comments: 0,
    url: result.url,
    source_query: query
  };
}

export { sleep };
