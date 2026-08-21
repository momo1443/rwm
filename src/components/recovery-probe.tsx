"use client";

import { useState } from "react";
import { Brain, Question } from "@phosphor-icons/react";
import { TimedButton } from "@/components/timed-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { GuidedTourOverlay } from "@/components/guided-tour";
import {
  getContentRecallPrompts,
  reasoningRecallDimensions,
  reasoningRecallPrompts,
  recallFormFor,
  type RecoveryAssessment,
  type RecoveryProbe,
  type RecoveryProbeStage,
} from "@/lib/recovery-assessment";
import type { Locale } from "@/lib/rmw-types";

const recallGuideSteps: Record<Locale, { target: string; title: string; body: string }[]> = {
  "zh-CN": [
    { target: "recall-reasoning", title: "推理位置回忆", body: "六个问题分别对应目标、判断位置、约束、已排除方向、不确定性和你原本准备的最小下一步。请用自己的话写下当时的状态，而不是复述材料原文。" },
    { target: "recall-content", title: "内容事实回忆", body: "这部分只考察材料中出现过的具体事实，与你的推理判断无关。确实不记得时，直接写“不记得”即可，不必猜测。" },
    { target: "recall-submit", title: "提交与等待时间", body: "系统会给一小段最短等待时间，确保作答不是仓促点击。所有题目都需要填写才能提交，可以放心据实作答，这不是考试。" },
  ],
  en: [
    { target: "recall-reasoning", title: "Reasoning-position recall", body: "The six prompts cover your goal, position, constraint, rejected direction, uncertainty, and the minimum next action you intended. Describe your own state in your own words rather than repeating the source text." },
    { target: "recall-content", title: "Content-fact recall", body: "This section only checks specific facts that appeared in the materials, independent of your reasoning. If you genuinely do not remember, write 'do not remember' rather than guessing." },
    { target: "recall-submit", title: "Submitting", body: "A brief minimum wait ensures answers are not submitted too hastily. Every item must be filled in before you can continue — answer honestly; this is not a test." },
  ],
};

const stageCopy: Record<RecoveryProbeStage, Record<Locale, { eyebrow: string; title: string; description: string; action: string }>> = {
  t1: {
    "zh-CN": { eyebrow: "T1 · 中断前基线", title: "记录当前推理位置", description: "请根据刚才形成的判断作答。内容题与推理题分开记录，用于比较中断前后的变化。", action: "保存 T1 并继续" },
    en: { eyebrow: "T1 · Pre-interruption baseline", title: "Record the current reasoning position", description: "Answer from the judgment you just formed. Content and reasoning memory are recorded separately.", action: "Save T1 and continue" },
  },
  t2: {
    "zh-CN": { eyebrow: "T2 · 中断后无辅助", title: "仅凭记忆恢复推理位置", description: "此时尚未显示任何恢复支持。请不要返回材料或工作区，只凭记忆作答。", action: "提交 T2 并查看恢复支持" },
    en: { eyebrow: "T2 · Unsupported recovery", title: "Recover the reasoning position from memory", description: "No recovery support is visible yet. Do not return to the materials or workspace.", action: "Submit T2 and view support" },
  },
  t3: {
    "zh-CN": { eyebrow: "T3 · 支持后恢复", title: "记录恢复支持后的推理位置", description: "请根据刚刚看到的恢复支持，还原中断前的推理位置。新增证据将在提交后开放。", action: "提交 T3 并继续研究" },
    en: { eyebrow: "T3 · Supported recovery", title: "Record the supported reasoning position", description: "Use the assigned recovery support to reconstruct the pre-interruption state. New evidence appears afterward.", action: "Submit T3 and continue" },
  },
};

const emptyReasoning = () => Object.fromEntries(reasoningRecallDimensions.map((dimension) => [dimension, ""])) as RecoveryProbe["reasoning"];

