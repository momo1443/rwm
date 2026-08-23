import type { Locale } from "./rmw-types";
import type { ResearchTaskId } from "./research-task";

export const reasoningRecallDimensions = ["goal", "position", "constraint", "rejectedPath", "uncertainty", "nextAction"] as const;
export type ReasoningRecallDimension = typeof reasoningRecallDimensions[number];
export type RecoveryProbeStage = "t1" | "t2" | "t3";
export type RecallForm = "A" | "B";

export type RecoveryProbe = {
  reasoning: Record<ReasoningRecallDimension, string>;
  content: string[];
  form: RecallForm;
  submittedAt: string;
};

export type FrozenTrace = {
  capturedAt: string;
  cutoffSequenceNumber: number;
  memoLength: number;
  chatTurnCount: number;
  materialIds: string[];
};

export type RecoveryReadiness = {
  supportRenderedAt: string;
  readyAt: string;
  latencyMs: number;
  viewedSections: string[];
};

// Post-task survey. Five adapted subscales — see docs/post-task-survey-references.md
// for the source of each group and why the single-protocol design (no recovery
// support is ever shown) rules out asking about "recovery support" directly.
export const postTaskSurveyGroups = ["task_load", "perceived_loss", "metacognition", "ai_reliance", "agency"] as const;
export type PostTaskSurveyGroup = typeof postTaskSurveyGroups[number];

export const postTaskSurveyGroupLabels: Record<PostTaskSurveyGroup, Record<Locale, string>> = {
  task_load: { "zh-CN": "任务负荷（NASA-TLX 改编）", en: "Task load (adapted NASA-TLX)" },
  perceived_loss: { "zh-CN": "主观推理位置损失", en: "Perceived reasoning-position loss" },
  metacognition: { "zh-CN": "元认知信心", en: "Metacognitive confidence" },
  ai_reliance: { "zh-CN": "AI 依赖", en: "AI reliance" },
  agency: { "zh-CN": "掌控感", en: "Agency" },
};

export const postTaskSurveyItemKeys = [
  "mentalDemand", "temporalDemand", "effort", "frustration", "performanceSatisfaction",
  "judgmentUncertain", "rejectedPathBlurred", "nextActionForgotten",
  "distinguishCertainty", "confidentInAnswer",
  "reliedOnAI", "mightMissAIErrors",
  "memoOwnership", "overallControl",
] as const;
export type PostTaskSurveyItemKey = typeof postTaskSurveyItemKeys[number];

export type PostTaskSurveyItem = { key: PostTaskSurveyItemKey; group: PostTaskSurveyGroup; zh: string; en: string };

export const postTaskSurveyItems: PostTaskSurveyItem[] = [
  { key: "mentalDemand", group: "task_load", zh: "完成这项任务需要很高的脑力和思考投入。", en: "The task required a great deal of mental and thinking activity." },
  { key: "temporalDemand", group: "task_load", zh: "任务过程中我感觉时间压力很大。", en: "I felt a strong sense of time pressure during the task." },
  { key: "effort", group: "task_load", zh: "为了完成任务，我需要付出很大努力。", en: "I had to work hard to accomplish my level of performance." },
  { key: "frustration", group: "task_load", zh: "完成任务过程中我感到有压力、烦躁或不耐烦。", en: "I felt stressed, irritated, or annoyed while completing the task." },
  { key: "performanceSatisfaction", group: "task_load", zh: "我对自己完成这项任务的表现感到满意。", en: "I am satisfied with my performance on this task." },
  { key: "judgmentUncertain", group: "perceived_loss", zh: "中断后，我对中断前的判断变得不确定。", en: "After the interruption, I became uncertain about my pre-interruption judgment." },
  { key: "rejectedPathBlurred", group: "perceived_loss", zh: "中断后，我需要重新想清楚哪些方向此前已经排除。", en: "After the interruption, I had to work out again which directions I had already ruled out." },
  { key: "nextActionForgotten", group: "perceived_loss", zh: "中断后，我不确定自己原本计划的下一步是什么。", en: "After the interruption, I was unsure what I had originally planned to do next." },
  { key: "distinguishCertainty", group: "metacognition", zh: "我能清楚区分哪些是我确定的、哪些只是猜测。", en: "I could clearly distinguish what I was certain about from what I was merely guessing." },
  { key: "confidentInAnswer", group: "metacognition", zh: "我对自己刚才提交的回答的准确性有信心。", en: "I am confident in the accuracy of the answers I just submitted." },
  { key: "reliedOnAI", group: "ai_reliance", zh: "我在很大程度上依赖 AI 的建议来形成判断。", en: "I relied heavily on the AI's suggestions to form my judgment." },
  { key: "mightMissAIErrors", group: "ai_reliance", zh: "如果 AI 的判断有误，我可能不会立刻发现。", en: "If the AI's judgment had been wrong, I might not have noticed right away." },
  { key: "memoOwnership", group: "agency", zh: "我感觉最终备忘录的内容是由我自己主导决定的。", en: "I felt that I was the one driving the content of my final memo." },
  { key: "overallControl", group: "agency", zh: "在完成整个任务的过程中，我感觉判断始终由自己掌控。", en: "Throughout the task, I felt in control of my own judgment." },
];

