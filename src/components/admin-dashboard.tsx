"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Brain, CheckCircle, DownloadSimple, LockKey, SignOut,
  Trash, Users, WarningCircle,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { chatCounts, interruptionMetrics, taskMilestones, type AdminMetricEvent, type InterruptionMetric } from "@/lib/admin-result-metrics";
import { answerLabel, mean, scoredSubscales, subscaleScores, surveyItems, type SurveyAnswer } from "@/lib/pre-survey-admin";
import { researchTaskMetadata } from "@/lib/research-task";
import { cityPolicyRecoveryMetrics, type CityPolicyAssessment, type CityPolicyProbeStage } from "@/lib/city-policy-assessment";
import { reasoningRecallDimensions, type RecoveryAssessment, type RecoveryProbeStage } from "@/lib/recovery-assessment";

type AnalysisStatus = "included" | "excluded" | "trashed";
type ResultSummary = {
  session_id: string;
  participant_code: string;
  locale: string;
  condition: string;
  task_id: string;
  status: "started" | "completed";
  analysis_status: AnalysisStatus;
  exclusion_reason: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  consented_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  pre_survey: SurveyAnswer | null;
  memo_length: number;
  chat_turn_count: number;
  user_chat_turn_count: number;
  assistant_chat_turn_count: number;
  has_recall: boolean;
  recall_answer_count: number;
  has_problem_state: boolean;
  task_steps_complete: number;
  task_steps_total: number;
  interruption_completed: boolean;
  letter_accuracy: number | null;
  letter_attempts: number;
  color_accuracy: number | null;
  color_attempts: number;
  event_count: number;
  event_sequence_complete: boolean;
  initial_material_presented: boolean;
  initial_material_id: string;
  expected_material_count: number;
  material_completion_count: number;
  recovery_new_material_exposed: boolean | null;
  recovery_rendered: boolean;
  recovery_tabs: string[];
  researcher_test: boolean;
  assessment_version: string | null;
  recovery_probe_count: number;
  recovery_probe_complete: boolean;
  content_probe_complete: boolean;
  recovery_readiness_seconds: number | null;
  participant_notes_present: boolean;
  post_survey_complete: boolean;
  city_policy_t2_accuracy: number | null;
  city_policy_t3_accuracy: number | null;
  city_policy_recovery_gain: number | null;
};
type ParticipantResult = Omit<ResultSummary, "memo_length" | "has_recall" | "has_problem_state" | "event_count" | "event_sequence_complete" | "initial_material_presented" | "initial_material_id" | "expected_material_count" | "material_completion_count" | "recovery_new_material_exposed" | "recovery_rendered" | "recovery_tabs" | "researcher_test"> & {
  memo: string | null;
  chat: Array<{ role: "user" | "assistant"; text: string }> | null;
  problem_state: unknown;
  recall: Record<string, string> | null;
  recovery_state: unknown;
  task_assessment: unknown;
};
type ResultEvent = AdminMetricEvent & { id: string; target_type?: string | null; server_timestamp?: string };
type AccessState = "loading" | "login" | "ready" | "unavailable";
type DetailTab = "overview" | "survey" | "interruption" | "task" | "chat" | "events" | "raw";

const statusLabels: Record<AnalysisStatus, string> = { included: "纳入分析", excluded: "排除分析", trashed: "回收站" };
const conditionLabels: Record<string, string> = {
  rmw: "方式一",
  rmw_no_summary: "方式二",
  summary_only: "方式三",
  summary: "旧版自动摘要",
  notes: "旧版用户笔记",
  control: "旧版无辅助对照",
};
const activeConditionDefinitions = [
  { id: "rmw", label: "方式一", description: "完整 RMW：AI 恢复摘要、推理卡片与知识网络。" },
  { id: "rmw_no_summary", label: "方式二", description: "用户自主笔记基线：无 AI 恢复摘要、推理卡片或知识网络，恢复仅依托被试手写工作区笔记。" },
  { id: "summary_only", label: "方式三", description: "纯 AI 恢复摘要基线：中断前后台静默生成 Problem State（无卡片展示与校准预演），中断后仅提供 AI 恢复摘要。" },
] as const;
const exclusionReasons = ["研究者测试", "自动化或非真实被试", "未完成实验", "技术故障", "重复记录", "不符合纳入标准", "被试要求撤回", "其他"];

function formatTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function formatDuration(result: Pick<ResultSummary, "consented_at" | "completed_at">) {
  if (!result.completed_at) return "—";
  const minutes = Math.max(0, Math.round((new Date(result.completed_at).getTime() - new Date(result.consented_at).getTime()) / 60_000));
  return `${minutes} 分钟`;
}

function qualityFlags(result: ResultSummary) {
  const flags: string[] = [];
  const durationSeconds = result.completed_at ? (new Date(result.completed_at).getTime() - new Date(result.consented_at).getTime()) / 1000 : null;
  if (result.researcher_test) flags.push("研究者测试运行");
  if (durationSeconds !== null && durationSeconds < 20 * 60) flags.push("用时短于正式流程下限");
  if (result.status !== "completed") flags.push("未完成");
  if (!result.pre_survey || Object.keys(result.pre_survey).length < surveyItems.length) flags.push("前测缺失");
  if (result.memo_length < 600) flags.push("Memo 较短");
  if (!result.has_recall) flags.push("无回忆数据");
  if (result.condition !== "rmw_no_summary" && !result.has_problem_state) flags.push("无 Problem State");
  if (!result.event_sequence_complete) flags.push("事件序列不完整");
  if (!result.initial_material_presented) flags.push(`缺少 ${result.initial_material_id} 首次呈现`);
  if (result.material_completion_count < result.expected_material_count) flags.push(`第一阶段材料暴露 ${result.material_completion_count}/${result.expected_material_count}`);
  if (!result.interruption_completed) flags.push("中断任务未完成");
  if (result.status === "completed" && result.recovery_new_material_exposed === false) flags.push("恢复后新增材料未达到最低暴露");
  if (result.status === "completed" && !result.recovery_rendered) flags.push("缺少恢复渲染证据");
  if (result.assessment_version === "reasoning-recovery-v2" && !result.recovery_probe_complete) flags.push(`T1/T2/T3 仅 ${result.recovery_probe_count}/3`);
  if (result.assessment_version === "reasoning-recovery-v2" && !result.content_probe_complete) flags.push("事实回忆 A/B 不完整");
  if (result.assessment_version === "reasoning-recovery-v2" && result.recovery_readiness_seconds == null) flags.push("缺少恢复就绪时间");
  if (result.assessment_version === "reasoning-recovery-v2" && result.condition === "rmw_no_summary" && !result.participant_notes_present) flags.push("缺少用户自主笔记");
  if (result.assessment_version === "reasoning-recovery-v2" && !result.post_survey_complete) flags.push("缺少恢复体验问卷");
  return flags;
}

