const WEIGHT = {
  objective_alignment: 5,
  revenue: 4,
  evidence: 3,
  ease: 2,
  intent: 3
};

const EASE_SCORE = { easy: 3, moderate: 2, hard: 1 };
const URGENCY_SCORE = { today: 4, this_week: 3, this_month: 2, backlog: 1 };

function scoreEase(val) {
  return EASE_SCORE[String(val).toLowerCase()] || 1;
}

function scoreUrgency(val) {
  return URGENCY_SCORE[String(val).toLowerCase()] || 1;
}

function scoreRevenueImpact(val) {
  if (typeof val === "number" && val > 0) {
    if (val >= 5000) return 3;
    if (val >= 1000) return 2;
    return 1;
  }
  return 0;
}

function scoreObjectiveAlignment(action, funnelDiagnosis) {
  if (!funnelDiagnosis || !funnelDiagnosis.underservedStages) return 1;

  const stage = action.funnel_stage?.toLowerCase();
  if (!stage) return 1;

  if (funnelDiagnosis.saturatedStages?.includes(stage)) return 0;
  if (funnelDiagnosis.underservedStages?.includes(stage)) return 3;
  if (stage === funnelDiagnosis.constraint) return 3;

  return 1;
}

function scoreEvidence(action) {
  if (action.speculative) return 0;
  if (action.evidence && action.evidence !== "insufficient_data") return 3;
  return 1;
}

export function rankAction(action, funnelDiagnosis) {
  const objectiveScore = scoreObjectiveAlignment(action, funnelDiagnosis) * WEIGHT.objective_alignment;
  const revenueScore = scoreRevenueImpact(action.revenueImpact) * WEIGHT.revenue;
  const evidenceScore = scoreEvidence(action) * WEIGHT.evidence;
  const ease = scoreEase(action.ease_of_execution) * WEIGHT.ease;
  const urgency = scoreUrgency(action.deadline);
  const intentBonus = action.intent_score ? (action.intent_score / 100) * WEIGHT.intent * 3 : 0;

  const composite = objectiveScore + revenueScore + evidenceScore + ease + urgency + intentBonus;
  const maxPossible = WEIGHT.objective_alignment * 3 + WEIGHT.revenue * 3 + WEIGHT.evidence * 3 + WEIGHT.ease * 3 + 4 + WEIGHT.intent * 3;
  const normalizedScore = Math.round((composite / maxPossible) * 100);

  return {
    ...action,
    scores: {
      objective_alignment: objectiveScore,
      revenue: revenueScore,
      evidence: evidenceScore,
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

export function rankAllActions(digest, funnelDiagnosis) {
  const actions = [];

  for (const action of digest.priority_actions || []) {
    actions.push(rankAction({ ...action, type: "action" }, funnelDiagnosis));
  }

  for (const resp of digest.responses_ready_to_post || []) {
    actions.push(rankAction({
      type: "response",
      action: `Post reply on ${resp.platform} — ${resp.post_id}`,
      category: "engage",
      revenueImpact: resp.intent_score > 60 ? "insufficient_data" : "insufficient_data",
      evidence: resp.evidence || "insufficient_data",
      speculative: !resp.evidence,
      ease_of_execution: "easy",
      deadline: resp.intent_score > 60 ? "today" : "this_week",
      intent_score: resp.intent_score,
      response_text: resp.response_text,
      source_post: resp.post_id,
      funnel_stage: "consideration"
    }, funnelDiagnosis));
  }

  for (const item of digest.content_calendar_additions || []) {
    actions.push(rankAction({
      type: "content",
      action: `Create ${item.format}: ${item.topic}`,
      category: "content",
      revenueImpact: "insufficient_data",
      evidence: item.evidence || "insufficient_data",
      speculative: item.speculative !== false,
      ease_of_execution: item.format === "faq" ? "easy" : "moderate",
      deadline: item.suggested_publish_date || "this_month",
      target_keyword: item.target_keyword,
      funnel_stage: item.funnel_stage || "awareness"
    }, funnelDiagnosis));
  }

  for (const c of digest.competitor_watch || []) {
    actions.push(rankAction({
      type: "competitor",
      action: `Competitor response: ${c.competitor} — ${c.our_response}`,
      category: "competitive",
      revenueImpact: "insufficient_data",
      evidence: c.evidence || "insufficient_data",
      speculative: !c.evidence,
      ease_of_execution: "moderate",
      deadline: "this_week",
      competitor: c.competitor,
      signal: c.signal,
      funnel_stage: "consideration"
    }, funnelDiagnosis));
  }

  actions.sort((a, b) => b.scores.normalized - a.scores.normalized);

  actions.forEach((a, i) => {
    a.rank = i + 1;
  });

  return actions;
}
