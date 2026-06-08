export function safeJsonParse(text, agentName) {
  if (!text || typeof text !== "string") {
    return {
      error: true,
      agent: agentName,
      message: "Empty or non-string response",
      raw: text
    };
  }

  let cleaned = text.trim();

  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  const jsonStart = cleaned.search(/[{\[]/);
  if (jsonStart > 0) {
    cleaned = cleaned.slice(jsonStart);
  }

  const lastBrace = cleaned.lastIndexOf("}");
  const lastBracket = cleaned.lastIndexOf("]");
  const lastJsonChar = Math.max(lastBrace, lastBracket);
  if (lastJsonChar > -1 && lastJsonChar < cleaned.length - 1) {
    cleaned = cleaned.slice(0, lastJsonChar + 1);
  }

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    return {
      error: true,
      agent: agentName,
      message: `JSON parse failed: ${e.message}`,
      raw: text.slice(0, 500)
    };
  }
}