export type RecoveryPostSurvey = Record<PostTaskSurveyItemKey, number>;

export type RecoveryAssessment = {
  version: "reasoning-recovery-v3-three-arm";
  taskId: ResearchTaskId;
  formOrder: "AB" | "BA";
  probes: Partial<Record<RecoveryProbeStage, RecoveryProbe>>;
  frozenTrace?: FrozenTrace;
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

const contentRecallPrompts: Record<RecallForm, Array<Record<Locale, string>>> = {
  A: [
    { "zh-CN": "材料给出的三年财政上限是多少？", en: "What was the three-year budget ceiling?" },
    { "zh-CN": "方案 A 的预计三年成本是多少？", en: "What was option A's estimated three-year cost?" },
    { "zh-CN": "方案 B 的预计覆盖率是多少？", en: "What coverage rate was estimated for option B?" },
    { "zh-CN": "方案 C 的审批可能延后多久？", en: "How long could option C's approval be delayed?" },
    { "zh-CN": "方案 A 的居民满意度是多少？", en: "What was option A's resident satisfaction rate?" },
    { "zh-CN": "模型估计方案 B 可使填埋量下降多少？", en: "How much did the model estimate option B could reduce landfill volume?" },
  ],
  B: [
    { "zh-CN": "方案 C 的预计三年成本是多少？", en: "What was option C's estimated three-year cost?" },
    { "zh-CN": "方案 A 的郊区覆盖率是多少？", en: "What was option A's suburban coverage rate?" },
    { "zh-CN": "65 岁以上居民独立完成 B 注册的比例是多少？", en: "What share of residents over 65 completed option B registration independently?" },
    { "zh-CN": "方案 B 试点中未正确计分的记录比例是多少？", en: "What share of option B trial records were not credited correctly?" },
    { "zh-CN": "方案 C 候选区居民反对率是多少？", en: "What was the opposition rate around option C's candidate sites?" },
    { "zh-CN": "方案 C 的运输会抵消多少个百分点的减排收益？", en: "How many percentage points of option C's benefit would transport offset?" },
  ],
};

export function recallFormFor(assessment: RecoveryAssessment, stage: RecoveryProbeStage): RecallForm {
  return assessment.formOrder[stage === "t1" ? 0 : 1] as RecallForm;
}

export function getContentRecallPrompts(form: RecallForm, locale: Locale) {
  return contentRecallPrompts[form].map((prompt) => prompt[locale]);
}

export function createRecoveryAssessment(taskId: ResearchTaskId, sessionId = "0"): RecoveryAssessment {
  const lastHex = sessionId.replaceAll("-", "").at(-1) || "0";
  return {
    version: "reasoning-recovery-v3-three-arm",
    taskId,
    formOrder: Number.parseInt(lastHex, 16) % 2 === 0 ? "AB" : "BA",
    probes: {},
  };
}

export function withRecoveryProbe(assessment: RecoveryAssessment, stage: RecoveryProbeStage, probe: RecoveryProbe) {
  return { ...assessment, probes: { ...assessment.probes, [stage]: probe } };
}

export function recoveryAssessmentEventPayload(stage: RecoveryProbeStage, probe: RecoveryProbe) {
  return {
    version: "reasoning-recovery-v3-three-arm",
    stage,
    form: probe.form,
    reasoningAnswered: reasoningRecallDimensions.filter((dimension) => probe.reasoning[dimension].trim()).length,
    contentAnswered: probe.content.filter((answer) => answer.trim()).length,
    reasoningResponseLengths: reasoningRecallDimensions.map((dimension) => probe.reasoning[dimension].length),
    contentResponseLengths: probe.content.map((answer) => answer.length),
  };
}

export function formatReasoningRecall(reasoning: Record<ReasoningRecallDimension, string> | undefined, locale: Locale) {
  if (!reasoning) return "";
  return reasoningRecallDimensions
    .map((dimension, index) => `${index + 1}. ${reasoningRecallShortLabels[dimension][locale]}：${reasoning[dimension]?.trim() || "（未作答）"}`)
    .join("\n");
}
