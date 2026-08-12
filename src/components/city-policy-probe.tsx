"use client";

import { ArrowCounterClockwise, CheckCircle, Ranking } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TimedButton } from "@/components/timed-button";
import {
  cityPolicyCriteria,
  cityPolicyOptions,
  type CityPolicyCriterion,
  type CityPolicyOption,
  type CityPolicyProbe,
  type CityPolicyProbeStage,
} from "@/lib/city-policy-assessment";
import type { Locale } from "@/lib/rmw-types";

const optionLabels: Record<CityPolicyOption, Record<Locale, string>> = {
  A: { "zh-CN": "A · 社区增员督导", en: "A · Community staffing" },
  B: { "zh-CN": "B · 智能投放与按量激励", en: "B · Smart collection and incentives" },
  C: { "zh-CN": "C · 集中式机械分选", en: "C · Centralized mechanical sorting" },
};

const criterionLabels: Record<CityPolicyCriterion, Record<Locale, string>> = {
  cost: { "zh-CN": "成本", en: "Cost" },
  equity: { "zh-CN": "公平性", en: "Equity" },
  implementation: { "zh-CN": "执行难度", en: "Implementation" },
  environment: { "zh-CN": "环境收益", en: "Environmental benefit" },
  acceptance: { "zh-CN": "居民接受度", en: "Resident acceptance" },
};

