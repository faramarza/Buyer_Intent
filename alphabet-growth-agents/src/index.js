import "dotenv/config";
import { samplePosts } from "./sample/posts.js";
import { processPost, generateDigest } from "./controller.js";

async function main() {
  console.log("=".repeat(60));
  console.log("  Alphabet Trains & Toys — Growth Intelligence System");
  console.log("=".repeat(60));
  console.log(`\n  Processing ${samplePosts.length} posts...\n`);

  const allResults = [];

  for (const post of samplePosts) {
    console.log(`\n${"—".repeat(50)}`);
    console.log(`  Post: ${post.id} | ${post.platform}`);
    console.log(`${"—".repeat(50)}`);

    const result = await processPost(post);
    allResults.push(result);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("  DAILY DIGEST");
  console.log(`${"=".repeat(60)}`);

  const digest = await generateDigest(allResults);

  console.log("\n" + JSON.stringify(digest, null, 2));

  console.log(`\n${"=".repeat(60)}`);
  console.log("  Run complete. Processed", allResults.length, "posts.");
  console.log(`${"=".repeat(60)}\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
