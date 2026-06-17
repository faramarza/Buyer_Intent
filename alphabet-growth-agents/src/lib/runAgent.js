import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "fs/promises";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { safeJsonParse } from "./safeJsonParse.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = resolve(__dirname, "../../prompts");

const client = new Anthropic();

const promptCache = new Map();

async function loadPrompt(agentName) {
  if (promptCache.has(agentName)) {
    return promptCache.get(agentName);
  }
  const filePath = resolve(PROMPTS_DIR, `${agentName}.md`);
  const content = await readFile(filePath, "utf-8");
  promptCache.set(agentName, content);
  return content;
}

export async function runAgent(agentName, userMessage, { siteContext, funnelDiagnosis } = {}) {
  let systemPrompt = await loadPrompt(agentName);

  if (siteContext) {
    systemPrompt += "\n\n## SITE CONTEXT (first-party data — cite `source` and `fetchedAt` in evidence)\n\n" + siteContext;
  }

  if (funnelDiagnosis) {
    systemPrompt += "\n\n## FUNNEL DIAGNOSIS (current cycle)\n\n" + JSON.stringify(funnelDiagnosis, null, 2);
  }

  const response = await client.messages.create({
    model: process.env.CLAUDE_MODEL || "claude-sonnet-4-6-20250514",
    max_tokens: 2000,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: userMessage
      }
    ]
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  return safeJsonParse(text, agentName);
}
