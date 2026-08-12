"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Brain,
  Check,
  CheckCircle,
  Clock,
  Graph,
  LinkSimple,
  NotePencil,
  PauseCircle,
  PushPin,
  Question,
  Target,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { eventLog, readProblemStateActions } from "@/lib/event-log";
import type { ResearchTaskId } from "@/lib/research-task";
import type {
  EpistemicStatus,
  Locale,
  ProblemStateCard,
  ProblemStateRelation,
  ProblemStateSnapshot,
} from "@/lib/rmw-types";

type ExtractedCard = Omit<ProblemStateCard, "content" | "detail" | "source" | "why"> & {
  content: string;
  detail: string;
  source: string;
  why: string;
};

const labels = {
  "zh-CN": {
    title: "保存窗口",
    subtitle: "系统会结合你实际写下的 memo、人机对话与研究操作轨迹提取候选 Problem State。操作轨迹只用于判断研究进度，不代表你认同某项结论。",
    task: "主任务",
    save: "保存窗口",
    break: "中断任务",
    resume: "恢复",
    main: "主目标",
    active: "活跃子目标",
    suspended: "挂起目标",
    rejected: "已排除路径",
    candidates: "候选 Problem State",
    network: "知识网络",
    source: "来源",
    confidence: "置信度",
    accept: "接受",
    edit: "编辑",
    pin: "置顶",
    uncertain: "存疑",
    expire: "过期",
    calibrateHint: "点选卡片后可接受、编辑、置顶、标为存疑或过期。绿色=活跃，黄色=存疑，灰色=已过期。",
    saveAndBreak: "保存并进入中断任务",
    waiting: "保存按钮将在 1 分钟后开放",
    early: "请完成 1 分钟的查看时间，倒计时结束后才可进入中断任务。",
    guideTitle: "保存窗口说明",
    guideDescription: "只有 DeepSeek 成功分析参与者内容与研究轨迹后，才会显示 Problem State；校准后的结果会用于中断后的恢复支持。",
    interruption: "中断任务",
    letterGame: "字母 2-back 游戏",
    letterHint: "判断当前字母是否与前两个字母相同。",
    colorGame: "颜色识别游戏",
    colorHint: "请选择文字实际显示的颜色，不要选择文字含义。",
    same: "相同",
    different: "不同",
    trial: "题目",
    retry: "未达到满分，请重新开始",
    nextGame: "进入颜色游戏",
    finish: "进入无辅助回忆",
    fullScore: "两个游戏都必须满分才能继续",
  },
  en: {
    title: "Save window",
    subtitle: "The system combines your memo, human-AI conversation, and research-action trace to extract candidate problem state. Actions indicate progress, not endorsement of a conclusion.",
    task: "Primary task",
    save: "Save window",
    break: "Interruption",
    resume: "Resume",
    main: "Main goal",
    active: "Active subgoals",
    suspended: "Suspended goals",
    rejected: "Rejected path",
    candidates: "Candidate problem state",
    network: "Knowledge network",
    source: "Source",
    confidence: "Confidence",
    accept: "Accept",
    edit: "Edit",
    pin: "Pin",
    uncertain: "Uncertain",
    expire: "Expire",
    calibrateHint: "Select a card to accept, edit, pin, mark uncertain, or expire. Green = active, amber = uncertain, gray = expired.",
    saveAndBreak: "Save and begin interruption",
    waiting: "Save opens after one minute",
    early: "Please use the full one-minute review period. The interruption opens when the countdown ends.",
    guideTitle: "Save-window guide",
    guideDescription: "Problem state appears only after DeepSeek analyzes participant-authored content and research actions. The calibrated result is used for post-interruption recovery.",
    interruption: "Interruption",
    letterGame: "Letter 2-back game",
    letterHint: "Decide whether the current letter matches the letter two positions back.",
    colorGame: "Color identification game",
    colorHint: "Choose the color the word is displayed in, not the meaning of the word.",
    same: "Same",
    different: "Different",
    trial: "Item",
    retry: "Full score required — restart",
    nextGame: "Continue to color game",
    finish: "Begin unsupported recall",
    fullScore: "Both games require a perfect score",
  },
};

