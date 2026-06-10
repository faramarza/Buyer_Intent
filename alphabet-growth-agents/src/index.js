import "dotenv/config";
import { mkdir } from "fs/promises";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { samplePosts } from "./sample/posts.js";
import { processPost, generateDigest } from "./controller.js";
import { sendDigestEmail } from "./lib/sendEmail.js";
import { rankAllActions } from "./lib/ranking.js";
import { exportCsv } from "./lib/csvExport.js";
import { addRun } from "./lib/actionsStore.js";
import { fetchAllRedditPosts } from "./lib/reddit.js";
import { fetchQuoraQuestions } from "./lib/quora.js";
import { fetchPinterestTrends } from "./lib/pinterest.js";
import { fetchGoogleQuestions } from "./lib/googleQuestions.js";
import { loadSeenPosts, markSeen, isNew } from "./lib/postTracker.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../data");

function isEnabled(envVar, defaultVal = "false") {
  return (process.env[envVar] || defaultVal).toLowerCase() === "true";
}

async function getPosts() {
  const redditEnabled = isEnabled("REDDIT_ENABLED");
  const googleEnabled = isEnabled("GOOGLE_ENABLED", "true");
  const quoraEnabled = isEnabled("QUORA_ENABLED", "true");
  const pinterestEnabled = isEnabled("PINTEREST_ENABLED", "true");

  const anySourceEnabled = redditEnabled || googleEnabled || quoraEnabled || pinterestEnabled;

  if (!anySourceEnabled) {
    console.log("  [Mode] No sources enabled — using sample posts.");
    console.log("  [Mode] Set source toggles in .env to enable live data.\n");
    return samplePosts;
  }

  console.log("  [Sources] Enabled:", [
    redditEnabled && "Reddit",
    googleEnabled && "Google",
    quoraEnabled && "Quora",
    pinterestEnabled && "Pinterest"
  ].filter(Boolean).join(", "));

  if (!redditEnabled) {
    console.log("  [Reddit] Disabled — set REDDIT_ENABLED=true after API approval");
  }
  console.log("");

  const maxAgeHours = parseInt(process.env.MAX_POST_AGE_HOURS || "48", 10);
  const allPosts = [];

  const fetchers = [];

  if (redditEnabled && process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET) {
    fetchers.push(fetchAllRedditPosts(maxAgeHours).catch((err) => {
      console.log(`  [Reddit] Failed: ${err.message}`);
      return [];
    }));
  }

  if (googleEnabled) {
    fetchers.push(fetchGoogleQuestions().catch((err) => {
      console.log(`  [Google] Failed: ${err.message}`);
      return [];
    }));
  }

  if (quoraEnabled) {
    fetchers.push(fetchQuoraQuestions().catch((err) => {
      console.log(`  [Quora] Failed: ${err.message}`);
      return [];
    }));
  }

  if (pinterestEnabled) {
    fetchers.push(fetchPinterestTrends().catch((err) => {
      console.log(`  [Pinterest] Failed: ${err.message}`);
      return [];
    }));
  }

  const results = await Promise.all(fetchers);
  for (const posts of results) {
    allPosts.push(...posts);
  }

  // Deduplicate by URL and ID
  const seen = new Set();
  const unique = [];
  for (const post of allPosts) {
    const key = post.url || post.id;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(post);
    }
  }

  // Filter out already-processed posts
  const newPosts = [];
  for (const post of unique) {
    if (await isNew(post.id)) {
      newPosts.push(post);
    }
  }

  console.log(`\n  [Total] ${unique.length} unique posts found, ${newPosts.length} are new\n`);

  if (newPosts.length === 0) {
    console.log("  [Info] No new posts to process. Try again later.\n");
  }

  return newPosts;
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });

  console.log("=".repeat(60));
  console.log("  Alphabet Trains & Toys — Growth Intelligence System");
  console.log("=".repeat(60));
  console.log("");

  const posts = await getPosts();

  if (posts.length === 0) {
    console.log("  Nothing to process. Exiting.\n");
    return;
  }

  console.log(`  Processing ${posts.length} posts...\n`);

  const allResults = [];

  for (const post of posts) {
    console.log(`\n${"—".repeat(50)}`);
    console.log(`  Post: ${post.id} | ${post.platform}${post.subreddit ? ` | ${post.subreddit}` : ""}`);
    console.log(`  ${post.title}`);
    if (post.url) console.log(`  ${post.url}`);
    console.log(`${"—".repeat(50)}`);

    const result = await processPost(post);
    allResults.push(result);

    await markSeen(post.id, post.timestamp);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("  DAILY DIGEST");
  console.log(`${"=".repeat(60)}`);

  const digest = await generateDigest(allResults);

  // Rank all actions with composite scores
  const rankedActions = rankAllActions(digest);

  console.log("\n  RANKED ACTIONS:");
  console.log("  " + "-".repeat(46));
  for (const a of rankedActions.slice(0, 15)) {
    console.log(`  #${a.rank}  [${a.scores.normalized}/100 ${a.impact_label.toUpperCase()}]  ${a.action.slice(0, 60)}`);
  }
  if (rankedActions.length > 15) {
    console.log(`  ... and ${rankedActions.length - 15} more`);
  }

  // Save to actions store for dashboard
  const runId = await addRun(rankedActions, digest);
  console.log(`\n  [Store] Saved ${rankedActions.length} actions (${runId})`);

  // Export CSV
  const csvPath = await exportCsv(rankedActions);

  // Send email
  await sendDigestEmail(digest);

  console.log(`\n${"=".repeat(60)}`);
  console.log("  Run complete. Processed", allResults.length, "posts.");
  console.log("  Actions ranked:", rankedActions.length);
  console.log("  CSV exported:", csvPath);
  console.log("  Dashboard: node src/dashboard.js");
  console.log(`${"=".repeat(60)}\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
