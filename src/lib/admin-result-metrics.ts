export type AdminMetricEvent = {
  sequence_number: number;
  event_type: string;
  stage: string;
  target_id?: string | null;
  payload?: Record<string, unknown> | null;
  client_timestamp: string;
};

export type InterruptionMetric = {
  responses: number;
  correct: number;
  accuracy: number | null;
  attempts: number;
  bestScore: number | null;
  finalScore: number | null;
  passed: boolean;
};

function trialIndex(event: AdminMetricEvent) {
  return typeof event.payload?.index === "number" ? event.payload.index : null;
}

function summarizeTrials(events: AdminMetricEvent[], eventType: string, firstIndex: number, passedType: string): InterruptionMetric {
  const trials = events.filter((event) => event.event_type === eventType);
  const attempts: AdminMetricEvent[][] = [];
  for (const trial of trials) {
    if (!attempts.length || (trialIndex(trial) === firstIndex && attempts.at(-1)!.length > 0)) attempts.push([]);
    attempts.at(-1)!.push(trial);
  }
  const scores = attempts.map((attempt) => attempt.filter((event) => event.payload?.correct === true).length);
  const correct = trials.filter((event) => event.payload?.correct === true).length;
  return {
    responses: trials.length,
    correct,
    accuracy: trials.length ? correct / trials.length : null,
    attempts: attempts.length,
    bestScore: scores.length ? Math.max(...scores) : null,
    finalScore: scores.at(-1) ?? null,
    passed: events.some((event) => event.event_type === passedType),
  };
}

export function interruptionMetrics(events: AdminMetricEvent[]) {
  return {
    letter: summarizeTrials(events, "letter_game_answered", 2, "letter_game_passed"),
    color: summarizeTrials(events, "color_game_answered", 0, "interruption_completed"),
    completed: events.some((event) => event.event_type === "interruption_completed"),
  };
}

export type TaskMilestone = { label: string; complete: boolean; evidence: string };

export function taskMilestones(events: AdminMetricEvent[], status: "started" | "completed"): TaskMilestone[] {
  const has = (...types: string[]) => events.some((event) => types.includes(event.event_type));
  const materialIds = new Set(events
    .filter((event) => event.event_type === "material_exposure_completed")
    .map((event) => event.target_id)
    .filter(Boolean));
  return [
    { label: "同意并建立运行", complete: has("consent_submitted"), evidence: "consent_submitted" },
    { label: "完成前测", complete: has("pre_survey_completed"), evidence: "pre_survey_completed" },
    { label: "确认任务说明", complete: has("task_brief_confirmed"), evidence: "task_brief_confirmed" },
    { label: "完成五份材料最低暴露", complete: materialIds.size >= 5, evidence: `${materialIds.size}/5 materials` },
    { label: "结束第一阶段工作", complete: has("phase_one_checkpoint_requested", "phase_one_control_completed"), evidence: "phase-one exit" },
    { label: "完成中断任务", complete: has("interruption_completed"), evidence: "interruption_completed" },
    { label: "提交无辅助回忆", complete: has("unsupported_recall_submitted"), evidence: "unsupported_recall_submitted" },
    { label: "进入恢复阶段", complete: has("recovery_support_rendered", "recovery_support_revealed"), evidence: "recovery support" },
    { label: "提交最终任务", complete: status === "completed" || has("end_study_clicked"), evidence: status },
  ];
}

export function chatCounts(chat: Array<{ role: "user" | "assistant"; text: string }> | null | undefined) {
  const turns = Array.isArray(chat) ? chat : [];
  return {
    total: turns.length,
    user: turns.filter((turn) => turn.role === "user").length,
    assistant: turns.filter((turn) => turn.role === "assistant").length,
    characters: turns.reduce((sum, turn) => sum + turn.text.length, 0),
  };
}