export function RecoveryProbePage({ locale, stage, assessment, onSubmit }: { locale: Locale; stage: RecoveryProbeStage; assessment: RecoveryAssessment; onSubmit: (probe: RecoveryProbe) => void }) {
  const form = recallFormFor(assessment, stage);
  const contentPrompts = stage === "t3" ? [] : getContentRecallPrompts(assessment.taskId, form, locale);
  const [reasoning, setReasoning] = useState<RecoveryProbe["reasoning"]>(emptyReasoning);
  const [content, setContent] = useState(() => contentPrompts.map(() => ""));
  const [guideOpen, setGuideOpen] = useState(false);
  const text = stageCopy[stage][locale];
  const complete = reasoningRecallDimensions.every((dimension) => reasoning[dimension].trim().length >= 2)
    && content.every((answer) => answer.trim().length >= 1);

  return <main className="min-h-screen bg-[#f7f6f2] px-6 py-10">
    <GuidedTourOverlay locale={locale} open={guideOpen} onOpenChange={setGuideOpen} steps={recallGuideSteps[locale]} ariaLabel={locale === "zh-CN" ? "回忆问答浮窗解释" : "Recall guided tour overlay"} badgeLabel={locale === "zh-CN" ? "模块解释" : "Block guide"} />
    <div className="mx-auto max-w-4xl rounded-2xl border bg-white p-7 shadow-[0_18px_60px_rgba(35,40,65,.08)]">
      <div className="flex items-start justify-between gap-4">
        <div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-primary">{text.eyebrow}</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">{text.title}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{text.description}</p></div>
        <div className="flex items-center gap-3">
          <Button onClick={() => setGuideOpen(true)} variant="outline" className="h-9 gap-2 border-primary/30 bg-white font-medium text-primary hover:bg-primary/5"><Question size={16} />{locale === "zh-CN" ? "浮窗解释模式" : "Guided Tour Overlay"}</Button>
          <Brain size={30} className="text-primary" />
        </div>
      </div>
      <section data-tour="recall-reasoning" className="mt-7"><h2 className="text-sm font-semibold">{locale === "zh-CN" ? "A. 推理位置回忆" : "A. Reasoning-position recall"}</h2><p className="mt-1 text-xs text-muted-foreground">{locale === "zh-CN" ? "请写下你自己的任务状态，而不是复述材料原文。" : "Describe your own task state rather than repeating source text."}</p><div className="mt-4 grid gap-4 md:grid-cols-2">{reasoningRecallDimensions.map((dimension, index) => <label key={dimension} className="block rounded-xl border p-4"><span className="text-xs font-medium">{index + 1}. {reasoningRecallPrompts[dimension][locale]}</span><Textarea className="mt-3" rows={3} value={reasoning[dimension]} onChange={(event) => setReasoning((current) => ({ ...current, [dimension]: event.target.value }))} /></label>)}</div></section>
      {contentPrompts.length > 0 && <section data-tour="recall-content" className="mt-8 border-t pt-7"><div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">{locale === "zh-CN" ? "B. 内容事实回忆" : "B. Content-fact recall"}</h2><p className="mt-1 text-xs text-muted-foreground">{locale === "zh-CN" ? "只回答材料中出现过的事实；不知道可以写“不记得”。" : "Answer factual material content only; write 'do not remember' when needed."}</p></div><span className="font-mono text-[10px] text-muted-foreground">Form {form}</span></div><div className="mt-4 grid gap-4 md:grid-cols-2">{contentPrompts.map((prompt, index) => <label key={prompt} className="block rounded-xl border p-4"><span className="text-xs font-medium">{index + 1}. {prompt}</span><Textarea className="mt-3" rows={2} value={content[index]} onChange={(event) => setContent((current) => current.map((answer, answerIndex) => answerIndex === index ? event.target.value : answer))} /></label>)}</div></section>}
      <div data-tour="recall-submit">
        <TimedButton seconds={5} ready={complete} locale={locale} label={text.action} blockedLabel={locale === "zh-CN" ? "请完成全部题目；不记得时可明确填写“不记得”" : "Complete every item; explicitly write 'do not remember' when needed"} className="mt-8 h-12 w-full" onClick={() => onSubmit({ reasoning: Object.fromEntries(reasoningRecallDimensions.map((dimension) => [dimension, reasoning[dimension].trim()])) as RecoveryProbe["reasoning"], content: content.map((answer) => answer.trim()), form, submittedAt: new Date().toISOString() })} />
      </div>
    </div>
  </main>;
}