function RankingBuilder<T extends string>({
  items,
  ranking,
  setRanking,
  label,
  itemLabel,
  locale,
}: {
  items: readonly T[];
  ranking: T[];
  setRanking: (ranking: T[]) => void;
  label: string;
  itemLabel: (item: T) => string;
  locale: Locale;
}) {
  const remaining = items.filter((item) => !ranking.includes(item));
  return <section className="rounded-xl border bg-white p-4">
    <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">{label}</h2><Button type="button" size="sm" variant="ghost" disabled={!ranking.length} onClick={() => setRanking([])}><ArrowCounterClockwise />{locale === "zh-CN" ? "重排" : "Reset"}</Button></div>
    <p className="mt-1 text-xs leading-5 text-muted-foreground">{locale === "zh-CN" ? "依次点击，从第 1 位排到最后一位。" : "Click in order, from first to last."}</p>
    <ol className="mt-3 grid gap-2 sm:grid-cols-2">
      {ranking.map((item, index) => <li key={item} className="flex items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 text-xs"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary font-semibold text-white">{index + 1}</span><span className="font-medium">{itemLabel(item)}</span><button type="button" className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => setRanking(ranking.filter((saved) => saved !== item))}>{locale === "zh-CN" ? "移除" : "Remove"}</button></li>)}
    </ol>
    {remaining.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{remaining.map((item) => <Button type="button" key={item} variant="outline" size="sm" onClick={() => setRanking([...ranking, item])}><Ranking />{itemLabel(item)}</Button>)}</div>}
    {remaining.length === 0 && <p className="mt-3 flex items-center gap-2 text-xs text-emerald-700"><CheckCircle weight="fill" />{locale === "zh-CN" ? "排序已完成" : "Ranking complete"}</p>}
  </section>;
}

const stageCopy: Record<CityPolicyProbeStage, Record<Locale, { eyebrow: string; title: string; description: string; action: string }>> = {
  t1: {
    "zh-CN": { eyebrow: "T1 · 中断前基线", title: "记录当前决策位置", description: "请根据你刚才形成的判断作答。该记录用于比较中断前后的决策状态。", action: "保存 T1 并继续" },
    en: { eyebrow: "T1 · Pre-interruption baseline", title: "Record your current decision state", description: "Answer using the judgment you just formed. This establishes the pre-interruption decision state.", action: "Save T1 and continue" },
  },
  t2: {
    "zh-CN": { eyebrow: "T2 · 中断后无辅助恢复", title: "仅凭记忆恢复决策位置", description: "请不要查看材料或恢复支持，仅根据记忆还原中断前的排序与判断。", action: "提交 T2 并查看恢复支持" },
    en: { eyebrow: "T2 · Unsupported recovery", title: "Recover the decision state from memory", description: "Do not consult materials or recovery support. Reconstruct the pre-interruption ranking from memory.", action: "Submit T2 and view support" },
  },
  t3: {
    "zh-CN": { eyebrow: "T3 · 支持后恢复", title: "记录恢复支持后的决策位置", description: "请根据刚刚看到的恢复支持，还原中断前的排序。新增证据将在提交后开放。", action: "提交 T3 并继续研究" },
    en: { eyebrow: "T3 · Supported recovery", title: "Record the recovered decision state", description: "Use the recovery support you just viewed to reconstruct the pre-interruption ranking. New evidence appears after submission.", action: "Submit T3 and continue" },
  },
};

export function CityPolicyProbePage({ locale, stage, onSubmit }: { locale: Locale; stage: CityPolicyProbeStage; onSubmit: (probe: CityPolicyProbe) => void }) {
  const [optionRanking, setOptionRanking] = useState<CityPolicyOption[]>([]);
  const [criterionRanking, setCriterionRanking] = useState<CityPolicyCriterion[]>([]);
  const [topChoiceReason, setTopChoiceReason] = useState("");
  const [decisionChangingUncertainty, setDecisionChangingUncertainty] = useState("");
  const [confidence, setConfidence] = useState(3);
  const text = stageCopy[stage][locale];
  const complete = optionRanking.length === cityPolicyOptions.length
    && criterionRanking.length === cityPolicyCriteria.length
    && topChoiceReason.trim().length >= 10
    && decisionChangingUncertainty.trim().length >= 5;

  return <main className="min-h-screen bg-[#f7f6f2] px-6 py-10">
    <div className="mx-auto max-w-3xl">
      <div className="rounded-2xl border bg-white p-7 shadow-[0_18px_60px_rgba(35,40,65,.08)]">
        <p className="font-mono text-[10px] uppercase tracking-[.16em] text-primary">{text.eyebrow}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{text.title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{text.description}</p>
        <div className="mt-6 space-y-4">
          <RankingBuilder items={cityPolicyOptions} ranking={optionRanking} setRanking={setOptionRanking} label={locale === "zh-CN" ? "方案优先级" : "Option priority"} itemLabel={(item) => optionLabels[item][locale]} locale={locale} />
          <RankingBuilder items={cityPolicyCriteria} ranking={criterionRanking} setRanking={setCriterionRanking} label={locale === "zh-CN" ? "决策标准重要性" : "Decision-criterion importance"} itemLabel={(item) => criterionLabels[item][locale]} locale={locale} />
          <label className="block rounded-xl border bg-white p-4"><span className="text-sm font-semibold">{locale === "zh-CN" ? "当前首选的关键理由" : "Key reason for your current preference"}</span><Textarea className="mt-3" rows={3} value={topChoiceReason} onChange={(event) => setTopChoiceReason(event.target.value)} placeholder={locale === "zh-CN" ? "请说明最关键的一至两个理由……" : "State the one or two most important reasons…"} /></label>
          <label className="block rounded-xl border bg-white p-4"><span className="text-sm font-semibold">{locale === "zh-CN" ? "最可能改变选择的不确定因素" : "Uncertainty most likely to change your choice"}</span><Textarea className="mt-3" rows={2} value={decisionChangingUncertainty} onChange={(event) => setDecisionChangingUncertainty(event.target.value)} placeholder="…" /></label>
          <label className="block rounded-xl border bg-white p-4"><span className="flex items-center justify-between text-sm font-semibold"><span>{locale === "zh-CN" ? "对当前排序的信心" : "Confidence in this ranking"}</span><span className="font-mono text-primary">{confidence}/5</span></span><input className="mt-4 w-full accent-[var(--primary)]" type="range" min={1} max={5} step={1} value={confidence} onChange={(event) => setConfidence(Number(event.target.value))} /></label>
        </div>
        <TimedButton seconds={5} ready={complete} locale={locale} label={text.action} blockedLabel={locale === "zh-CN" ? "请完成两项排序和两个简短回答" : "Complete both rankings and short responses"} className="mt-6 h-12 w-full" onClick={() => onSubmit({ optionRanking, criterionRanking, topChoiceReason: topChoiceReason.trim(), decisionChangingUncertainty: decisionChangingUncertainty.trim(), confidence, submittedAt: new Date().toISOString() })} />
      </div>
    </div>
  </main>;
}
