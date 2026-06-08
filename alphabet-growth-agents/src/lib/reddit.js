const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const BASE_URL = "https://oauth.reddit.com";

const TARGET_SUBREDDITS = [
  "Montessori",
  "toddlers",
  "Parenting",
  "ECEProfessionals",
  "NewParents",
  "preschool",
  "homeschool",
  "BabyBumps",
  "daddit",
  "Mommit"
];

const SEARCH_QUERIES = [
  "personalized gift toddler",
  "wooden name train",
  "Montessori toys recommendation",
  "classroom rug preschool",
  "daycare furniture",
  "educational toys toddler",
  "STEM toys preschool",
  "big brother gift",
  "big sister gift",
  "name puzzle",
  "Lovevery alternative",
  "Melissa and Doug",
  "preschool furniture",
  "personalized children book"
];

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  const { REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD } = process.env;

  if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET) {
    throw new Error("REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET are required in .env");
  }

  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const auth = Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString("base64");

  const params = new URLSearchParams();
  if (REDDIT_USERNAME && REDDIT_PASSWORD) {
    params.append("grant_type", "password");
    params.append("username", REDDIT_USERNAME);
    params.append("password", REDDIT_PASSWORD);
  } else {
    params.append("grant_type", "client_credentials");
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "AlphabetGrowthAgents/1.0"
    },
    body: params
  });

  if (!res.ok) {
    throw new Error(`Reddit auth failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

async function redditGet(endpoint, queryParams = {}) {
  const token = await getAccessToken();
  const url = new URL(`${BASE_URL}${endpoint}`);
  Object.entries(queryParams).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "AlphabetGrowthAgents/1.0"
    }
  });

  if (!res.ok) {
    throw new Error(`Reddit API error: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

function isRecent(postTimestamp, maxAgeHours) {
  const postDate = new Date(postTimestamp * 1000);
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
  return postDate >= cutoff;
}

function isEngageable(post) {
  return !post.archived && !post.locked;
}

function normalizePost(redditPost) {
  return {
    id: redditPost.id,
    platform: "reddit",
    subreddit: `r/${redditPost.subreddit}`,
    title: redditPost.title,
    body: redditPost.selftext || "",
    author: redditPost.author,
    timestamp: new Date(redditPost.created_utc * 1000).toISOString(),
    upvotes: redditPost.ups,
    comments: redditPost.num_comments,
    url: `https://www.reddit.com${redditPost.permalink}`,
    archived: redditPost.archived,
    locked: redditPost.locked,
    flair: redditPost.link_flair_text || null
  };
}

export async function fetchSubredditPosts(maxAgeHours = 48) {
  console.log(`  [Reddit] Fetching posts from ${TARGET_SUBREDDITS.length} subreddits (last ${maxAgeHours}h)...`);
  const allPosts = [];
  const seen = new Set();

  for (const sub of TARGET_SUBREDDITS) {
    try {
      const data = await redditGet(`/r/${sub}/new`, { limit: "25" });
      const posts = (data.data?.children || [])
        .map((c) => c.data)
        .filter((p) => isRecent(p.created_utc, maxAgeHours) && isEngageable(p) && !seen.has(p.id));

      for (const p of posts) {
        seen.add(p.id);
        allPosts.push(normalizePost(p));
      }
      console.log(`  [Reddit] r/${sub}: ${posts.length} fresh posts`);
    } catch (err) {
      console.log(`  [Reddit] r/${sub}: Error — ${err.message}`);
    }
  }

  return allPosts;
}

export async function searchReddit(maxAgeHours = 48) {
  console.log(`  [Reddit] Running ${SEARCH_QUERIES.length} keyword searches...`);
  const allPosts = [];
  const seen = new Set();

  for (const query of SEARCH_QUERIES) {
    try {
      const data = await redditGet("/search", {
        q: query,
        sort: "new",
        t: "week",
        type: "link",
        limit: "10"
      });

      const posts = (data.data?.children || [])
        .map((c) => c.data)
        .filter((p) => isRecent(p.created_utc, maxAgeHours) && isEngageable(p) && !seen.has(p.id));

      for (const p of posts) {
        seen.add(p.id);
        allPosts.push(normalizePost(p));
      }

      if (posts.length > 0) {
        console.log(`  [Reddit] "${query}": ${posts.length} results`);
      }
    } catch (err) {
      console.log(`  [Reddit] Search "${query}": Error — ${err.message}`);
    }
  }

  return allPosts;
}

export async function fetchAllRedditPosts(maxAgeHours = 48) {
  const [subredditPosts, searchPosts] = await Promise.all([
    fetchSubredditPosts(maxAgeHours),
    searchReddit(maxAgeHours)
  ]);

  const seen = new Set();
  const combined = [];
  for (const post of [...subredditPosts, ...searchPosts]) {
    if (!seen.has(post.id)) {
      seen.add(post.id);
      combined.push(post);
    }
  }

  console.log(`  [Reddit] Total unique fresh posts: ${combined.length}`);
  return combined;
}

export { TARGET_SUBREDDITS, SEARCH_QUERIES };
