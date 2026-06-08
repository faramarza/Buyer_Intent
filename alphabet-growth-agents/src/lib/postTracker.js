import { writeFile, readFile } from "fs/promises";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRACKER_PATH = resolve(__dirname, "../../data/seen-posts.json");

export async function loadSeenPosts() {
  try {
    const data = await readFile(TRACKER_PATH, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

export async function markSeen(postId, timestamp) {
  const seen = await loadSeenPosts();
  seen[postId] = { first_seen: timestamp, last_checked: new Date().toISOString() };
  await writeFile(TRACKER_PATH, JSON.stringify(seen, null, 2));
}

export async function isNew(postId) {
  const seen = await loadSeenPosts();
  return !seen[postId];
}