export function ExperimentTimeline({ locale, active, compact=false }: { locale: Locale; active: "task" | "save" | "break" | "resume"; compact?: boolean }) {
  const t = labels[locale];
  const steps = [
    { id: "task", label: t.task },
    { id: "save", label: t.save },
    { id: "break", label: t.break },
    { id: "resume", label: t.resume },
  ];
  const activeIndex = steps.findIndex((step) => step.id === active);
  return <div className={`grid grid-cols-4 bg-white ${compact?"h-[52px] border-b px-5 py-1.5":"rounded-xl border p-2 shadow-sm"}`}>
    {steps.map((step, index) => <div key={step.id} className="relative flex items-center gap-3 px-4 py-2">
      {index > 0 && <div className="absolute -left-2 top-1/2 h-px w-4 bg-border" />}
      <span className={`grid size-7 place-items-center rounded-full text-xs font-semibold ${index <= activeIndex ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
        {index < activeIndex ? <Check size={14} /> : index + 1}
      </span>
      <span className={`text-xs font-medium ${step.id === active ? "text-primary" : "text-muted-foreground"}`}>{step.label}</span>
    </div>)}
  </div>;
}

function useCheckpointCountdown(fastMode: boolean) {
  const duration = fastMode ? 0 : 60;
  const [remaining, setRemaining] = useState(duration);
  useEffect(() => {
    const storageKey = "rmw-timer-checkpoint";
    const stored = Number(sessionStorage.getItem(storageKey));
    const endAt = Number.isFinite(stored) && stored > Date.now() ? stored : Date.now() + duration * 1000;
    sessionStorage.setItem(storageKey, String(endAt));
    const update = () => setRemaining(Math.max(0, Math.ceil((endAt - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [duration]);
  return remaining;
}

function formatClock(totalSeconds: number) {
  return `00:${String(totalSeconds).padStart(2, "0")}`;
}

function StateTile({
  card,
  locale,
  selected,
  onSelect,
}: {
  card: ProblemStateCard;
  locale: Locale;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const style = card.status === "uncertain"
    ? "border-amber-200 bg-amber-50/70"
    : card.status === "expired"
      ? "border-slate-200 bg-slate-50 text-slate-500"
      : "border-emerald-200 bg-emerald-50/60";
  return <button
    type="button"
    onClick={onSelect}
    className={`w-full rounded-xl border p-3 text-left transition ${style} ${selected ? "ring-2 ring-primary/30 shadow-sm" : "hover:shadow-sm"} ${onSelect ? "cursor-pointer" : ""}`}
  >
    <div className="flex items-center justify-between">
      <span className="text-[9px] font-semibold uppercase tracking-wider">{card.goalLevel || card.kind}</span>
      <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
        {card.priority === "pinned" && <PushPin size={11} weight="fill" className="text-primary" />}
        {card.confidence}%
      </span>
    </div>
    <p className="mt-2 text-xs font-semibold leading-5 text-foreground">{card.content[locale]}</p>
    <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{card.source[locale]}</p>
  </button>;
}

function CheckpointInspector({
  card,
  locale,
  t,
  updateStatus,
  togglePin,
  updateContent,
}: {
  card: ProblemStateCard;
  locale: Locale;
  t: (typeof labels)[Locale];
  updateStatus: (id: string, status: EpistemicStatus) => void;
  togglePin: (id: string) => void;
  updateContent: (id: string, value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.content[locale]);
  return <aside className="flex h-full min-h-0 flex-col rounded-xl border bg-[#fcfcfd] p-4">
    <div className="flex items-start justify-between gap-2">
      <div>
        <Badge variant="outline" className="text-[9px]">{card.goalLevel || card.kind}</Badge>
        <h3 className="mt-3 text-sm font-semibold leading-5">{card.content[locale]}</h3>
      </div>
      {card.priority === "pinned" && <PushPin size={16} weight="fill" className="shrink-0 text-primary" />}
    </div>
    {editing ? <div className="mt-4">
      <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} className="min-h-24 text-xs leading-5" />
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={() => { updateContent(card.id, draft); setEditing(false); }}><Check />{t.accept}</Button>
        <Button size="sm" variant="ghost" onClick={() => { setDraft(card.content[locale]); setEditing(false); }}>{locale === "zh-CN" ? "取消" : "Cancel"}</Button>
      </div>
    </div> : <p className="mt-3 text-xs leading-5 text-muted-foreground">{card.detail[locale]}</p>}
    <div className="mt-4 rounded-lg border bg-white p-3">
      <div className="flex gap-2">
        <LinkSimple size={14} className="mt-0.5 shrink-0 text-primary" />
        <div>
          <p className="text-[10px] font-semibold">{t.source}</p>
          <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{card.source[locale] || "—"}</p>
        </div>
      </div>
      {card.why[locale] && <p className="mt-3 text-[10px] leading-4 text-muted-foreground">{card.why[locale]}</p>}
    </div>
    <div className="mt-4">
      <div className="mb-1 flex justify-between text-[10px]"><span>{t.confidence}</span><span>{card.confidence}%</span></div>
      <Progress value={card.confidence} className="h-1.5" />
    </div>
    <div className="mt-5 grid grid-cols-2 gap-2">
      <Button size="sm" variant={card.status === "active" ? "secondary" : "outline"} onClick={() => updateStatus(card.id, "active")}><CheckCircle />{t.accept}</Button>
      <Button size="sm" variant="outline" onClick={() => setEditing(true)}><NotePencil />{t.edit}</Button>
      <Button size="sm" variant={card.priority === "pinned" ? "secondary" : "outline"} onClick={() => togglePin(card.id)}><PushPin />{t.pin}</Button>
      <Button size="sm" variant={card.status === "uncertain" ? "secondary" : "outline"} onClick={() => updateStatus(card.id, "uncertain")}><WarningCircle />{t.uncertain}</Button>
      <Button size="sm" variant={card.status === "expired" ? "secondary" : "ghost"} className="col-span-2" onClick={() => updateStatus(card.id, "expired")}><PauseCircle />{t.expire}</Button>
    </div>
    <p className="mt-4 text-[9px] leading-4 text-muted-foreground">{t.calibrateHint}</p>
  </aside>;
}

type FlowData = { label: string; status: EpistemicStatus; selected: boolean };
function FlowNode({ data }: { data: FlowData }) {
  const tone = data.status === "uncertain"
    ? "border-amber-400 bg-amber-50"
    : data.status === "expired"
      ? "border-slate-300 bg-slate-50"
      : "border-emerald-400 bg-emerald-50";
  return <div className={`w-[146px] rounded-xl border-2 px-3 py-2 text-center text-[10px] font-medium leading-4 shadow-sm ${tone} ${data.selected ? "ring-4 ring-indigo-100" : ""}`}>
    <Handle type="target" position={Position.Left} />
    {data.label}
    <Handle type="source" position={Position.Right} />
  </div>;
}
const nodeTypes = { reasoning: FlowNode };

function CheckpointNetwork({
  cards,
  relations,
  locale,
  selected,
  onSelect,
}: {
  cards: ProblemStateCard[];
  relations: ProblemStateRelation[];
  locale: Locale;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const positions = useMemo(() => {
    const result: Record<string, { x: number; y: number }> = {};
    const groups = [
      cards.filter((card) => card.goalLevel === "main"),
      cards.filter((card) => card.goalLevel === "subgoal"),
      cards.filter((card) => card.goalLevel === "suspended"),
      cards.filter((card) => !card.goalLevel),
    ];
    groups.forEach((group, row) => group.forEach((card, column) => {
      result[card.id] = { x: 60 + column * 190, y: 20 + row * 105 };
    }));
    return result;
  }, [cards]);
  const nodes = useMemo<Node<FlowData>[]>(() => cards.map((card) => ({
    id: card.id,
    type: "reasoning",
    position: positions[card.id] || { x: 0, y: 0 },
    data: { label: card.content[locale], status: card.status, selected: card.id === selected },
  })), [cards, locale, positions, selected]);
  const edges = useMemo<Edge[]>(() => relations.map((relation) => ({
    id: relation.id,
    source: relation.sourceCardId,
    target: relation.targetCardId,
    label: relation.relationType,
    animated: relation.relationType === "leads_to",
    style: { stroke: relation.relationType === "challenges" ? "#c58a2c" : "#8992a6" },
    labelStyle: { fontSize: 9, fill: "#687083" },
  })), [relations]);
  return <div className="h-[360px] overflow-hidden rounded-2xl border bg-white">
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      minZoom={0.45}
      maxZoom={1.5}
      onNodeClick={(_, node) => {
        onSelect(node.id);
        eventLog("checkpoint_network_node_clicked", { id: node.id }, { stage: "checkpoint", targetType: "reasoning_card", targetId: node.id });
      }}
    >
      <Background gap={22} size={1} color="#e7e9ef" />
      <Controls position="bottom-right" showInteractive={false} />
    </ReactFlow>
  </div>;
}

function CheckpointGuide({ locale, open, onOpenChange }: { locale: Locale; open: boolean; onOpenChange: (open: boolean) => void }) {
  const allSteps = useMemo(() => locale === "zh-CN" ? [
    { target: "checkpoint-timeline", title: "保存阶段时间轴", body: "这里展示实验流程。您当前处于第 2 阶段「保存窗口 (Save Window)」，系统正结合第一阶段的记录归纳 Problem State。" },
    { target: "checkpoint-goals", title: "目标结构分布", body: "此处按层级汇总主目标、活跃子目标、挂起分支与弃用路径。它们构成了研究推理的核心主干。" },
    { target: "checkpoint-state", title: "候选 Problem State 列表", body: "由 DeepSeek 提取的推理卡片。每张卡片对应一个推理要点，左侧边框颜色代表其认知状态（Active / Uncertain / Expired）。" },
    { target: "checkpoint-inspector", title: "卡片校准检视器", body: "在此检视选中的卡片。您可以切换状态、置顶关键要点、编辑说明文字，或点击查阅原始对话与材料证据。" },
    { target: "checkpoint-network", title: "知识网络逻辑图谱", body: "以推导网络直观呈现思考块之间的因果推导与辩驳挑战逻辑。点击网络中的节点可快速选中并校准卡片。" },
    { target: "checkpoint-empty", title: "Problem State 提取说明", body: "当未能成功归纳或处于测试状态时，此区域会显示状态提示。在实际实验中，需在工作区写入有效的思考记录以触发提取。" },
    { target: "checkpoint-footer", title: "保存与进度控制", body: "此处展示当前保存窗口的等待倒计时或完成状态。在测试模式或倒计时结束后，可点击右侧按钮进入下一阶段。" },
  ] : [
    { target: "checkpoint-timeline", title: "Save Window Stage", body: "Indicates you are in Stage 2 (Save Window). AI summarizes your Problem State based on your Phase 1 work." },
    { target: "checkpoint-goals", title: "Goal Structure", body: "Summarizes the main goal, active subgoals, suspended tasks, and rejected paths forming your reasoning framework." },
    { target: "checkpoint-state", title: "Candidate Problem State", body: "Reasoning cards extracted by DeepSeek. Card colors reflect their epistemic status (Active, Uncertain, Expired)." },
    { target: "checkpoint-inspector", title: "Card Inspector", body: "Inspect selected cards here. Calibrate status, pin key points, edit text, or trace back to chat/material evidence." },
    { target: "checkpoint-network", title: "Knowledge Network", body: "Visualizes logical leads-to and challenges relations between reasoning blocks. Click nodes to select and calibrate matching cards." },
    { target: "checkpoint-empty", title: "Problem State Status", body: "Shows extraction status and notices when cards are not yet generated or when testing without API keys." },
    { target: "checkpoint-footer", title: "Save & Progress Control", body: "Displays countdown timer or completion status. In test mode or when finished, proceed to the next stage using the right button." },
  ], [locale]);

  const [availableSteps, setAvailableSteps] = useState(allSteps);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Filter steps based on elements currently present in DOM
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const valid = allSteps.filter((s) => Boolean(document.querySelector(`[data-tour="${s.target}"]`)));
      if (valid.length > 0) {
        setAvailableSteps(valid);
        setIndex(0);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [allSteps, open]);

  const step = availableSteps[Math.min(index, availableSteps.length - 1)] || availableSteps[0];
  const stepTarget = step?.target;

  useEffect(() => {
    if (!open || !stepTarget) return;
    const update = () => {
      const element = document.querySelector<HTMLElement>(`[data-tour="${stepTarget}"]`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
        setRect(element.getBoundingClientRect());
      } else {
        setRect(null);
      }
    };
    update();
    const timer = setTimeout(update, 200);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, stepTarget]);

  if (!open || !step || !rect) return null;

  const panelWidth = 340;
  const preferredLeft = rect.right + 24;
  const panelLeft = preferredLeft + panelWidth <= window.innerWidth - 24
    ? preferredLeft
    : Math.max(24, rect.left - panelWidth - 24);
  const panelTop = Math.max(86, Math.min(window.innerHeight - 290, rect.top + 16));

  const finish = () => {
    setIndex(0);
    onOpenChange(false);
  };

  return <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label={locale === "zh-CN" ? "保存窗口全屏解释浮窗" : "Save window guided tour overlay"}>
    <div
      className="absolute rounded-2xl border-2 border-white/95 transition-all duration-300"
      style={{
        left: Math.max(8, rect.left - 6),
        top: Math.max(8, rect.top - 6),
        width: rect.width + 12,
        height: rect.height + 12,
        boxShadow: "0 0 0 9999px rgba(15, 19, 32, .76)",
      }}
    />
    <aside className="absolute w-[340px] rounded-2xl border border-white/20 bg-white p-6 shadow-2xl transition-all duration-300" style={{ left: panelLeft, top: panelTop }}>
      <div className="flex items-center justify-between">
        <Badge variant="secondary">{index + 1} / {availableSteps.length}</Badge>
        <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">{locale === "zh-CN" ? "模块解释" : "Block guide"}</span>
      </div>
      <h2 className="mt-4 text-xl font-semibold tracking-tight">{step.title}</h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{step.body}</p>
      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" disabled={index === 0} onClick={() => setIndex((current) => current - 1)}>
          {locale === "zh-CN" ? "上一步" : "Back"}
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={finish}>
            {locale === "zh-CN" ? "退出" : "Exit"}
          </Button>
          <Button className="h-10 px-4" onClick={() => {
            if (index < availableSteps.length - 1) {
              setIndex((current) => current + 1);
            } else {
              finish();
            }
          }}>
            {index === availableSteps.length - 1 ? (locale === "zh-CN" ? "完成" : "Done") : (locale === "zh-CN" ? "下一步" : "Next")}
            <ArrowRight size={16} />
          </Button>
        </div>
      </div>
    </aside>
  </div>;
}

export function RmwCheckpoint({
  locale,
  condition,
  taskId,
  memo,
  messages,
  testMode,
  onBack,
  onContinue,
}: {
  locale: Locale;
  condition: Condition;
  taskId: ResearchTaskId;
  memo: string;
  messages: Array<{ role: "user" | "assistant"; text: string }>;
  testMode: boolean;
  onBack: () => void;
  onContinue: (snapshot?: ProblemStateSnapshot) => void;
}) {
  const t = labels[locale];
  const [cards, setCards] = useState<ProblemStateCard[]>([]);
  const [relations, setRelations] = useState<ProblemStateRelation[]>([]);
  const [selected, setSelected] = useState("");
  const [mode, setMode] = useState<"loading" | "live" | "insufficient" | "unavailable" | "error">("loading");
  const [guideOpen, setGuideOpen] = useState(true);
  const [earlyNotice, setEarlyNotice] = useState(false);
  const remaining = useCheckpointCountdown(testMode);

  const selectCard = (id: string) => {
    setSelected(id);
    eventLog("checkpoint_card_selected", { id }, { stage: "checkpoint", targetType: "reasoning_card", targetId: id });
  };
  const updateStatus = (id: string, status: EpistemicStatus) => {
    setCards((current) => current.map((card) => card.id === id ? { ...card, status } : card));
    eventLog("checkpoint_card_status_changed", { status }, { stage: "checkpoint", targetType: "reasoning_card", targetId: id });
  };
  const togglePin = (id: string) => {
    setCards((current) => current.map((card) => card.id === id
      ? { ...card, priority: card.priority === "pinned" ? "normal" : "pinned" }
      : card));
    eventLog("checkpoint_card_pin_toggled", { id }, { stage: "checkpoint", targetType: "reasoning_card", targetId: id });
  };
  const updateContent = (id: string, value: string) => {
    setCards((current) => current.map((card) => card.id === id
      ? { ...card, content: { ...card.content, [locale]: value } }
      : card));
    eventLog("checkpoint_card_content_edited", { locale }, { stage: "checkpoint", targetType: "reasoning_card", targetId: id });
  };

  useEffect(() => {
    const controller = new AbortController();
    const extract = async () => {
      try {
        const response = await fetch("/api/extract", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ locale, taskId, memo, messages, actions: readProblemStateActions() }),
          signal: controller.signal,
        });
        const result = await response.json() as {
          mode?: "live" | "insufficient" | "unavailable";
          cards?: ExtractedCard[];
          relations?: ProblemStateRelation[];
          error?: string;
        };
        if (!response.ok) throw new Error(result.error || "Extraction failed");
        if (result.mode === "live" && result.cards?.length) {
          const extracted = result.cards.map((card) => ({
            ...card,
            content: { "zh-CN": card.content, en: card.content },
            detail: { "zh-CN": card.detail, en: card.detail },
            source: { "zh-CN": card.source, en: card.source },
            why: { "zh-CN": card.why, en: card.why },
          }));
          setCards(extracted);
          setSelected(extracted[0]?.id || "");
          if (result.relations?.length) setRelations(result.relations);
          setMode("live");
          eventLog("checkpoint_extraction_completed", {
            taskId,
            mode: "live",
            cards: extracted,
            relations: result.relations || [],
          }, { stage: "checkpoint" });
          return;
        }
        const skippedMode = result.mode === "insufficient" ? "insufficient" : "unavailable";
        setCards([]);
        setRelations([]);
        setSelected("");
        setMode(skippedMode);
        eventLog("checkpoint_extraction_skipped", { taskId, reason: skippedMode }, { stage: "checkpoint" });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMode("error");
        eventLog("checkpoint_extraction_failed", { taskId }, { stage: "checkpoint" });
      }
    };
    void extract();
    return () => controller.abort();
  }, [locale, memo, messages, taskId]);

  const main = cards.find((card) => card.goalLevel === "main");
  const active = cards.filter((card) => card.goalLevel === "subgoal").slice(0, 4);
  const suspended = cards.filter((card) => card.goalLevel === "suspended").slice(0, 3);
  const rejected = cards.find((card) => card.kind === "path");
  const selectedCard = cards.find((card) => card.id === selected) || cards[0];
  const extractionReady = condition === "rmw_no_summary" || mode === "live";
  const modeLabel = mode === "live" ? "DeepSeek" : mode === "loading"
    ? (locale === "zh-CN" ? "分析中" : "Analyzing")
    : mode === "insufficient"
      ? (locale === "zh-CN" ? "未生成" : "Not generated")
      : mode === "unavailable"
        ? (locale === "zh-CN" ? "DeepSeek 未配置" : "DeepSeek unavailable")
        : (locale === "zh-CN" ? "分析失败" : "Analysis failed");
  const emptyMessage = mode === "loading"
    ? (locale === "zh-CN" ? "正在检查 memo 与对话，并请求 DeepSeek 提取……" : "Checking the memo and chat, then requesting DeepSeek extraction…")
    : mode === "insufficient"
      ? (locale === "zh-CN" ? "没有检测到参与者实际写入的 memo 或对话，因此未生成 Problem State。预填的问题和模板不算作参与者推理。" : "No participant-authored memo or chat was detected, so no problem state was generated. The prefilled question and template do not count as participant reasoning.")
      : mode === "unavailable"
        ? (locale === "zh-CN" ? "服务器未配置 DeepSeek API Key，因此本次没有生成 Problem State，也不会显示演示卡片。" : "The server has no DeepSeek API key, so no problem state was generated and no demo cards are shown.")
        : (locale === "zh-CN" ? "DeepSeek 提取失败，本次没有生成 Problem State。" : "DeepSeek extraction failed, so no problem state was generated.");
  const footerStatus = mode === "loading"
    ? (locale === "zh-CN" ? "正在等待提取结果" : "Waiting for extraction")
    : !extractionReady
      ? (testMode ? (locale === "zh-CN" ? "测试模式可跳过；正式实验不可继续" : "Test mode may skip; the formal study cannot continue") : (locale === "zh-CN" ? "未生成 Problem State，无法进入中断任务" : "No problem state was generated; interruption is blocked"))
      : testMode
        ? (locale === "zh-CN" ? "测试模式：可直接继续" : "Test mode: continue anytime")
        : remaining > 0 ? t.waiting : (locale === "zh-CN" ? "可以进入中断任务" : "Interruption task is ready");

  return <div className="min-h-screen bg-[#f7f6f2] px-6 py-5">
    <CheckpointGuide locale={locale} open={guideOpen} onOpenChange={setGuideOpen}/>
    <div className="mx-auto max-w-[1480px]">
      <div data-tour="checkpoint-timeline">
        <ExperimentTimeline locale={locale} active="save" />
      </div>
      <header className="flex items-end justify-between py-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t.title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            {condition === "rmw_no_summary"
              ? (locale === "zh-CN" ? "系统已自动保存你的工作区 memo 与对话。为保障基线对照纯净度，本组别不向被试展示中间推导卡片与网络校准界面。" : "Your workspace memo and chat history have been saved. Card display and calibration UI are omitted for this baseline condition to avoid pre-interruption rehearsal.")
              : condition === "summary_only"
                ? (locale === "zh-CN" ? "系统正在结合你的 memo 与对话在后台自动整理 Problem State。为保障基线对照纯净度，本组别不向被试展示中间推导卡片与网络校准界面。" : "The system is auto-extracting problem state in the background. Card display and calibration UI are omitted for this baseline condition to avoid pre-interruption rehearsal.")
                : t.subtitle}
          </p>
          {condition === "rmw" && mode === "live" && <p className="mt-2 max-w-3xl text-xs leading-5 text-primary">{t.calibrateHint}</p>}
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={condition === "rmw_no_summary" ? "outline" : mode === "live" ? "default" : "secondary"}>
            {condition === "rmw_no_summary" ? (locale === "zh-CN" ? "用户笔记基线" : "Self-Notes") : modeLabel}
          </Badge>
          <Button onClick={() => setGuideOpen(true)} variant="outline" className="h-9 gap-2 border-primary/30 bg-white font-medium text-primary hover:bg-primary/5">
            <Question size={16} />
            {locale === "zh-CN" ? "浮窗解释模式" : "Guided Tour Overlay"}
          </Button>
        </div>
      </header>

      {condition === "rmw_no_summary" ? <section data-tour="checkpoint-self-notes-baseline" className="rounded-2xl border bg-white px-8 py-16 text-center shadow-[0_12px_40px_rgba(35,43,70,.05)]">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-50 text-amber-800">
          <Brain size={30} className="text-amber-800" />
        </div>
        <Badge variant="secondary" className="mt-4">{locale === "zh-CN" ? "方式二 · 用户自主笔记基线" : "Method 2 · Self-Notes Baseline"}</Badge>
        <h2 className="mt-4 text-xl font-semibold">
          {locale === "zh-CN" ? "工作区记录已保存 · 准备进入中断任务" : "Workspace notes saved · Ready for interruption"}
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
          {locale === "zh-CN"
            ? "你的工作区 memo 与对话记录已成功保存。本组别（方式二：用户自主笔记基线）不提供 AI 推理卡片与网络生成，请凭借你在工作区中记录的笔记继续恢复研究。"
            : "Your workspace memo and chat history have been saved. Method 2 (Self-Notes Baseline) provides no AI reasoning cards or network diagram; proceed using your own workspace notes."}
        </p>
      </section> : condition === "summary_only" ? <section data-tour="checkpoint-summary-baseline" className="rounded-2xl border bg-white px-8 py-16 text-center shadow-[0_12px_40px_rgba(35,43,70,.05)]">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-indigo-50 text-primary">
          <Brain size={30} className={mode === "loading" ? "animate-pulse text-indigo-600" : "text-indigo-600"} />
        </div>
        <Badge variant="secondary" className="mt-4">{locale === "zh-CN" ? "方式三 · 纯 AI 恢复摘要基线" : "Method 3 · Pure AI Summary Baseline"}</Badge>
        <h2 className="mt-4 text-xl font-semibold">
          {mode === "loading"
            ? (locale === "zh-CN" ? "后台自动提取 Problem State 中……" : "Auto-extracting problem state in background…")
            : mode === "live"
              ? (locale === "zh-CN" ? "后台保存完成 · 准备进入中断任务" : "Background extraction complete · Ready for interruption")
              : (locale === "zh-CN" ? "后台提取状态" : "Background extraction status")}
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
          {mode === "loading"
            ? emptyMessage
            : mode === "live"
              ? (locale === "zh-CN"
                ? "系统已在后台自动归纳你的研究推理状态，该状态将用于中断后的 AI 摘要生成。为了防止中断前的卡片预演（Cards Rehearsal Effect）干扰实验基线，在此步骤无需进行人工卡片查看或校准。"
                : "Your reasoning state has been summarized in the background and will be used for post-interruption AI summary generation. In Method 3 (Pure AI Summary Baseline), pre-interruption card review and calibration are omitted to prevent rehearsal confounding.")
              : emptyMessage}
        </p>
      </section> : mode === "live" ? <>
      <section className="grid grid-cols-[1fr_1.25fr] gap-5">
        <article data-tour="checkpoint-goals" className="rounded-2xl border bg-white p-5 shadow-[0_12px_40px_rgba(35,43,70,.05)]">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{t.main}</h2><Badge variant="outline"><Target size={13} />1</Badge></div>
          {main && <StateTile card={main} locale={locale} selected={selected === main.id} onSelect={() => selectCard(main.id)} />}
          <div className="mt-4 grid grid-cols-[1.2fr_.8fr_.8fr] gap-3">
            <div><p className="mb-2 text-[10px] font-semibold text-muted-foreground">{t.active} · {active.length}</p><div className="space-y-2">{active.map((card) => <StateTile key={card.id} card={card} locale={locale} selected={selected === card.id} onSelect={() => selectCard(card.id)} />)}</div></div>
            <div><p className="mb-2 text-[10px] font-semibold text-muted-foreground">{t.suspended} · {suspended.length}</p><div className="space-y-2">{suspended.map((card) => <StateTile key={card.id} card={card} locale={locale} selected={selected === card.id} onSelect={() => selectCard(card.id)} />)}</div></div>
            <div><p className="mb-2 text-[10px] font-semibold text-muted-foreground">{t.rejected}</p>{rejected && <StateTile card={rejected} locale={locale} selected={selected === rejected.id} onSelect={() => selectCard(rejected.id)} />}</div>
          </div>
        </article>

        <article data-tour="checkpoint-state" className="rounded-2xl border bg-white p-5 shadow-[0_12px_40px_rgba(35,43,70,.05)]">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold">{t.candidates}</h2><p className="mt-1 text-xs text-muted-foreground">{locale === "zh-CN" ? "由 DeepSeek 归纳；请校准后再保存。" : "Summarized by DeepSeek; calibrate before saving."}</p></div><Badge variant="secondary">{cards.length}</Badge></div>
          <div className="grid min-h-[360px] grid-cols-[1.05fr_.95fr] gap-3">
            <div className="grid max-h-[420px] grid-cols-1 gap-2 overflow-y-auto pr-1 content-start">
              {cards.filter((card) => card.goalLevel !== "main").map((card) => (
                <StateTile key={card.id} card={card} locale={locale} selected={selected === card.id} onSelect={() => selectCard(card.id)} />
              ))}
            </div>
            <div data-tour="checkpoint-inspector">
              {selectedCard && <CheckpointInspector
                key={`${selectedCard.id}-${locale}`}
                card={selectedCard}
                locale={locale}
                t={t}
                updateStatus={updateStatus}
                togglePin={togglePin}
                updateContent={updateContent}
              />}
            </div>
          </div>
        </article>
      </section>

      <section data-tour="checkpoint-network" className="mt-5">
        <div className="mb-3 flex items-center justify-between"><div><h2 className="flex items-center gap-2 font-semibold"><Graph size={20} className="text-primary" />{t.network}</h2><p className="mt-1 text-xs text-muted-foreground">{locale === "zh-CN" ? "点击节点可选中并校准对应卡片。" : "Click a node to select and calibrate the matching card."}</p></div><Badge variant="outline">{relations.length} relations</Badge></div>
        <CheckpointNetwork cards={cards} relations={relations} locale={locale} selected={selectedCard?.id || ""} onSelect={selectCard} />
      </section>
      </> : <section data-tour="checkpoint-empty" className="rounded-2xl border bg-white px-8 py-16 text-center shadow-[0_12px_40px_rgba(35,43,70,.05)]">
        <div className="mx-auto grid size-12 place-items-center rounded-xl bg-secondary text-primary">{mode === "loading" ? <Brain size={25} /> : <WarningCircle size={25} />}</div>
        <h2 className="mt-5 text-lg font-semibold">{locale === "zh-CN" ? "没有可显示的 Problem State" : "No problem state to display"}</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{emptyMessage}</p>
        {mode !== "loading" && <Button variant="outline" className="mt-6" onClick={onBack}>{locale === "zh-CN" ? "返回工作区继续研究" : "Return to the workspace"}</Button>}
      </section>}

      <div data-tour="checkpoint-footer" className="mt-5 flex items-center justify-between rounded-2xl border bg-white p-4">
        <div className="flex items-center gap-3 text-sm"><Clock size={20} className="text-primary" /><div><p className="font-medium">{footerStatus}</p>{!testMode&&extractionReady&&remaining>0&&<div className="mt-2 flex items-center gap-3"><Progress value={((60-remaining)/60)*100} className="h-1.5 w-32" /><span className="text-xs text-muted-foreground">{formatClock(remaining)}</span></div>}</div></div>
        <div className="text-right">
          {!testMode&&earlyNotice && remaining > 0 && <p role="status" className="mb-2 text-xs text-amber-700">{t.early}</p>}
          <Button variant={extractionReady&&(testMode||remaining === 0) ? "default" : "secondary"} disabled={mode === "loading" || (!testMode&&!extractionReady)} className="h-11 px-6" onClick={() => {
            if (!extractionReady) {
              if (testMode) {
                eventLog("checkpoint_skipped_in_test_mode", { taskId, reason: mode }, { stage: "checkpoint" });
                onContinue();
              }
              return;
            }
            if (!testMode&&remaining > 0) {
              setEarlyNotice(true);
              eventLog("checkpoint_continue_blocked", { remaining }, { stage: "checkpoint" });
              return;
            }
            eventLog("checkpoint_completed", { taskId, cards, relations }, { stage: "checkpoint" });
            onContinue({ cards, relations, capturedAt: new Date().toISOString() });
          }}>{!extractionReady&&testMode?(locale === "zh-CN"?"仅测试模式：跳过保存":"Test mode only: skip save"):t.saveAndBreak}<ArrowRight /></Button>
        </div>
      </div>
    </div>
  </div>;
}

const letterSequence = ["A", "C", "A", "B", "D", "B", "C", "D"];
const colorTrials = [
  { word: "蓝", color: "red", answer: "red" },
  { word: "绿", color: "blue", answer: "blue" },
  { word: "红", color: "green", answer: "green" },
  { word: "蓝", color: "blue", answer: "blue" },
  { word: "红", color: "red", answer: "red" },
  { word: "绿", color: "green", answer: "green" },
] as const;
const colorCss = { red: "text-red-600", blue: "text-blue-600", green: "text-emerald-600" };
const colorWordEn: Record<string, string> = { 红: "RED", 蓝: "BLUE", 绿: "GREEN" };

export function InterruptionTask({ locale, onComplete }: { locale: Locale; fastMode: boolean; onComplete: () => void }) {
  const t = labels[locale];
  const [game, setGame] = useState<"letter" | "color">("letter");
  const [index, setIndex] = useState(2);
  const [correct, setCorrect] = useState(0);
  const [letterPassed, setLetterPassed] = useState(false);
  const [colorIndex, setColorIndex] = useState(0);
  const [colorCorrect, setColorCorrect] = useState(0);
  const letterComplete = index >= letterSequence.length;
  const colorComplete = colorIndex >= colorTrials.length;
  const letterTotal = letterSequence.length - 2;
  const expectedSame = !letterComplete && letterSequence[index] === letterSequence[index - 2];

  const answerLetter = (same: boolean) => {
    const isCorrect = same === expectedSame;
    if (isCorrect) setCorrect((value) => value + 1);
    eventLog("letter_game_answered", { index, same, expectedSame, correct: isCorrect }, { stage: "interruption" });
    setIndex((value) => value + 1);
  };
  const restartLetter = () => {
    setIndex(2);
    setCorrect(0);
  };
  const answerColor = (answer: "red" | "blue" | "green") => {
    const trial = colorTrials[colorIndex];
    const isCorrect = answer === trial.answer;
    if (isCorrect) setColorCorrect((value) => value + 1);
    eventLog("color_game_answered", { index: colorIndex, answer, expected: trial.answer, correct: isCorrect }, { stage: "interruption" });
    setColorIndex((value) => value + 1);
  };
  const restartColor = () => {
    setColorIndex(0);
    setColorCorrect(0);
  };

  return <div className="min-h-screen bg-[#f7f6f2] px-6 py-5">
    <div className="mx-auto max-w-5xl">
      <ExperimentTimeline locale={locale} active="break" />
      <header className="py-9 text-center"><Badge variant="secondary" className="mb-4"><PauseCircle size={14} />{t.interruption}</Badge><h1 className="text-3xl font-semibold">{game === "letter" ? t.letterGame : t.colorGame}</h1><p className="mt-3 text-sm text-muted-foreground">{game === "letter" ? t.letterHint : t.colorHint}</p></header>
      <section className="mx-auto max-w-2xl rounded-2xl border bg-white p-8 text-center shadow-[0_18px_60px_rgba(35,40,65,.07)]">
        {game === "letter" ? <>
          <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{t.trial} {Math.min(index - 1, letterTotal)} / {letterTotal}</span><span>{correct} / {Math.max(0, index - 2)}</span></div>
          <Progress value={((index - 2) / letterTotal) * 100} className="mt-3 h-1.5" />
          {!letterComplete ? <>
            <div className="my-10 flex items-center justify-center gap-3">{letterSequence.slice(0, index + 1).slice(-3).map((letter, position, current) => <span key={`${letter}-${position}`} className={`grid place-items-center rounded-2xl border font-mono font-semibold ${position === current.length - 1 ? "size-32 bg-primary text-6xl text-white shadow-lg" : "size-16 bg-muted text-2xl text-muted-foreground"}`}>{letter}</span>)}</div>
            <div className="grid grid-cols-2 gap-3"><Button variant="outline" className="h-14 text-base" onClick={() => answerLetter(false)}>{t.different}</Button><Button className="h-14 text-base" onClick={() => answerLetter(true)}>{t.same}</Button></div>
          </> : <div className="py-8"><ScoreResult score={correct} total={letterTotal} locale={locale} />{correct === letterTotal ? <Button className="mt-6 w-full" onClick={() => { setLetterPassed(true); setGame("color"); eventLog("letter_game_passed", { score: correct }, { stage: "interruption" }); }}>{t.nextGame}<ArrowRight /></Button> : <Button className="mt-6 w-full" variant="outline" onClick={restartLetter}>{t.retry}</Button>}</div>}
        </> : <>
          <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{t.trial} {Math.min(colorIndex + 1, colorTrials.length)} / {colorTrials.length}</span><span>{colorCorrect} / {colorIndex}</span></div>
          <Progress value={(colorIndex / colorTrials.length) * 100} className="mt-3 h-1.5" />
          {!colorComplete ? <><div className="my-14"><p className={`text-7xl font-bold ${colorCss[colorTrials[colorIndex].color]}`}>{locale === "zh-CN" ? colorTrials[colorIndex].word : colorWordEn[colorTrials[colorIndex].word]}</p></div><div className="grid grid-cols-3 gap-3">{(["red", "blue", "green"] as const).map((color) => <Button key={color} variant="outline" className="h-14 text-base" onClick={() => answerColor(color)}>{locale === "zh-CN" ? { red: "红色", blue: "蓝色", green: "绿色" }[color] : color[0].toUpperCase() + color.slice(1)}</Button>)}</div></> : <div className="py-8"><ScoreResult score={colorCorrect} total={colorTrials.length} locale={locale} />{colorCorrect === colorTrials.length && letterPassed ? <Button className="mt-6 w-full" onClick={() => { eventLog("interruption_completed", { letterScore: correct, colorScore: colorCorrect, perfect: true }, { stage: "interruption" }); onComplete(); }}>{t.finish}<ArrowRight /></Button> : <Button className="mt-6 w-full" variant="outline" onClick={restartColor}>{t.retry}</Button>}</div>}
        </>}
        <p className="mt-5 text-xs text-muted-foreground">{t.fullScore}</p>
      </section>
    </div>
  </div>;
}

function ScoreResult({ score, total, locale }: { score: number; total: number; locale: Locale }) {
  const perfect = score === total;
  return <><div className={`mx-auto grid size-16 place-items-center rounded-2xl ${perfect ? "bg-[var(--active-soft)] text-[var(--active)]" : "bg-amber-50 text-amber-700"}`}>{perfect ? <CheckCircle size={36} weight="fill" /> : <WarningCircle size={36} />}</div><p className="mt-5 text-2xl font-semibold">{score} / {total}</p><p className="mt-2 text-sm text-muted-foreground">{perfect ? (locale === "zh-CN" ? "满分通过" : "Perfect score") : (locale === "zh-CN" ? "需要满分才能继续" : "A perfect score is required")}</p></>;
}