function JsonBlock({ value }: { value: unknown }) {
  return <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/45 p-3 text-[11px] leading-5 text-muted-foreground">{value == null ? "—" : JSON.stringify(value, null, 2)}</pre>;
}

function ScoreBar({ label, value, n }: { label: string; value: number | null; n?: number }) {
  return <div>
    <div className="mb-1 flex justify-between gap-3 text-xs"><span>{label}</span><span className="font-mono text-muted-foreground">{value == null ? "—" : value.toFixed(2)}{n == null ? "" : ` · n=${n}`}</span></div>
    <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${value == null ? 0 : ((value - 1) / 4) * 100}%` }}/></div>
  </div>;
}

function IndividualSurvey({ answers }: { answers: SurveyAnswer | null }) {
  if (!answers) return <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">该被试没有保存前测答案。</p>;
  const scores = subscaleScores(answers);
  const experience = surveyItems.filter((item) => item.group === "AI 使用经验");
  return <div className="space-y-6">
    <section>
      <h3 className="text-sm font-semibold">AI 使用经验</h3>
      <p className="mt-1 text-xs text-muted-foreground">事实型分类题，分别呈现，不合并为总分。</p>
      <div className="mt-3 grid grid-cols-2 gap-3">{experience.map((item) => <article key={item.id} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-2 text-sm font-medium">{answerLabel(item, answers[item.id])}</p></article>)}</div>
    </section>
    <section>
      <h3 className="text-sm font-semibold">量表与研究基线</h3>
      <div className="mt-3 space-y-3 rounded-lg border p-4">{scoredSubscales.map((subscale) => <ScoreBar key={subscale} label={subscale} value={scores[subscale]}/>)}</div>
      <p className="mt-2 text-[11px] leading-5 text-muted-foreground">均为 1–5 分题项均值。AILS-CCS 四维度单列；研究任务自我效能和议题主观先验知识属于研究基线，不并入 AILS 总分。</p>
    </section>
    <section>
      <h3 className="text-sm font-semibold">逐题答案</h3>
      <div className="mt-3 max-h-[520px] overflow-auto rounded-lg border"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-muted"><tr><th className="p-2">维度</th><th className="p-2">题目</th><th className="p-2">答案</th></tr></thead><tbody>{surveyItems.map((item) => <tr key={item.id} className="border-t"><td className="p-2 text-muted-foreground">{item.subscale || item.group}</td><td className="p-2">{item.label}</td><td className="p-2 font-medium">{answerLabel(item, answers[item.id])}</td></tr>)}</tbody></table></div>
    </section>
  </div>;
}

function CohortOverview({ results }: { results: ResultSummary[] }) {
  const analysisReady = results.filter((result) => result.analysis_status === "included" && result.status === "completed" && result.pre_survey);
  const tasks = [...new Set(results.map((result) => result.task_id))];
  const conditions = [...new Set(results.map((result) => result.condition))];
  const aggregates = scoredSubscales.map((subscale) => {
    const values = analysisReady.map((result) => subscaleScores(result.pre_survey)[subscale]).filter((value): value is number => value != null);
    return { subscale, value: mean(values), n: values.length };
  });
  return <section className="mb-6 grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
    <article className="rounded-xl border bg-white p-5"><h2 className="font-semibold">任务 × 条件样本分布</h2><p className="mt-1 text-xs text-muted-foreground">避免把不同任务直接混为同一实验单元</p><div className="mt-4 overflow-x-auto"><table className="w-full text-xs"><thead><tr><th className="p-2 text-left">任务</th>{conditions.map(condition=><th key={condition} className="p-2 text-center">{conditionLabels[condition]||condition}</th>)}</tr></thead><tbody>{tasks.map(taskId=><tr key={taskId} className="border-t"><td className="p-2 font-medium">{researchTaskMetadata(taskId).label}</td>{conditions.map(condition=><td key={condition} className="p-2 text-center font-mono">{results.filter(result=>result.task_id===taskId&&result.condition===condition).length}</td>)}</tr>)}</tbody></table></div></article>
    <article className="rounded-xl border bg-white p-5"><h2 className="font-semibold">前测维度概览</h2><p className="mt-1 text-xs text-muted-foreground">仅统计“纳入分析且已完成”的被试；不同维度不合并</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{aggregates.map(({ subscale, value, n }) => <ScoreBar key={subscale} label={subscale} value={value} n={n}/>)}</div></article>
  </section>;
}

function ConditionDesignLegend() {
  return <section className="mb-6 rounded-xl border bg-white p-5"><h2 className="font-semibold">恢复方式定义</h2><p className="mt-1 text-xs text-muted-foreground">以下机制说明仅在研究者后台显示；参与者入口只显示“方式一、方式二、方式三”。</p><div className="mt-4 grid gap-3 lg:grid-cols-3">{activeConditionDefinitions.map(item=><article key={item.id} className="rounded-lg border p-4"><Badge>{item.label}</Badge><p className="mt-3 text-xs leading-5 text-muted-foreground">{item.description}</p><p className="mt-2 font-mono text-[9px] text-muted-foreground">{item.id}</p></article>)}</div></section>;
}

function formatPercent(value: number | null) {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

function StudyOutcomeOverview({ results }: { results: ResultSummary[] }) {
  const included = results.filter((result) => result.analysis_status === "included");
  const cells = [...new Set(included.map((result) => `${result.task_id}::${result.condition}`))].map(cell=>{const [taskId,condition]=cell.split("::");return {taskId,condition};});
  return <section className="mb-6 rounded-xl border bg-white p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">研究问题导向概览</h2><p className="mt-1 text-xs text-muted-foreground">仅作数据完整性和描述性检查；Memo 字数、对话轮次不代表任务质量。</p></div><Badge variant="outline">纳入样本 n={included.length}</Badge></div>
    <div className="mt-4 overflow-x-auto rounded-lg border"><table className="w-full min-w-[1120px] text-left text-xs"><thead className="bg-muted"><tr><th className="p-3">任务</th><th className="p-3">条件</th><th className="p-3">运行完成</th><th className="p-3">中断完成</th><th className="p-3">2-back 总体正确率</th><th className="p-3">三次恢复测量完整</th><th className="p-3">平均支持就绪时间</th><th className="p-3">旧版城市恢复增益</th><th className="p-3">平均 Memo 字数</th><th className="p-3">平均用户提问轮次</th></tr></thead><tbody>{cells.map(({taskId,condition}) => {
      const rows = included.filter((result) => result.task_id === taskId && result.condition === condition);
      const completed = rows.filter((result) => result.status === "completed").length;
      const interruption = rows.filter((result) => result.interruption_completed).length;
      const letterValues = rows.map((result) => result.letter_accuracy).filter((value): value is number => value != null);
      const recoveryValues = rows.map((result) => result.city_policy_recovery_gain).filter((value): value is number => value != null);
      const recoveryMean = mean(recoveryValues);
      const probeRows = rows.filter((result) => result.assessment_version === "reasoning-recovery-v2");
      const readinessValues = probeRows.map((result) => result.recovery_readiness_seconds).filter((value): value is number => value != null);
      return <tr key={`${taskId}-${condition}`} className="border-t"><td className="p-3 font-medium">{researchTaskMetadata(taskId).label}</td><td className="p-3">{conditionLabels[condition] || condition}<span className="ml-2 text-muted-foreground">n={rows.length}</span></td><td className="p-3"><p>{completed}/{rows.length}</p><div className="mt-1 h-1.5 w-24 rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500" style={{width:`${rows.length ? completed / rows.length * 100 : 0}%`}}/></div></td><td className="p-3">{interruption}/{rows.length}</td><td className="p-3">{formatPercent(mean(letterValues))}</td><td className="p-3">{probeRows.filter((result) => result.recovery_probe_complete).length}/{probeRows.length || "—"}</td><td className="p-3">{readinessValues.length ? `${(mean(readinessValues) || 0).toFixed(1)} 秒` : "—"}<span className="ml-1 text-muted-foreground">{readinessValues.length ? `n=${readinessValues.length}` : ""}</span></td><td className="p-3">{taskId !== "city_policy" || recoveryMean == null ? "—" : `${recoveryMean.toFixed(1)} pp`}<span className="ml-1 text-muted-foreground">{recoveryValues.length ? `n=${recoveryValues.length}` : ""}</span></td><td className="p-3">{Math.round(mean(rows.map((result) => result.memo_length)) || 0)}</td><td className="p-3">{(mean(rows.map((result) => result.user_chat_turn_count)) || 0).toFixed(1)}</td></tr>;
    })}</tbody></table></div>
  </section>;
}

function MetricTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="rounded-lg border p-3"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p><p className="mt-1 text-[10px] text-muted-foreground">{detail}</p></article>;
}

function InterruptionGameCard({ title, metric }: { title: string; metric: InterruptionMetric }) {
  return <article className="rounded-xl border p-4"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">{title}</h3><Badge variant={metric.passed ? "default" : "secondary"}>{metric.passed ? "已通过" : "未通过/无记录"}</Badge></div><div className="mt-4 grid grid-cols-2 gap-3"><MetricTile label="全部作答正确率" value={formatPercent(metric.accuracy)} detail={`${metric.correct}/${metric.responses} 次作答`}/><MetricTile label="尝试次数" value={String(metric.attempts || "—")} detail="按题号重新起始识别"/><MetricTile label="最佳得分" value={metric.bestScore == null ? "—" : `${metric.bestScore}/6`} detail="所有尝试中的最高分"/><MetricTile label="最后一次得分" value={metric.finalScore == null ? "—" : `${metric.finalScore}/6`} detail="通过前最后一次尝试"/></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{width:`${(metric.accuracy || 0) * 100}%`}}/></div></article>;
}

function InterruptionPanel({ events }: { events: ResultEvent[] }) {
  const metrics = interruptionMetrics(events);
  return <div className="space-y-5"><div className="rounded-lg bg-blue-50 p-4 text-xs leading-5 text-blue-900"><p className="font-semibold">问题：被试是否实际经历并完成了认知中断？</p><p className="mt-1">这里呈现所有尝试，而不只呈现最终满分。实验要求满分才能继续，因此“最终分数”存在天花板效应；总体正确率和尝试次数更有诊断价值。</p></div><div className="grid gap-4"><InterruptionGameCard title="字母 2-back" metric={metrics.letter}/><InterruptionGameCard title="颜色识别" metric={metrics.color}/></div><div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">当前没有记录每题反应时，因此不能分析反应速度、速度—正确率权衡或时间压力，只能分析答案正确性与重试。</div></div>;
}

type ProblemStateView = { cards?: Array<{ id?: string; kind?: string; status?: string; priority?: string; confidence?: number; content?: Record<string, string> }>; relations?: unknown[] };

function problemStateView(value: unknown): ProblemStateView | null {
  return value && typeof value === "object" ? value as ProblemStateView : null;
}

const cityStageLabels: Record<CityPolicyProbeStage, string> = { t1: "T1 中断前", t2: "T2 无辅助", t3: "T3 支持后" };
const cityCriterionLabels: Record<string, string> = { cost: "成本", equity: "公平性", implementation: "执行难度", environment: "环境收益", acceptance: "居民接受度" };

function CityPolicyAssessmentPanel({ value }: { value: unknown }) {
  const assessment = value && typeof value === "object" && "version" in value && value.version === "city-policy-recovery-v1" ? value as CityPolicyAssessment : null;
  const metrics = cityPolicyRecoveryMetrics(assessment);
  const stages: CityPolicyProbeStage[] = ["t1", "t2", "t3"];
  if (!assessment) return <section><h3 className="text-sm font-semibold">城市决策恢复测评</h3><p className="mt-3 rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">没有保存任务专属测评。</p></section>;
  return <section className="space-y-4">
    <div><h3 className="text-sm font-semibold">城市决策恢复测评</h3><p className="mt-1 text-[11px] leading-5 text-muted-foreground">以 T1 排序为个人基线；一致性按所有两两排序关系计算。主要指标为 T3 支持后准确度减去 T2 无辅助准确度。</p></div>
    <div className="grid grid-cols-3 gap-3"><MetricTile label="T2 状态准确度" value={metrics ? `${metrics.t2StateAccuracy.toFixed(1)}%` : "—"} detail="方案与标准排序均值"/><MetricTile label="T3 状态准确度" value={metrics?.t3StateAccuracy == null ? "—" : `${metrics.t3StateAccuracy.toFixed(1)}%`} detail="支持后对 T1 的一致性"/><MetricTile label="恢复增益" value={metrics?.recoveryGain == null ? "—" : `${metrics.recoveryGain >= 0 ? "+" : ""}${metrics.recoveryGain.toFixed(1)} pp`} detail="T3 − T2，越高越好"/></div>
    <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-muted"><tr><th className="p-3">测量点</th><th className="p-3">方案排序</th><th className="p-3">标准排序</th><th className="p-3">信心</th><th className="p-3">首选理由 / 最大不确定性</th></tr></thead><tbody>{stages.map((stage) => { const probe = assessment.probes?.[stage]; return <tr key={stage} className="border-t align-top"><td className="p-3 font-medium">{cityStageLabels[stage]}</td><td className="p-3 font-mono">{probe?.optionRanking?.join(" > ") || "—"}</td><td className="p-3">{probe?.criterionRanking?.map((criterion) => cityCriterionLabels[criterion] || criterion).join(" > ") || "—"}</td><td className="p-3">{probe ? `${probe.confidence}/5` : "—"}</td><td className="max-w-sm p-3"><p>{probe?.topChoiceReason || "—"}</p>{probe?.decisionChangingUncertainty && <p className="mt-2 text-amber-700">不确定性：{probe.decisionChangingUncertainty}</p>}</td></tr>; })}</tbody></table></div>
    {metrics && <div className="grid gap-2 sm:grid-cols-2"><div className="rounded-lg border p-3 text-xs"><span className="text-muted-foreground">方案排序一致性</span><p className="mt-1 font-medium">T2 {metrics.t2OptionAgreement.toFixed(1)}% → T3 {metrics.t3OptionAgreement == null ? "—" : `${metrics.t3OptionAgreement.toFixed(1)}%`}</p></div><div className="rounded-lg border p-3 text-xs"><span className="text-muted-foreground">标准排序一致性</span><p className="mt-1 font-medium">T2 {metrics.t2CriterionAgreement.toFixed(1)}% → T3 {metrics.t3CriterionAgreement == null ? "—" : `${metrics.t3CriterionAgreement.toFixed(1)}%`}</p></div></div>}
  </section>;
}

const recoveryStageLabels: Record<RecoveryProbeStage, string> = { t1: "T1 中断前基线", t2: "T2 中断后无辅助", t3: "T3 支持后" };
const reasoningDimensionLabels: Record<(typeof reasoningRecallDimensions)[number], string> = {
  goal: "当前目标",
  position: "推理位置",
  constraint: "关键约束",
  rejectedPath: "已排除路径",
  uncertainty: "未解决问题",
  nextAction: "下一步行动",
};

function RecoveryAssessmentPanel({ value }: { value: unknown }) {
  const assessment = value && typeof value === "object" && "version" in value && value.version === "reasoning-recovery-v2" ? value as RecoveryAssessment : null;
  if (!assessment) return null;
  const stages: RecoveryProbeStage[] = ["t1", "t2", "t3"];
  return <section className="space-y-4">
    <div><h3 className="text-sm font-semibold">跨任务推理恢复测量</h3><p className="mt-1 text-[11px] leading-5 text-muted-foreground">T1 与 T2 使用交叉平衡的事实题 A/B；T1、T2、T3 均记录六个推理维度。原始文本需由不知道实验条件的编码员按预注册 rubric 评分。</p></div>
    <div className="grid gap-3 sm:grid-cols-3"><MetricTile label="测量完整度" value={`${stages.filter((stage) => assessment.probes[stage]).length}/3`} detail="T1、T2、T3"/><MetricTile label="支持就绪时间" value={assessment.readiness ? `${(assessment.readiness.latencyMs / 1000).toFixed(1)} 秒` : "—"} detail="支持呈现到主动继续"/><MetricTile label="事实题顺序" value={assessment.formOrder} detail="T1/T2 交叉平衡"/></div>
    {assessment.postSurvey && <div className="grid gap-3 sm:grid-cols-5"><MetricTile label="思路连续性" value={`${assessment.postSurvey.continuity}/7`} detail="越高越好"/><MetricTile label="脑力负荷" value={`${assessment.postSurvey.mentalDemand}/7`} detail="越低越好"/><MetricTile label="恢复信心" value={`${assessment.postSurvey.confidence}/7`} detail="越高越好"/><MetricTile label="主观能动性" value={`${assessment.postSurvey.agency}/7`} detail="越高越好"/><MetricTile label="信息充分性" value={`${assessment.postSurvey.supportSufficiency}/7`} detail="越高越好"/></div>}
    {assessment.participantNotes && <article className="rounded-lg border p-4"><p className="text-xs font-medium">参与者中断前自主笔记</p><p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-muted-foreground">{assessment.participantNotes}</p></article>}
    <div className="space-y-3">{stages.map((stage) => { const probe = assessment.probes[stage]; return <article key={stage} className="rounded-xl border p-4"><div className="flex items-center justify-between"><h4 className="text-sm font-semibold">{recoveryStageLabels[stage]}</h4><Badge variant="outline">Form {probe?.form || "—"}</Badge></div>{probe ? <><div className="mt-3 grid gap-2 sm:grid-cols-2">{reasoningRecallDimensions.map((dimension) => <div key={dimension} className="rounded-lg bg-muted/35 p-3"><p className="text-[10px] font-medium text-muted-foreground">{reasoningDimensionLabels[dimension]}</p><p className="mt-1 whitespace-pre-wrap text-xs leading-5">{probe.reasoning[dimension]}</p></div>)}</div>{probe.content.length > 0 && <div className="mt-3"><p className="text-[10px] font-medium text-muted-foreground">事实回忆原始回答（{probe.content.length}/6）</p><ol className="mt-2 space-y-2">{probe.content.map((answer, index) => <li key={index} className="rounded-lg bg-blue-50/60 p-3 text-xs leading-5"><span className="mr-2 font-mono text-blue-700">{index + 1}.</span>{answer}</li>)}</ol></div>}</> : <p className="mt-3 text-xs text-muted-foreground">未保存该测量点。</p>}</article>; })}</div>
  </section>;
}

function TaskOutcomePanel({ detail, events }: { detail: ParticipantResult; events: ResultEvent[] }) {
  const milestones = taskMilestones(events, detail.status);
  const completed = milestones.filter((milestone) => milestone.complete).length;
  const recallLabels: Record<string, string> = { currentGoal: "当前研究目标", position: "中断前的推理位置", uncertain: "仍不确定的问题" };
  const problemState = problemStateView(detail.problem_state);
  const cards = Array.isArray(problemState?.cards) ? problemState.cards : [];
  const assessmentVersion = detail.task_assessment && typeof detail.task_assessment === "object" && "version" in detail.task_assessment ? detail.task_assessment.version : null;
  return <div className="space-y-6">
    {assessmentVersion === "reasoning-recovery-v2" && <RecoveryAssessmentPanel value={detail.task_assessment} />}
    {assessmentVersion === "city-policy-recovery-v1" && <CityPolicyAssessmentPanel value={detail.task_assessment} />}
    <section><div className="flex items-end justify-between"><div><h3 className="text-sm font-semibold">任务流程完成证据</h3><p className="mt-1 text-xs text-muted-foreground">判断记录是否覆盖实验流程，不等同于任务质量评分。</p></div><span className="font-mono text-sm">{completed}/{milestones.length}</span></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{milestones.map((milestone) => <div key={milestone.label} className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${milestone.complete ? "border-emerald-200 bg-emerald-50" : "bg-muted/30"}`}>{milestone.complete ? <CheckCircle className="mt-0.5 shrink-0 text-emerald-600"/> : <WarningCircle className="mt-0.5 shrink-0 text-amber-600"/>}<div><p className="font-medium">{milestone.label}</p><p className="mt-1 font-mono text-[9px] text-muted-foreground">{milestone.evidence}</p></div></div>)}</div></section>
    <section><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">最终 Memo</h3><Badge variant="outline">{detail.memo?.trim().length || 0} 字符</Badge></div><div className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/45 p-4 text-xs leading-6">{detail.memo || "尚未保存"}</div><p className="mt-2 text-[11px] text-muted-foreground">字数只用于检查是否形成产出；清晰度、证据质量和实验可行性仍需盲评编码。</p></section>
    <section><h3 className="text-sm font-semibold">无辅助回忆回答</h3><div className="mt-3 space-y-3">{Object.entries(recallLabels).map(([key,label]) => <article key={key} className="rounded-lg border p-3"><p className="text-xs font-medium">{label}</p><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{detail.recall?.[key] || "未作答"}</p></article>)}</div><p className="mt-2 text-[11px] text-muted-foreground">后台仅呈现原始回答；Goal、Hypothesis、Constraint 等 0–2 分编码仍需按预注册 rubric 由独立编码员完成。</p></section>
    <section><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">中断前 Problem State</h3><Badge variant="outline">{cards.length} 张卡 · {problemState?.relations?.length || 0} 条关系</Badge></div>{cards.length ? <div className="mt-3 space-y-2">{cards.map((card,index) => <article key={card.id || index} className="rounded-lg border p-3"><div className="flex flex-wrap gap-2"><Badge variant="secondary">{card.kind || "unknown"}</Badge><Badge variant="outline">{card.status || "unknown"}</Badge>{card.priority === "pinned" && <Badge>pinned</Badge>}<span className="ml-auto text-[10px] text-muted-foreground">confidence {typeof card.confidence === "number" ? card.confidence.toFixed(2) : "—"}</span></div><p className="mt-2 text-xs leading-5">{card.content?.[detail.locale] || card.content?.["zh-CN"] || card.content?.en || "—"}</p></article>)}</div> : <p className="mt-3 rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">该条件没有保存 Problem State，或尚未到达生成阶段。</p>}</section>
  </div>;
}

