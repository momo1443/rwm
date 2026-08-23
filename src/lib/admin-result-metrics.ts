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
  meanResponseTimeMs: number | null;
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
  const responseTimes = trials.map((event) => event.payload?.responseTimeMs).filter((value): value is number => typeof value === "number" && value >= 0);
  return {
    responses: trials.length,
    correct,
    accuracy: trials.length ? correct / trials.length : null,
    attempts: attempts.length,
    bestScore: scores.length ? Math.max(...scores) : null,
    finalScore: scores.at(-1) ?? null,
    passed: events.some((event) => event.event_type === passedType),
    meanResponseTimeMs: responseTimes.length ? responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length : null,
  };
}

export function interruptionMetrics(events: AdminMetricEvent[]) {
  const started = events.find((event) => event.event_type === "interruption_started");
  const completed = events.findLast((event) => event.event_type === "interruption_completed");
  const recordedDuration = typeof completed?.payload?.durationSeconds === "number" ? completed.payload.durationSeconds : null;
  const timestampDuration = started && completed
    ? Math.max(0, (new Date(completed.client_timestamp).getTime() - new Date(started.client_timestamp).getTime()) / 1000)
    : null;
  return {
    letter: summarizeTrials(events, "letter_game_answered", 2, "interruption_completed"),
    color: summarizeTrials(events, "color_game_answered", 0, "interruption_completed"),
    completed: Boolean(completed),
    durationSeconds: recordedDuration ?? timestampDuration,
  };
}

export type TaskMilestone = { label: string; complete: boolean; evidence: string };

export function taskMilestones(events: AdminMetricEvent[], status: "started" | "completed"): TaskMilestone[] {
  const has = (...types: string[]) => events.some((event) => types.includes(event.event_type));
  const materialIds = new Set(events
    .filter((event) => event.event_type === "material_exposure_completed" && event.stage === "research_work")
    .map((event) => event.target_id)
    .filter(Boolean));
  const taskId = events.find((event) => typeof event.payload?.taskId === "string")?.payload?.taskId;
  const expectedMaterials = taskId === "city_policy" ? 5 : taskId === "ai_course_policy" || taskId === "night_transit" ? 6 : 5;
  const recoveryProbe = (stage: "t1" | "t2") => events.some((event) => event.event_type === "recovery_probe_submitted" && event.payload?.stage === stage);
  return [
    { label: "同意并建立运行", complete: has("consent_submitted"), evidence: "consent_submitted" },
    { label: "完成前测", complete: has("pre_survey_completed"), evidence: "pre_survey_completed" },
    { label: "确认任务说明", complete: has("task_brief_confirmed"), evidence: "task_brief_confirmed" },
    { label: "完成第一阶段材料最低暴露", complete: materialIds.size >= expectedMaterials, evidence: `${materialIds.size}/${expectedMaterials} materials` },
    { label: "结束第一阶段工作", complete: has("phase_one_checkpoint_requested", "workspace_auto_advanced"), evidence: "phase-one exit" },
    { label: "冻结中断前 trace", complete: has("trace_frozen"), evidence: "trace_frozen" },
    { label: "提交 T1（6 reasoning + 6 content）", complete: recoveryProbe("t1"), evidence: "recovery_probe_submitted:t1" },
    { label: "完成中断任务", complete: has("interruption_completed"), evidence: "interruption_completed" },
    { label: "提交 T2（6 reasoning + 6 content）", complete: recoveryProbe("t2"), evidence: "recovery_probe_submitted:t2" },
    { label: "开放 D6", complete: has("recovery_new_evidence_unlocked"), evidence: "recovery_new_evidence_unlocked" },
    { label: "完成 10 分钟延续任务", complete: has("continuation_completed"), evidence: "continuation_completed" },
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
