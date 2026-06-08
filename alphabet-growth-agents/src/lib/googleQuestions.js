import { searchDuckDuckGo, normalizeSearchResult, sleep } from "./webSearch.js";

const GOOGLE_QUERIES = [
  "best personalized gifts for 3 year old",
  "wooden name train for toddler",
  "Montessori toys recommendation 2024",
  "personalized step stool for kids",
  "best classroom rugs for preschool",
  "Lovevery alternatives cheaper",
  "personalized children's book review",
  "big brother gift ideas new baby",
  "daycare furniture where to buy",
  "STEM toys for preschoolers",
  "Melissa and Doug vs Montessori toys",
  "best educational toys under $50",
  "preschool furniture suppliers",
  "personalized baby gifts that are useful",
  "name puzzle for toddler wooden"
];

export async function fetchGoogleQuestions() {
  console.log(`  [Google] Searching for buyer questions...`);
  const allPosts = [];
  const seen = new Set();

  for (const query of GOOGLE_QUERIES) {
    try {
      const results = await searchDuckDuckGo(query, 8);

      for (const r of results) {
        if (seen.has(r.url)) continue;
        seen.add(r.url);

        const post = normalizeSearchResult(r, query);
        allPosts.push(post);
      }

      await sleep(1500);
    } catch (err) {
      console.log(`  [Google] Error searching "${query}": ${err.message}`);
    }
  }

  console.log(`  [Google] Found ${allPosts.length} discussions`);
  return allPosts;
}

export { GOOGLE_QUERIES };
