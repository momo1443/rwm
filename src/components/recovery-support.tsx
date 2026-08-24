"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Brain, CardsThree, FileText, Graph } from "@phosphor-icons/react";
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import { TimedButton } from "@/components/timed-button";
import { eventLog } from "@/lib/event-log";
import { problemStateToContinuousSummary, toCardRelations, toReasoningCards } from "@/lib/problem-state";
import type { RecoveryReadiness } from "@/lib/recovery-assessment";
import type { ResearchTaskId } from "@/lib/research-task";
import type { Condition, Locale, ProblemStateSnapshot } from "@/lib/rmw-types";

type SupportTab = "summary" | "cards" | "network";

const relationLabels = {
  supports: { "zh-CN": "支持", en: "supports" },
  challenges: { "zh-CN": "质疑", en: "challenges" },
  constrains: { "zh-CN": "约束", en: "constrains" },
  rejects: { "zh-CN": "排除", en: "rejects" },
  leads_to: { "zh-CN": "导向", en: "leads to" },
} as const;

const graphColumnByKind = {
  goal: 0,
  hypothesis: 1,
  evidence: 1,
  constraint: 2,
  path: 2,
  next_action: 3,
} as const;

function KnowledgeNetwork({ cards, relations, locale }: {
  cards: ReturnType<typeof toReasoningCards>;
  relations: ReturnType<typeof toCardRelations>;
  locale: Locale;
}) {
  const graph = useMemo(() => {
    const cardsByColumn = new Map<number, typeof cards>();
    cards.forEach((card) => {
      const column = graphColumnByKind[card.cardType];
      cardsByColumn.set(column, [...(cardsByColumn.get(column) || []), card]);
    });

    const nodes: Node[] = cards.map((card) => {
      const column = graphColumnByKind[card.cardType];
      const columnCards = cardsByColumn.get(column) || [];
      const row = columnCards.findIndex((item) => item.id === card.id);
      return {
        id: card.id,
        position: { x: column * 300, y: row * 170 + Math.max(0, 3 - columnCards.length) * 42 },
        data: { label: card.content[locale] },
        style: {
          width: 230,
          minHeight: 76,
          border: card.goalLevel === "main" ? "2px solid #3157b7" : "1px solid #cbd5e1",
          borderRadius: 14,
          background: card.goalLevel === "main" ? "#eef3ff" : "#ffffff",
          color: "#172033",
          padding: "14px 16px",
          fontSize: 12,
          fontWeight: 600,
          lineHeight: 1.55,
          whiteSpace: "normal",
          textAlign: "left",
          boxShadow: "0 8px 24px rgba(35, 43, 70, .08)",
        },
      };
    });
    const edges: Edge[] = relations.map((relation) => ({
      id: relation.id,
      source: relation.sourceCardId,
      target: relation.targetCardId,
      type: "smoothstep",
      label: relationLabels[relation.relationType][locale],
      markerEnd: { type: MarkerType.ArrowClosed, color: "#5670b5" },
      style: { stroke: "#5670b5", strokeWidth: 1.6 },
      labelStyle: { fill: "#40507a", fontSize: 10, fontWeight: 600 },
      labelBgStyle: { fill: "#f7f9ff", fillOpacity: 0.95 },
    }));
    return { nodes, edges };
  }, [cards, locale, relations]);

  if (!cards.length) return <p className="rounded-xl border bg-muted/30 p-5 text-sm text-muted-foreground">{locale === "zh-CN" ? "当前 trace 中没有可展示的推理节点。" : "No reasoning nodes are available in this trace."}</p>;

  return <div className="mx-auto max-w-5xl">
    <div className="h-[520px] overflow-hidden rounded-xl border bg-slate-50/65" role="img" aria-label={locale === "zh-CN" ? "推理节点与关系连线组成的知识网络图" : "Knowledge network of reasoning nodes and relationships"}>
      <ReactFlow nodes={graph.nodes} edges={graph.edges} fitView fitViewOptions={{ padding: 0.18 }} minZoom={0.35} maxZoom={1.5} nodesConnectable={false} elementsSelectable={false}>
        <Background color="#dbe3f2" gap={22} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
    {!relations.length && <p className="mt-3 text-xs text-muted-foreground">{locale === "zh-CN" ? "已展示推理节点；本次 trace 中没有可可靠绘制的关系连线。" : "Reasoning nodes are shown, but this trace has no reliable relationship edges."}</p>}
  </div>;
}

