import { runAgent } from "../runAgent.js";

export async function classifyIntents(querySet) {
  if (!querySet || querySet.length === 0) {
    console.log("  [Intent] Skipped — no query set provided");
    return null;
  }

  console.log(`  [Intent] Classifying ${querySet.length} queries...`);

  const batches = [];
  const batchSize = 80;
  for (let i = 0; i < querySet.length; i += batchSize) {
    batches.push(querySet.slice(i, i + batchSize));
  }

  const allClassified = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const queryList = batch.map((q) => `- "${q.query}" (${q.impressions} imp, ${q.clicks} clicks)`).join("\n");

    const result = await runAgent("intent-classifier", `Classify these ${batch.length} queries:\n\n${queryList}`);

    if (result.classified) {
      allClassified.push(...result.classified);
    }
    console.log(`  [Intent] Batch ${i + 1}/${batches.length} done`);
  }

  const distribution = { informational: 0, commercial: 0, transactional: 0, navigational: 0, branded: 0, local: 0 };
  let totalImpressions = 0;

  for (const q of allClassified) {
    const intent = q.intent?.toLowerCase() || "informational";
    if (distribution.hasOwnProperty(intent)) {
      const orig = querySet.find((qs) => qs.query === q.query);
      const imp = orig?.impressions || 1;
      distribution[intent] += imp;
      totalImpressions += imp;
    }
  }

  for (const key of Object.keys(distribution)) {
    distribution[key] = totalImpressions > 0
      ? Math.round((distribution[key] / totalImpressions) * 10000) / 100
      : 0;
  }

  console.log(`  [Intent] Distribution:`, distribution);

  return {
    source: "claude_classification",
    fetchedAt: new Date().toISOString(),
    totalQueries: allClassified.length,
    distribution,
    classifiedQueries: allClassified.slice(0, 200)
  };
}