function ConversationPanel({ chat }: { chat: ParticipantResult["chat"] }) {
  const counts = chatCounts(chat);
  return <div className="space-y-5"><div className="rounded-lg bg-blue-50 p-4 text-xs leading-5 text-blue-900"><p className="font-semibold">问题：参与者如何借助 AI 推进任务？</p><p className="mt-1">轮次与文本用于重构协作过程，不把对话更长直接解释为表现更好。</p></div><div className="grid grid-cols-3 gap-3"><MetricTile label="总轮次" value={String(counts.total)} detail="含初始助手消息"/><MetricTile label="用户轮次" value={String(counts.user)} detail="参与者发送"/><MetricTile label="助手轮次" value={String(counts.assistant)} detail="AI 返回"/></div><div className="space-y-3">{chat?.length ? chat.map((turn,index) => <article key={index} className={`rounded-xl border p-4 ${turn.role === "user" ? "ml-8 border-blue-200 bg-blue-50" : "mr-8 bg-muted/40"}`}><div className="flex justify-between text-[10px] uppercase tracking-wide text-muted-foreground"><span>{turn.role === "user" ? "参与者" : "AI 助手"}</span><span>#{index + 1}</span></div><p className="mt-2 whitespace-pre-wrap text-xs leading-6">{turn.text}</p></article>) : <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">没有保存对话记录。</p>}</div></div>;
}

function EventTimeline({ events }: { events: ResultEvent[] }) {
  return <div><div className="mb-3 flex items-end justify-between"><div><h3 className="text-sm font-semibold">行为时间线</h3><p className="mt-1 text-xs text-muted-foreground">按不可变 sequence number 排序。</p></div><Badge variant="outline">{events.length} 个事件</Badge></div><div className="max-h-[680px] overflow-auto rounded-lg border"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-muted"><tr><th className="p-2">序号</th><th className="p-2">时间</th><th className="p-2">阶段</th><th className="p-2">事件</th><th className="p-2">对象</th></tr></thead><tbody>{events.map((event) => <tr key={event.id} className="border-t align-top"><td className="p-2 font-mono">{event.sequence_number}</td><td className="p-2 whitespace-nowrap text-muted-foreground">{new Date(event.client_timestamp).toLocaleTimeString("zh-CN")}</td><td className="p-2">{event.stage}</td><td className="p-2 font-mono text-[10px]">{event.event_type}</td><td className="p-2 text-muted-foreground">{event.target_id || "—"}</td></tr>)}</tbody></table></div></div>;
}

export function AdminDashboard() {
  const [access, setAccess] = useState<AccessState>("loading");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [storageMode, setStorageMode] = useState("");
  const [results, setResults] = useState<ResultSummary[]>([]);
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<ParticipantResult | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailRequestVersion, setDetailRequestVersion] = useState(0);
  const [events, setEvents] = useState<ResultEvent[]>([]);
  const [tab, setTab] = useState<DetailTab>("overview");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | AnalysisStatus>("all");
  const [reason, setReason] = useState(exclusionReasons[0]);
  const [reviewNote, setReviewNote] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [busy, setBusy] = useState(false);

  const loadResults = useCallback(async () => {
    const response = await fetch("/api/research/results", { cache: "no-store" });
    if (response.status === 401) { setAccess("login"); return; }
    if (response.status === 503) { setAccess("unavailable"); return; }
    if (!response.ok) { setError("无法读取研究结果，请稍后重试。"); setAccess("login"); return; }
    const body = await response.json() as { mode?: string; results?: ResultSummary[] };
    const nextResults = (body.results || []).map((result) => ({ ...result, analysis_status: result.analysis_status || "included" }));
    setStorageMode(body.mode || "");
    setResults(nextResults);
    setAccess("ready");
    setSelected((current) => nextResults.some((result) => result.session_id === current) ? current : nextResults[0]?.session_id || "");
  }, []);

  useEffect(() => { const timeout = window.setTimeout(() => { void loadResults(); }, 0); return () => window.clearTimeout(timeout); }, [loadResults]);
  useEffect(() => {
    if (access !== "ready" || !selected) return;
    const controller = new AbortController();
    void fetch(`/api/research/results?sessionId=${encodeURIComponent(selected)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(body?.error || `HTTP ${response.status}`);
        }
        return await response.json() as { result: ParticipantResult; events: ResultEvent[] };
      })
      .then((body) => { setDetail({ ...body.result, analysis_status: body.result.analysis_status || "included" }); setEvents(body.events); setReviewNote(body.result.review_note || ""); setDeleteConfirmation(""); })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setDetail(null);
        setEvents([]);
        setDetailError(requestError instanceof Error ? requestError.message : "未知错误");
      })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [access, detailRequestVersion, selected]);

  const filteredResults = useMemo(() => results.filter((result) => {
    const matchesFilter = filter === "all" || result.analysis_status === filter;
    const normalized = query.trim().toLowerCase();
    return matchesFilter && (!normalized || `${result.participant_code} ${result.session_id} ${result.condition} ${conditionLabels[result.condition]||""} ${result.task_id} ${researchTaskMetadata(result.task_id).label}`.toLowerCase().includes(normalized));
  }), [filter, query, results]);

  const login = async (event: FormEvent) => { event.preventDefault(); setError(""); const response = await fetch("/api/research/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) }); if (!response.ok) { setError(response.status === 503 ? "研究者后台尚未配置。" : "密码错误。"); return; } setPassword(""); await loadResults(); };
  const logout = async () => { await fetch("/api/research/login", { method: "DELETE" }); setResults([]); setSelected(""); setDetail(null); setDetailError(""); setAccess("login"); };

  const exportResults = async (mode: "analysis" | "1") => {
    const response = await fetch(`/api/research/results?export=${mode}`, { cache: "no-store" });
    if (!response.ok) { setError("导出失败，请稍后重试。"); return; }
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url;
    anchor.download = `rmw-${mode === "analysis" ? "analysis-ready" : "all-raw"}-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url);
  };

  const updateReview = async (analysisStatus: AnalysisStatus) => {
    if (!detail) return;
    setBusy(true); setError("");
    const response = await fetch("/api/research/results", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: detail.session_id, analysisStatus, exclusionReason: analysisStatus === "included" ? null : reason, reviewNote }) });
    setBusy(false);
    if (!response.ok) { setError("样本标记保存失败。"); return; }
    setDetail((current) => current ? { ...current, analysis_status: analysisStatus, exclusion_reason: analysisStatus === "included" ? null : reason, review_note: reviewNote } : current);
    await loadResults();
  };

  const permanentlyDelete = async () => {
    if (!detail || deleteConfirmation !== detail.session_id) return;
    setBusy(true); setError("");
    const response = await fetch("/api/research/results", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: detail.session_id, confirmation: deleteConfirmation }) });
    setBusy(false);
    if (!response.ok) { setError("永久删除失败；请确认样本已在回收站中。"); return; }
    setDetail(null); setSelected(""); await loadResults();
  };

  if (access === "loading") return <div className="grid min-h-screen place-items-center bg-[#f7f6f2] text-sm text-muted-foreground">正在验证研究者身份…</div>;
  if (access === "login" || access === "unavailable") return <div className="grid min-h-screen place-items-center bg-[#f7f6f2] p-8"><form onSubmit={login} className="w-full max-w-md rounded-2xl border bg-white p-8 shadow-[0_18px_60px_rgba(35,40,65,.08)]"><div className="mx-auto grid size-12 place-items-center rounded-xl bg-secondary text-primary"><LockKey size={25}/></div><h1 className="mt-5 text-center text-2xl font-semibold">研究者后台</h1><p className="mt-2 text-center text-sm leading-6 text-muted-foreground">此页面不向被试开放。请输入研究者密码继续。</p>{access === "unavailable" && <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">尚未配置结果存储或研究者认证环境变量。</div>}<label className="mt-6 block text-sm font-medium" htmlFor="researcher-password">研究者密码</label><input id="researcher-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-11 w-full rounded-lg border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/25"/>{error && <p className="mt-3 text-sm text-destructive">{error}</p>}<Button type="submit" className="mt-5 h-11 w-full" disabled={!password}>登录</Button><Link href="/" className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft/>返回实验入口</Link></form></div>;

  const completed = results.filter((result) => result.status === "completed").length;
  const included = results.filter((result) => result.analysis_status === "included").length;
  const excluded = results.filter((result) => result.analysis_status === "excluded").length;
  const trashed = results.filter((result) => result.analysis_status === "trashed").length;
  const selectedSummary = results.find((result) => result.session_id === selected);
  const flags = selectedSummary ? qualityFlags(selectedSummary) : [];
  const tabs: Array<[DetailTab, string]> = [["overview", "概览"], ["survey", "前测"], ["interruption", "中断任务"], ["task", "任务结果"], ["chat", "AI 对话"], ["events", "时间线"], ["raw", "原始 JSON"]];

  return <div className="min-h-screen bg-[#f7f6f2] text-foreground">
    <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b bg-white px-7 py-3"><div className="flex items-center gap-4"><div className="grid size-9 place-items-center rounded-lg bg-primary text-white"><Brain size={20}/></div><div><p className="font-semibold">RMW 研究者后台</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Protected participant results · {storageMode}</p></div></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void loadResults()}>刷新</Button><Button variant="outline" onClick={() => void exportResults("analysis")}><DownloadSimple/>导出分析样本</Button><Button variant="outline" onClick={() => void exportResults("1")}><DownloadSimple/>导出全部原始数据</Button><Button variant="ghost" onClick={logout}><SignOut/>退出</Button></div></header>
    <main className="mx-auto max-w-[1580px] p-7">
      {error && <div className="mb-5 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><WarningCircle/>{error}<button className="ml-auto" onClick={() => setError("")} aria-label="关闭提示">×</button></div>}
      <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5"><article className="rounded-xl border bg-white p-5"><Users className="text-primary"/><p className="mt-3 text-3xl font-semibold">{results.length}</p><p className="mt-1 text-sm text-muted-foreground">已结束记录</p></article><article className="rounded-xl border bg-white p-5"><CheckCircle className="text-emerald-600"/><p className="mt-3 text-3xl font-semibold">{completed}</p><p className="mt-1 text-sm text-muted-foreground">已完成</p></article><article className="rounded-xl border bg-white p-5"><Brain className="text-primary"/><p className="mt-3 text-3xl font-semibold">{included}</p><p className="mt-1 text-sm text-muted-foreground">纳入分析</p></article><article className="rounded-xl border bg-white p-5"><WarningCircle className="text-amber-600"/><p className="mt-3 text-3xl font-semibold">{excluded}</p><p className="mt-1 text-sm text-muted-foreground">排除分析</p></article><article className="rounded-xl border bg-white p-5"><Trash className="text-slate-500"/><p className="mt-3 text-3xl font-semibold">{trashed}</p><p className="mt-1 text-sm text-muted-foreground">回收站</p></article></section>
      <ConditionDesignLegend/>
      <CohortOverview results={results}/>
      <StudyOutcomeOverview results={results}/>
      <div className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
        <section className="overflow-hidden rounded-xl border bg-white"><div className="border-b p-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-semibold">被试结果</h2><p className="mt-1 text-xs text-muted-foreground">质量提示只用于人工复核，不会自动排除样本。</p></div><div className="flex gap-2"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索编号、任务或条件" aria-label="搜索被试" className="h-9 rounded-md border px-3 text-xs outline-none focus:ring-2 focus:ring-primary/20"/><select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} aria-label="分析状态筛选" className="h-9 rounded-md border bg-white px-2 text-xs"><option value="all">全部状态</option><option value="included">纳入分析</option><option value="excluded">排除分析</option><option value="trashed">回收站</option></select></div></div></div>
          {filteredResults.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">没有符合条件的被试结果。</div> : <div className="max-h-[760px] overflow-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 border-b bg-muted text-xs"><tr><th className="p-3">参与者 / 运行</th><th className="p-3">任务 / 条件</th><th className="p-3">完成</th><th className="p-3">分析状态</th><th className="p-3">时长</th><th className="p-3">数据质量</th></tr></thead><tbody>{filteredResults.map((result) => { const rowFlags = qualityFlags(result); return <tr key={result.session_id} onClick={() => { setDetail(null); setDetailLoading(true); setDetailError(""); setSelected(result.session_id); setDetailRequestVersion((current) => current + 1); setTab("overview"); }} className={`cursor-pointer border-b last:border-0 ${selected === result.session_id ? "bg-secondary/55" : "hover:bg-muted/25"}`}><td className="p-3"><p className="font-mono text-xs">{result.participant_code}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground">运行 {result.session_id.slice(0,8)} · {result.locale}</p></td><td className="p-3"><p className="text-xs font-medium">{researchTaskMetadata(result.task_id).label}</p><p className="mt-1 text-[10px] text-muted-foreground">{conditionLabels[result.condition]||result.condition}</p></td><td className="p-3"><Badge variant={result.status === "completed" ? "default" : "secondary"}>{result.status === "completed" ? "已完成" : "进行中"}</Badge></td><td className="p-3"><Badge variant="outline">{statusLabels[result.analysis_status]}</Badge></td><td className="p-3 text-xs">{formatDuration(result)}</td><td className="p-3">{rowFlags.length ? <div className="flex max-w-44 flex-wrap gap-1">{rowFlags.map((flag) => <span key={flag} className="rounded bg-amber-50 px-1.5 py-1 text-[10px] text-amber-800">{flag}</span>)}</div> : <span className="text-xs text-emerald-700">未见明显缺失</span>}</td></tr>; })}</tbody></table></div>}
        </section>
        <aside className="min-h-[720px] rounded-xl border bg-white p-5">{detailLoading ? <div className="grid h-full min-h-96 place-items-center text-sm text-muted-foreground">正在加载详细记录…</div> : detailError ? <div className="grid h-full min-h-96 place-items-center"><div className="max-w-sm text-center"><WarningCircle size={28} className="mx-auto text-amber-600"/><p className="mt-3 text-sm font-medium">无法读取该被试的详细记录</p><p className="mt-2 break-words font-mono text-[11px] text-muted-foreground">{detailError}</p><Button variant="outline" className="mt-4" onClick={() => { setDetailLoading(true); setDetailError(""); setDetailRequestVersion((current) => current + 1); }}>重新加载</Button></div></div> : !detail ? <div className="grid h-full min-h-96 place-items-center text-sm text-muted-foreground">选择一个被试查看详细记录</div> : <div>
          <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-sm font-semibold">{detail.participant_code}</p><p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">运行 ID：{detail.session_id}</p><p className="mt-1 text-xs text-muted-foreground">{researchTaskMetadata(detail.task_id).label} · {conditionLabels[detail.condition]||detail.condition} · {detail.locale} · {events.length} 个事件</p></div><div className="flex flex-col items-end gap-1"><Badge>{detail.status === "completed" ? "已完成" : "进行中"}</Badge><Badge variant="outline">{statusLabels[detail.analysis_status]}</Badge></div></div>
          <nav className="mt-5 flex overflow-x-auto border-b" aria-label="被试详情">{tabs.map(([value, label]) => <button key={value} onClick={() => setTab(value)} className={`shrink-0 border-b-2 px-3 py-2 text-xs ${tab === value ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground"}`}>{label}</button>)}</nav>
          <div className="mt-5">{tab === "overview" && <div className="space-y-5"><section><h3 className="text-sm font-semibold">记录概览</h3><dl className="mt-3 grid grid-cols-2 gap-3 text-xs"><div className="rounded-lg bg-muted/40 p-3"><dt className="text-muted-foreground">开始</dt><dd className="mt-1">{formatTime(detail.consented_at)}</dd></div><div className="rounded-lg bg-muted/40 p-3"><dt className="text-muted-foreground">完成</dt><dd className="mt-1">{formatTime(detail.completed_at)}</dd></div><div className="rounded-lg bg-muted/40 p-3"><dt className="text-muted-foreground">实验时长</dt><dd className="mt-1">{formatDuration(detail)}</dd></div><div className="rounded-lg bg-muted/40 p-3"><dt className="text-muted-foreground">任务</dt><dd className="mt-1">{researchTaskMetadata(detail.task_id).label}</dd></div></dl></section><section><h3 className="text-sm font-semibold">行为证据完整性</h3><dl className="mt-3 grid grid-cols-2 gap-3 text-xs"><div className="rounded-lg border p-3"><dt className="text-muted-foreground">事件序列</dt><dd className="mt-1 font-medium">{selectedSummary?.event_sequence_complete?"从 1 连续":"缺失或不连续"}</dd></div><div className="rounded-lg border p-3"><dt className="text-muted-foreground">首份材料 {selectedSummary?.initial_material_id}</dt><dd className="mt-1 font-medium">{selectedSummary?.initial_material_presented?"已记录":"未记录"}</dd></div><div className="rounded-lg border p-3"><dt className="text-muted-foreground">第一阶段材料最低暴露</dt><dd className="mt-1 font-medium">{selectedSummary?.material_completion_count??0} / {selectedSummary?.expected_material_count??"—"}</dd></div><div className="rounded-lg border p-3"><dt className="text-muted-foreground">恢复后新增材料暴露</dt><dd className="mt-1 font-medium">{selectedSummary?.recovery_new_material_exposed==null?"旧任务不适用":selectedSummary.recovery_new_material_exposed?"已记录":"未记录"}</dd></div><div className="rounded-lg border p-3"><dt className="text-muted-foreground">恢复支持实际渲染</dt><dd className="mt-1 font-medium">{selectedSummary?.recovery_rendered?"已记录":"未记录"}</dd></div><div className="col-span-2 rounded-lg border p-3"><dt className="text-muted-foreground">查看过的恢复页签</dt><dd className="mt-1 font-medium">{selectedSummary?.recovery_tabs.length?selectedSummary.recovery_tabs.join("、"):"无记录"}</dd></div></dl><p className="mt-2 text-[11px] leading-5 text-muted-foreground">“材料完成”表示该材料连续处于激活状态至少 5 秒，是最低暴露证据，不等同于证明被试认真阅读或理解。</p></section><section><h3 className="text-sm font-semibold">质量提示</h3><div className="mt-2 flex flex-wrap gap-2">{flags.length ? flags.map((flag) => <span key={flag} className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">{flag}</span>) : <span className="text-xs text-emerald-700">未见明显缺失</span>}</div></section><section className="rounded-xl border p-4"><h3 className="text-sm font-semibold">人工审核</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">排除不会删除原始数据；请记录可审计的理由。质量提示不会自动改变样本状态。</p><label className="mt-4 block text-xs font-medium" htmlFor="exclusion-reason">排除或移入回收站理由</label><select id="exclusion-reason" value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-xs">{exclusionReasons.map((item) => <option key={item}>{item}</option>)}</select><label className="mt-3 block text-xs font-medium" htmlFor="review-note">审核备注</label><textarea id="review-note" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} rows={3} className="mt-1 w-full rounded-md border p-2 text-xs outline-none focus:ring-2 focus:ring-primary/20" placeholder="可选：记录具体判断依据"/><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={() => void updateReview("included")}>纳入分析</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void updateReview("excluded")}>排除分析</Button><Button size="sm" variant="outline" className="text-destructive" disabled={busy} onClick={() => void updateReview("trashed")}><Trash/>移入回收站</Button></div>{detail.exclusion_reason && <p className="mt-3 text-xs text-muted-foreground">当前理由：{detail.exclusion_reason}</p>}{detail.analysis_status === "trashed" && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3"><p className="text-xs font-semibold text-red-800">永久删除不可恢复，并会删除本次运行的全部事件。</p><label className="mt-2 block text-xs text-red-800" htmlFor="delete-confirmation">输入完整运行 ID 确认：{detail.session_id}</label><input id="delete-confirmation" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-red-200 bg-white px-2 font-mono text-xs"/><Button size="sm" className="mt-2 bg-red-700 hover:bg-red-800" disabled={busy || deleteConfirmation !== detail.session_id} onClick={() => void permanentlyDelete()}>永久删除本次运行</Button></div>}</section></div>}
            {tab === "survey" && <IndividualSurvey answers={detail.pre_survey}/>}
            {tab === "interruption" && <InterruptionPanel events={events}/>}
            {tab === "task" && <TaskOutcomePanel detail={detail} events={events}/>}
            {tab === "chat" && <ConversationPanel chat={detail.chat}/>}
            {tab === "events" && <EventTimeline events={events}/>}
            {tab === "raw" && <div className="space-y-4"><section><h3 className="mb-2 text-sm font-semibold">被试结果</h3><JsonBlock value={detail}/></section><section><h3 className="mb-2 text-sm font-semibold">事件</h3><JsonBlock value={events}/></section><section><h3 className="mb-2 text-sm font-semibold">恢复阶段状态</h3><JsonBlock value={detail.recovery_state}/></section></div>}</div>
        </div>}</aside>
      </div>
    </main>
  </div>;
}