export function RecoverySupportPage({
  locale,
  condition,
  taskId,
  problemState,
  participantMemo,
  testMode,
  onContinue,
}: {
  locale: Locale;
  condition: Condition;
  taskId: ResearchTaskId;
  problemState: ProblemStateSnapshot | null;
  participantMemo: string;
  testMode: boolean;
  onContinue: (readiness: RecoveryReadiness) => void;
}) {
  const cards = useMemo(() => problemState ? toReasoningCards(problemState, locale) : [], [locale, problemState]);
  const relations = useMemo(() => problemState ? toCardRelations(problemState) : [], [problemState]);
  const summary = useMemo(() => problemStateToContinuousSummary(problemState?.cards || [], locale), [locale, problemState]);
  const [activeTab, setActiveTab] = useState<SupportTab>("summary");
  const [renderedAt] = useState(() => ({ iso: new Date().toISOString(), milliseconds: Date.now() }));
  const renderedRef = useRef(false);
  const viewedRef = useRef(new Set<string>([condition === "rmw_no_summary" ? "memo" : "summary"]));

  useEffect(() => {
    if (renderedRef.current) return;
    renderedRef.current = true;
    eventLog("recovery_support_rendered", {
      condition,
      taskId,
      cardCount: cards.length,
      relationCount: relations.length,
      hasSummary: Boolean(summary.trim()),
      hasParticipantMemo: Boolean(participantMemo.trim()),
    }, { stage: "recovery_assessment", targetType: "recovery_support", targetId: condition });
  }, [cards.length, condition, participantMemo, relations.length, summary, taskId]);

  const viewTab = (tab: SupportTab) => {
    setActiveTab(tab);
    if (viewedRef.current.has(tab)) return;
    viewedRef.current.add(tab);
    eventLog("recovery_tab_viewed", { tab, condition }, { stage: "recovery_assessment", targetType: "recovery_tab", targetId: tab });
  };

  const supportAvailable = condition === "rmw_no_summary"
    ? Boolean(participantMemo.trim())
    : condition === "summary_only"
      ? Boolean(summary.trim())
      : cards.length > 0 && Boolean(summary.trim());

  return <main className="flex min-h-screen flex-col bg-[#f7f6f2] p-6">
    <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-hidden rounded-2xl border bg-white shadow-[0_18px_60px_rgba(35,40,65,.08)]">
      <header className="flex items-start justify-between gap-4 border-b px-6 py-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.16em] text-primary">{locale === "zh-CN" ? "恢复阶段 · D6 尚未开放" : "Recovery stage · D6 remains hidden"}</p>
          <h1 className="mt-2 text-xl font-semibold">{locale === "zh-CN" ? "请恢复中断前的推理位置" : "Recover the pre-interruption reasoning position"}</h1>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{locale === "zh-CN" ? "请查看系统提供的信息。当你认为已经恢复到可以继续推理的程度时进入 T3；此页面不会展示新增证据。" : "Review the information provided. Continue to T3 when you feel ready to resume reasoning; no new evidence is shown here."}</p>
        </div>
        <Brain size={30} className="shrink-0 text-primary" />
      </header>

      {condition === "rmw_no_summary" ? <section className="m-6 min-h-0 flex-1 overflow-auto rounded-xl border bg-amber-50/45 p-6">
        <div className="flex items-center gap-2 text-amber-900"><FileText size={20}/><p className="text-xs font-semibold uppercase tracking-wider">{locale === "zh-CN" ? "你在中断前写下的分析/决策 memo" : "Your pre-interruption analysis/decision memo"}</p></div>
        <p className="mt-5 whitespace-pre-wrap text-sm leading-7">{participantMemo || (locale === "zh-CN" ? "本次运行没有保存可用的 memo。" : "No memo was saved for this run.")}</p>
      </section> : condition === "summary_only" ? <section className="m-6 min-h-0 flex-1 overflow-auto rounded-xl border bg-muted/45 p-6">
        <div className="flex items-center gap-2"><FileText size={20} className="text-primary"/><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">AI Summary</p></div>
        <p className="mt-5 whitespace-pre-wrap text-sm leading-8">{summary || (locale === "zh-CN" ? "本次运行没有生成可用的 AI 摘要。" : "No AI summary was generated for this run.")}</p>
      </section> : <section className="flex min-h-0 flex-1 flex-col">
        <nav className="flex gap-2 border-b px-6 py-3" aria-label={locale === "zh-CN" ? "恢复信息类型" : "Recovery information type"}>
          {([
            { id: "summary", icon: FileText, zh: "恢复摘要", en: "Resume brief" },
            { id: "cards", icon: CardsThree, zh: "推理卡片", en: "Reasoning cards" },
            { id: "network", icon: Graph, zh: "知识网络", en: "Knowledge network" },
          ] as const).map((item) => <button key={item.id} type="button" onClick={() => viewTab(item.id)} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${activeTab === item.id ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-muted"}`}><item.icon size={16}/>{locale === "zh-CN" ? item.zh : item.en}</button>)}
        </nav>
        <div className="min-h-0 flex-1 overflow-auto p-6">
          {activeTab === "summary" && <p className="mx-auto max-w-3xl whitespace-pre-wrap text-sm leading-8">{summary || (locale === "zh-CN" ? "没有可用的恢复摘要。" : "No recovery summary is available.")}</p>}
          {activeTab === "cards" && <div className="mx-auto grid max-w-4xl gap-3 md:grid-cols-2">{cards.map((card) => <article key={card.id} className="rounded-xl border p-4"><div className="flex items-center justify-between gap-2"><Badge variant="outline" className="text-[9px]">{card.goalLevel || card.cardType}</Badge><span className="text-[10px] text-muted-foreground">{card.confidence ?? 0}%</span></div><h2 className="mt-3 text-sm font-semibold leading-6">{card.content[locale]}</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">{card.detail[locale]}</p><p className="mt-3 text-[10px] text-primary">{card.sourceRefs.map((source) => source.label).join(" · ")}</p></article>)}</div>}
          {activeTab === "network" && <KnowledgeNetwork cards={cards} relations={relations} locale={locale} />}
        </div>
      </section>}

      <footer className="shrink-0 border-t px-6 py-4">
        <TimedButton seconds={testMode ? 1 : 5} ready={supportAvailable} locale={locale} label={locale === "zh-CN" ? "我已恢复，进入 T3" : "I am ready — continue to T3"} blockedLabel={locale === "zh-CN" ? "本次运行缺少对应的恢复信息" : "Recovery information is missing for this run"} className="h-11 w-full" onClick={() => {
          const readyAt = new Date().toISOString();
          const readiness = { supportRenderedAt: renderedAt.iso, readyAt, latencyMs: Date.now() - renderedAt.milliseconds, viewedSections: [...viewedRef.current] };
          eventLog("recovery_ready", { condition, taskId, latencyMs: readiness.latencyMs, viewedSections: readiness.viewedSections }, { stage: "recovery_assessment", targetType: "recovery_support", targetId: condition });
          onContinue(readiness);
        }}/>
      </footer>
    </div>
  </main>;
}
