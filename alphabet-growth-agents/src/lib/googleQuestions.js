import { searchDuckDuckGo, normalizeSearchResult, sleep } from "./webSearch.js";

const currentYear = new Date().getFullYear();

const GOOGLE_QUERIES = [
  `best personalized gifts for 3 year old ${currentYear}`,
  `wooden name train for toddler ${currentYear}`,
  `Montessori toys recommendation ${currentYear}`,
  "personalized step stool for kids",
  `best classroom rugs for preschool ${currentYear}`,
  "Lovevery alternatives cheaper",
  "personalized children's book review",
  "big brother gift ideas new baby",
  "daycare furniture where to buy",
  `STEM toys for preschoolers ${currentYear}`,
  "Melissa and Doug vs Montessori toys",
  `best educational toys under $50 ${currentYear}`,
  "preschool furniture suppliers",
  "personalized baby gifts that are useful",
  "name puzzle for toddler wooden"
];

const STALE_YEAR_PATTERN = /\b(201[0-9]|202[0-3])\b/;

export async function fetchGoogleQuestions() {
  console.log(`  [Google] Searching for buyer questions...`);
  const allPosts = [];
  const seen = new Set();

  for (const query of GOOGLE_QUERIES) {
    try {
      const results = await searchDuckDuckGo(query, 8);

      for (const r of results) {
        if (seen.has(r.url)) continue;
        if (STALE_YEAR_PATTERN.test(r.title) || STALE_YEAR_PATTERN.test(r.snippet)) continue;
        seen.add(r.url);

        const post = normalizeSearchResult(r, query);
        allPosts.push(post);
      }

      await sleep(process.env.SERPER_API_KEY ? 500 : 3000 + Math.random() * 3000);
    } catch (err) {
      console.log(`  [Google] Error searching "${query}": ${err.message}`);
    }
  }

  console.log(`  [Google] Found ${allPosts.length} discussions`);
  return allPosts;
}

export { GOOGLE_QUERIES };
