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
  formOrder: "AB" | "BA";
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

type PromptSet = Record<RecallForm, Array<Record<Locale, string>>>;

const contentRecallPrompts: Record<ResearchTaskId, PromptSet> = {
  city_policy: {
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
  },
  ai_course_policy: {
    A: [
      { "zh-CN": "有指导的 AI 使用使概念迁移题平均提高多少？", en: "How much did guided AI use improve concept-transfer scores?" },
      { "zh-CN": "疑似未披露代写的作业比例升到多少？", en: "To what rate did suspected undisclosed ghostwriting rise?" },
      { "zh-CN": "调查中多少学生认为 AI 帮助更快尝试不同思路？", en: "What share of students said AI helped them try ideas faster?" },
      { "zh-CN": "教师审核每份 AI 使用声明平均增加多少时间？", en: "How much review time did AI-use declarations add per assignment?" },
      { "zh-CN": "材料提到哪类学生可能从即时改写与结构提示中受益？", en: "Which students might benefit from instant rewriting and structure prompts?" },
      { "zh-CN": "教育测量小组建议组合哪些考核形式？", en: "Which assessment formats did the measurement group recommend combining?" },
    ],
    B: [
      { "zh-CN": "基础较弱学生在使用 AI 时更常出现什么行为？", en: "What behavior was more common among students with weaker prior knowledge?" },
      { "zh-CN": "疑似未披露代写的原始比例是多少？", en: "What was the original suspected undisclosed ghostwriting rate?" },
      { "zh-CN": "多少学生表示时间压力下会停止自行核查？", en: "What share said they stopped checking under time pressure?" },
      { "zh-CN": "不同院系对违规判断的一致率是多少？", en: "What was the agreement rate across departments on violations?" },
      { "zh-CN": "AI 对专业术语可能造成什么无障碍风险？", en: "What accessibility risk could AI create for technical terminology?" },
      { "zh-CN": "教师反馈时间平均减少多少？", en: "How much did average feedback time decrease?" },
    ],
  },
  night_transit: {
    A: [
      { "zh-CN": "工作日夜间平均有多少次跨校区出行？", en: "How many cross-campus trips occurred on an average weekday night?" },
      { "zh-CN": "首年预算上限是多少？", en: "What was the first-year budget ceiling?" },
      { "zh-CN": "登记有夜间通行需求的行动不便学生有多少人？", en: "How many mobility-impaired students had registered night-travel needs?" },
      { "zh-CN": "保卫处建议服务运营到几点？", en: "Until what time did campus security recommend operating?" },
      { "zh-CN": "现有部门最多可提供多少名夜间司机？", en: "How many night drivers could the existing department provide?" },
      { "zh-CN": "学生中偏好固定线路的比例是多少？", en: "What share of students preferred fixed routes?" },
    ],
    B: [
      { "zh-CN": "22:30 后的需求占夜间出行多少？", en: "What share of night travel demand occurred after 22:30?" },
      { "zh-CN": "一辆电动小巴的年综合成本是多少？", en: "What was the annual total cost of one electric minibus?" },
      { "zh-CN": "学生代表要求平均候车时间不高于多少？", en: "What maximum average wait did student representatives request?" },
      { "zh-CN": "过去安全求助事件中有多少发生在 00:00–02:00？", en: "What share of safety calls occurred from 00:00 to 02:00?" },
      { "zh-CN": "新增司机招聘至少需要多久？", en: "How long would hiring additional drivers take?" },
      { "zh-CN": "4 辆电动小巴的年度排放约为柴油方案的多少？", en: "What share of diesel emissions would four electric minibuses produce?" },
    ],
  },
};

export function recallFormFor(assessment: RecoveryAssessment, stage: RecoveryProbeStage): RecallForm {
  if (stage === "t3") return assessment.formOrder[1] as RecallForm;
  return assessment.formOrder[stage === "t1" ? 0 : 1] as RecallForm;
}

export function getContentRecallPrompts(taskId: ResearchTaskId, form: RecallForm, locale: Locale) {
  return contentRecallPrompts[taskId][form].map((prompt) => prompt[locale]);
}

export function createRecoveryAssessment(taskId: ResearchTaskId, sessionId: string): RecoveryAssessment {
  const lastHex = sessionId.replaceAll("-", "").at(-1) || "0";
  return {
    version: "reasoning-recovery-v2",
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
    version: "reasoning-recovery-v2",
    stage,
    form: probe.form,
    reasoningAnswered: reasoningRecallDimensions.filter((dimension) => probe.reasoning[dimension].trim()).length,
    contentAnswered: probe.content.filter((answer) => answer.trim()).length,
    reasoningResponseLengths: reasoningRecallDimensions.map((dimension) => probe.reasoning[dimension].length),
    contentResponseLengths: probe.content.map((answer) => answer.length),
  };
}
