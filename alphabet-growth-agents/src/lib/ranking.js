const WEIGHT = {
  revenue: 4,
  seo: 3,
  ease: 2,
  intent: 3,
  engagement: 1
};

const LEVEL_SCORE = { high: 3, medium: 2, low: 1 };
const EASE_SCORE = { easy: 3, moderate: 2, hard: 1 };
const URGENCY_SCORE = { today: 4, this_week: 3, this_month: 2, backlog: 1 };

function scoreLevel(val) {
  return LEVEL_SCORE[String(val).toLowerCase()] || 1;
}

function scoreEase(val) {
  return EASE_SCORE[String(val).toLowerCase()] || 1;
}

function scoreUrgency(val) {
  return URGENCY_SCORE[String(val).toLowerCase()] || 1;
}

export function rankAction(action) {
  const revenue = scoreLevel(action.revenue_potential) * WEIGHT.revenue;
  const seo = scoreLevel(action.seo_value) * WEIGHT.seo;
  const ease = scoreEase(action.ease_of_execution) * WEIGHT.ease;
  const urgency = scoreUrgency(action.deadline);
  const intentBonus = action.intent_score ? (action.intent_score / 100) * WEIGHT.intent * 3 : 0;

  const composite = revenue + seo + ease + urgency + intentBonus;
  const maxPossible = WEIGHT.revenue * 3 + WEIGHT.seo * 3 + WEIGHT.ease * 3 + 4 + WEIGHT.intent * 3;
  const normalizedScore = Math.round((composite / maxPossible) * 100);

  return {
    ...action,
    scores: {
      revenue,
      seo,
      ease,
      urgency,
      intent_bonus: Math.round(intentBonus * 10) / 10,
      composite: Math.round(composite * 10) / 10,
      normalized: normalizedScore
    },
    impact_label: getImpactLabel(normalizedScore)
  };
}

function getImpactLabel(score) {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  if (score >= 20) return "low";
  return "minimal";
}

export function rankAllActions(digest) {
  const actions = [];

  for (const action of digest.priority_actions || []) {
    actions.push(rankAction({ ...action, type: "action" }));
  }

  for (const resp of digest.responses_ready_to_post || []) {
    actions.push(rankAction({
      type: "response",
      action: `Post reply on ${resp.platform} — ${resp.post_id}`,
      category: "engage",
      revenue_potential: resp.intent_score > 60 ? "high" : resp.intent_score > 30 ? "medium" : "low",
      seo_value: "low",
      ease_of_execution: "easy",
      deadline: resp.intent_score > 60 ? "today" : "this_week",
      intent_score: resp.intent_score,
      response_text: resp.response_text,
      source_post: resp.post_id
    }));
  }

  for (const item of digest.content_calendar_additions || []) {
    actions.push(rankAction({
      type: "content",
      action: `Create ${item.format}: ${item.topic}`,
      category: "content",
      revenue_potential: "medium",
      seo_value: item.estimated_search_volume === "high" ? "high" : item.estimated_search_volume || "medium",
      ease_of_execution: item.format === "faq" ? "easy" : "moderate",
      deadline: item.suggested_publish_date || "this_month",
      target_keyword: item.target_keyword
    }));
  }

  for (const c of digest.competitor_watch || []) {
    actions.push(rankAction({
      type: "competitor",
      action: `Competitor response: ${c.competitor} — ${c.our_response}`,
      category: "competitive",
      revenue_potential: "medium",
      seo_value: "low",
      ease_of_execution: "moderate",
      deadline: "this_week",
      competitor: c.competitor,
      signal: c.signal
    }));
  }

  actions.sort((a, b) => b.scores.normalized - a.scores.normalized);

  actions.forEach((a, i) => {
    a.rank = i + 1;
  });

  return actions;
}
