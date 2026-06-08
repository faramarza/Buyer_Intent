import "dotenv/config";
import { mkdir } from "fs/promises";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { samplePosts } from "./sample/posts.js";
import { processPost, generateDigest } from "./controller.js";
import { sendDigestEmail } from "./lib/sendEmail.js";
import { fetchAllRedditPosts } from "./lib/reddit.js";
import { loadSeenPosts, markSeen, isNew } from "./lib/postTracker.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../data");

async function getPosts() {
  if (!process.env.REDDIT_CLIENT_ID || !process.env.REDDIT_CLIENT_SECRET) {
    console.log("  [Mode] No Reddit credentials — using sample posts.");
    console.log("  [Mode] Add REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET to .env for live data.\n");
    return samplePosts;
  }

  const maxAgeHours = parseInt(process.env.MAX_POST_AGE_HOURS || "48", 10);
  const allPosts = await fetchAllRedditPosts(maxAgeHours);

  const newPosts = [];
  for (const post of allPosts) {
    if (await isNew(post.id)) {
      newPosts.push(post);
    }
  }

  console.log(`  [Filter] ${newPosts.length} new posts (${allPosts.length - newPosts.length} already seen)\n`);

  if (newPosts.length === 0) {
    console.log("  [Info] No new posts to process. Try again later or increase MAX_POST_AGE_HOURS.\n");
  }

  return newPosts;
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });

  console.log("=".repeat(60));
  console.log("  Alphabet Trains & Toys — Growth Intelligence System");
  console.log("=".repeat(60));

  const posts = await getPosts();

  if (posts.length === 0) {
    console.log("  Nothing to process. Exiting.\n");
    return;
  }

  console.log(`  Processing ${posts.length} posts...\n`);

  const allResults = [];

  for (const post of posts) {
    console.log(`\n${"—".repeat(50)}`);
    console.log(`  Post: ${post.id} | ${post.platform} | ${post.subreddit || ""}`);
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

  console.log("\n" + JSON.stringify(digest, null, 2));

  await sendDigestEmail(digest);

  console.log(`\n${"=".repeat(60)}`);
  console.log("  Run complete. Processed", allResults.length, "posts.");
  console.log(`${"=".repeat(60)}\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
