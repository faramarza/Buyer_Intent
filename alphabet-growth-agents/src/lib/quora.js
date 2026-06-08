import { searchDuckDuckGo, normalizeSearchResult, sleep } from "./webSearch.js";

const QUORA_QUERIES = [
  "site:quora.com best personalized gifts for toddlers",
  "site:quora.com Montessori toys worth buying",
  "site:quora.com wooden toys vs plastic toys children",
  "site:quora.com best educational toys 2 3 year old",
  "site:quora.com what to buy for preschool classroom",
  "site:quora.com personalized children's books worth it",
  "site:quora.com big brother gift when new baby arrives",
  "site:quora.com best classroom rug preschool",
  "site:quora.com Lovevery alternatives",
  "site:quora.com daycare furniture recommendations"
];

export async function fetchQuoraQuestions(maxAgeHours = 168) {
  console.log(`  [Quora] Searching for relevant questions...`);
  const allPosts = [];
  const seen = new Set();

  for (const query of QUORA_QUERIES) {
    try {
      const results = await searchDuckDuckGo(query, 5);

      for (const r of results) {
        if (!r.url?.includes("quora.com")) continue;
        if (seen.has(r.url)) continue;
        seen.add(r.url);

        const post = normalizeSearchResult(r, query);
        post.platform = "quora";
        allPosts.push(post);
      }

      await sleep(1500);
    } catch (err) {
      console.log(`  [Quora] Error searching "${query}": ${err.message}`);
    }
  }

  console.log(`  [Quora] Found ${allPosts.length} questions`);
  return allPosts;
}

export { QUORA_QUERIES };
