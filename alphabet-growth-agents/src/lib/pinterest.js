import { searchDuckDuckGo, normalizeSearchResult, sleep } from "./webSearch.js";

const PINTEREST_QUERIES = [
  "site:pinterest.com personalized wooden name train",
  "site:pinterest.com Montessori toys toddler gift guide",
  "site:pinterest.com personalized kids step stool",
  "site:pinterest.com classroom rug preschool layout",
  "site:pinterest.com big brother big sister gift ideas",
  "site:pinterest.com personalized children's book gift",
  "site:pinterest.com nursery name decor wooden",
  "site:pinterest.com STEM toys preschool age",
  "site:pinterest.com educational toys gift guide toddler",
  "site:pinterest.com daycare classroom setup furniture"
];

export async function fetchPinterestTrends() {
  console.log(`  [Pinterest] Searching for trending content...`);
  const allPosts = [];
  const seen = new Set();

  for (const query of PINTEREST_QUERIES) {
    try {
      const results = await searchDuckDuckGo(query, 5);

      for (const r of results) {
        if (!r.url?.includes("pinterest.com") && !r.url?.includes("pin.it")) continue;
        if (seen.has(r.url)) continue;
        seen.add(r.url);

        const post = normalizeSearchResult(r, query);
        post.platform = "pinterest";
        allPosts.push(post);
      }

      await sleep(1500);
    } catch (err) {
      console.log(`  [Pinterest] Error searching "${query}": ${err.message}`);
    }
  }

  console.log(`  [Pinterest] Found ${allPosts.length} pins/boards`);
  return allPosts;
}

export { PINTEREST_QUERIES };
