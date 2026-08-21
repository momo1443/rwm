import type { Locale } from "./rmw-types";
import type { ResearchTaskId } from "./research-task";

export const reasoningRecallDimensions = ["goal", "position", "constraint", "rejectedPath", "uncertainty", "nextAction"] as const;
export type ReasoningRecallDimension = typeof reasoningRecallDimensions[number];
export type RecoveryProbeStage = "t1" | "t2" | "t3";

export type RecoveryProbe = {
  reasoning: Record<ReasoningRecallDimension, string>;
  submittedAt: string;
};

export type RecoveryReadiness = {
  supportRenderedAt: string;
  readyAt: string;
  latencyMs: number;
  viewedSections: string[];
};

export type RecoveryPostSurvey = {
  continuity: number;
  mentalDemand: number;
  confidence: number;
  agency: number;
  supportSufficiency: number;
};

export type RecoveryAssessment = {
  version: "reasoning-recovery-v2";
  taskId: ResearchTaskId;
  probes: Partial<Record<RecoveryProbeStage, RecoveryProbe>>;
  participantNotes?: string;
  readiness?: RecoveryReadiness;
  postSurvey?: RecoveryPostSurvey;
};

export const reasoningRecallPrompts: Record<ReasoningRecallDimension, Record<Locale, string>> = {
  goal: { "zh-CN": "中断前你正在解决的核心目标是什么？", en: "What core goal were you pursuing before the interruption?" },
  position: { "zh-CN": "你的判断当时推进到哪里？请写出当前立场或方案及其关键依据。", en: "Where had your reasoning reached? State the current position or design and its key basis." },
  constraint: { "zh-CN": "当时仍然约束你的一个关键条件是什么？", en: "What key constraint was still binding your reasoning?" },
  rejectedPath: { "zh-CN": "你已经排除了什么方向，为什么排除？", en: "What direction had you rejected, and why?" },
  uncertainty: { "zh-CN": "哪个尚未解决的不确定性最可能改变当前判断？", en: "Which unresolved uncertainty was most likely to change the current judgment?" },
  nextAction: { "zh-CN": "你原本准备采取的最小下一步是什么？", en: "What was the minimum next action you intended to take?" },
};

export const reasoningRecallShortLabels: Record<ReasoningRecallDimension, Record<Locale, string>> = {
  goal: { "zh-CN": "当前目标", en: "Goal" },
  position: { "zh-CN": "推理位置", en: "Position" },
  constraint: { "zh-CN": "关键约束", en: "Constraint" },
  rejectedPath: { "zh-CN": "已排除路径", en: "Rejected path" },
  uncertainty: { "zh-CN": "未解决问题", en: "Uncertainty" },
  nextAction: { "zh-CN": "下一步行动", en: "Next action" },
};

export function createRecoveryAssessment(taskId: ResearchTaskId): RecoveryAssessment {
  return {
    version: "reasoning-recovery-v2",
    taskId,
    probes: {},
  };
}

export function withRecoveryProbe(assessment: RecoveryAssessment, stage: RecoveryProbeStage, probe: RecoveryProbe) {
  return { ...assessment, probes: { ...assessment.probes, [stage]: probe } };
}

export function recoveryAssessmentEventPayload(stage: RecoveryProbeStage, probe: RecoveryProbe) {
  return {
    version: "reasoning-recovery-v2",
    stage,
    reasoningAnswered: reasoningRecallDimensions.filter((dimension) => probe.reasoning[dimension].trim()).length,
    reasoningResponseLengths: reasoningRecallDimensions.map((dimension) => probe.reasoning[dimension].length),
  };
}

export function formatReasoningRecall(reasoning: Record<ReasoningRecallDimension, string> | undefined, locale: Locale) {
  if (!reasoning) return "";
  return reasoningRecallDimensions
    .map((dimension, index) => `${index + 1}. ${reasoningRecallShortLabels[dimension][locale]}：${reasoning[dimension]?.trim() || "（未作答）"}`)
    .join("\n");
}
