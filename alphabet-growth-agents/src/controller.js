import { runAgent } from "./lib/runAgent.js";
import { summarizeSiteContext } from "./lib/siteContext.js";

const AGENT_FILE_MAP = {
  buyer_intent: "buyer-intent",
  content_opportunity: "content-opportunity",
  response_draft: "response-draft",
  product_intelligence: "product-intelligence",
  competitor_intelligence: "competitor-intelligence"
};

export async function runFunnelDiagnosis(siteContext) {
  console.log("\n  [Funnel Diagnosis] Analyzing site data...");
  const contextSummary = summarizeSiteContext(siteContext);
  const result = await runAgent("funnel-diagnosis", "Diagnose the funnel based on this site context.", {
    siteContext: contextSummary
  });

  if (result.error) {
    console.log(`  [Funnel Diagnosis] Error: ${result.message}`);
    return {
      constraint: "unknown",
      strategicObjective: "Improve overall site performance — insufficient data for specific diagnosis",
      saturatedStages: [],
      underservedStages: [],
      dataConfidence: "low"
    };
  }

  console.log(`  [Funnel Diagnosis] Constraint: ${result.constraint}`);
  console.log(`  [Funnel Diagnosis] Objective: ${result.strategicObjective}`);
  console.log(`  [Funnel Diagnosis] Saturated: ${result.saturatedStages?.join(", ") || "none"}`);
  console.log(`  [Funnel Diagnosis] Underserved: ${result.underservedStages?.join(", ") || "none"}`);
  console.log(`  [Funnel Diagnosis] Confidence: ${result.dataConfidence}`);

  return result;
}

export async function processPost(post, siteContext, funnelDiagnosis) {
  const contextSummary = summarizeSiteContext(siteContext);
  const agentOptions = { siteContext: contextSummary, funnelDiagnosis };

  const postContext = `Platform: ${post.platform}${post.subreddit ? ` (${post.subreddit})` : ""}
Title: ${post.title}
Body: ${post.body}
Author: ${post.author}
Engagement: ${post.upvotes} upvotes, ${post.comments} comments
Post ID: ${post.id}`;

  console.log(`\n  [Orchestrator] Analyzing post: "${post.title}"`);
  const orchestratorResult = await runAgent("orchestrator", postContext, agentOptions);

  if (orchestratorResult.error) {
    console.log(`  [Orchestrator] Error: ${orchestratorResult.message}`);
    return { post_id: post.id, orchestrator: orchestratorResult, agents: {} };
  }

  const selectedAgents = orchestratorResult.selected_agents || [];
  console.log(`  [Orchestrator] Relevance: ${orchestratorResult.relevance_score}/100`);
  console.log(`  [Orchestrator] Selected agents: ${selectedAgents.length > 0 ? selectedAgents.join(", ") : "none"}`);
  if (orchestratorResult.funnel_stage_targeted) {
    console.log(`  [Orchestrator] Funnel stage: ${orchestratorResult.funnel_stage_targeted}`);
  }

  if (selectedAgents.length === 0) {
    return { post_id: post.id, orchestrator: orchestratorResult, agents: {} };
  }

  const agentResults = {};
  const agentPromises = selectedAgents.map(async (agentKey) => {
    const promptFile = AGENT_FILE_MAP[agentKey];
    if (!promptFile) {
      console.log(`  [Warning] Unknown agent: ${agentKey}`);
      return;
    }
    console.log(`  [${agentKey}] Running...`);
    const result = await runAgent(promptFile, postContext, agentOptions);
    agentResults[agentKey] = result;
    if (result.error) {
      console.log(`  [${agentKey}] Error: ${result.message}`);
    } else {
      console.log(`  [${agentKey}] Done.`);
    }
  });

  await Promise.all(agentPromises);

  return {
    post_id: post.id,
    title: post.title,
    platform: post.platform,
    orchestrator: orchestratorResult,
    agents: agentResults
  };
}

export async function generateDigest(allResults, siteContext, funnelDiagnosis) {
  const contextSummary = summarizeSiteContext(siteContext);
  const digestInput = JSON.stringify(allResults, null, 2);
  const prompt = `Here are all the analysis results from today's community monitoring. Produce the daily digest.\n\n${digestInput}`;
  console.log("\n  [Daily Digest] Generating summary...");
  const digest = await runAgent("daily-digest", prompt, {
    siteContext: contextSummary,
    funnelDiagnosis
  });
  console.log("  [Daily Digest] Done.");
  return digest;
}
