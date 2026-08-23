"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Brain,
  Check,
  CheckCircle,
  Clock,
  PauseCircle,
  Question,
  WarningCircle,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { GuidedTourOverlay } from "@/components/guided-tour";
import { eventLog, readProblemStateActions } from "@/lib/event-log";
import type { ResearchTaskId } from "@/lib/research-task";
import type {
  Condition,
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
    subtitle: "系统会在后台结合你实际写下的 memo、人机对话与研究操作轨迹冻结并分析当前推理状态，用于后续研究分析。此过程不会向你展示任何提取结果，也不需要你做任何操作。",
    task: "主任务",
    save: "保存窗口",
    break: "中断任务",
    resume: "恢复",
    saveAndBreak: "保存并进入中断任务",
    waiting: "准备阶段将在 3 分钟后结束",
    early: "请完成 3 分钟的条件内准备，倒计时结束后才可进入中断任务。",
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
    subtitle: "The system freezes and analyzes your memo, human-AI conversation, and research-action trace in the background for later research analysis. Nothing is shown to you here, and no action is required.",
    task: "Primary task",
    save: "Save window",
    break: "Interruption",
    resume: "Resume",
    saveAndBreak: "Save and begin interruption",
    waiting: "Preparation ends after three minutes",
    early: "Please use the full three-minute condition-specific preparation period before the interruption.",
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

const CHECKPOINT_DURATION_SECONDS = 180;

function useCheckpointCountdown(fastMode: boolean) {
  const duration = fastMode ? 0 : CHECKPOINT_DURATION_SECONDS;
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
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}


function CheckpointGuide({ locale, open, onOpenChange }: { locale: Locale; open: boolean; onOpenChange: (open: boolean) => void }) {
  const steps = useMemo(() => locale === "zh-CN" ? [
    { target: "checkpoint-timeline", title: "保存阶段时间轴", body: "这里展示实验流程。您当前处于第 2 阶段「保存窗口 (Save Window)」，系统正在后台冻结并分析第一阶段的记录，不会向您展示分析结果。" },
    { target: "checkpoint-saved", title: "推理状态已保存", body: "系统已完成后台记录，无需您做任何操作，等待窗口结束后即可进入中断任务。" },
    { target: "checkpoint-empty", title: "Problem State 提取说明", body: "当未能成功归纳或处于测试状态时，此区域会显示状态提示。在实际实验中，需在工作区写入有效的思考记录以触发提取。" },
    { target: "checkpoint-footer", title: "保存与进度控制", body: "此处展示当前保存窗口的等待倒计时或完成状态。在测试模式或倒计时结束后，可点击右侧按钮进入下一阶段。" },
  ] : [
    { target: "checkpoint-timeline", title: "Save Window Stage", body: "Indicates you are in Stage 2 (Save Window). The system freezes and analyzes your Phase 1 record in the background; nothing is shown to you." },
    { target: "checkpoint-saved", title: "Reasoning state saved", body: "The background record is complete. No action is required; the interruption begins once the wait period ends." },
    { target: "checkpoint-empty", title: "Problem State Status", body: "Shows extraction status and notices when cards are not yet generated or when testing without API keys." },
    { target: "checkpoint-footer", title: "Save & Progress Control", body: "Displays countdown timer or completion status. In test mode or when finished, proceed to the next stage using the right button." },
  ], [locale]);

  return <GuidedTourOverlay
    locale={locale}
    open={open}
    onOpenChange={onOpenChange}
    steps={steps}
    ariaLabel={locale === "zh-CN" ? "保存窗口全屏解释浮窗" : "Save window guided tour overlay"}
    badgeLabel={locale === "zh-CN" ? "模块解释" : "Block guide"}
  />;
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
  const [mode, setMode] = useState<"loading" | "live" | "insufficient" | "unavailable" | "error">("loading");
  const [guideOpen, setGuideOpen] = useState(true);
  const [earlyNotice, setEarlyNotice] = useState(false);
  const remaining = useCheckpointCountdown(testMode);

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

  const extractionReady = mode === "live";
  const preparationReady = extractionReady;
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
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={mode === "live" ? "default" : "secondary"}>{modeLabel}</Badge>
          <Button onClick={() => setGuideOpen(true)} variant="outline" className="h-9 gap-2 border-primary/30 bg-white font-medium text-primary hover:bg-primary/5">
            <Question size={16} />
            {locale === "zh-CN" ? "浮窗解释模式" : "Guided Tour Overlay"}
          </Button>
        </div>
      </header>

      {mode === "live" ? <section data-tour="checkpoint-saved" className="rounded-2xl border bg-white px-8 py-16 text-center shadow-[0_12px_40px_rgba(35,43,70,.05)]">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
          <Check size={28} />
        </div>
        <h2 className="mt-5 text-lg font-semibold">{locale === "zh-CN" ? "推理状态已保存" : "Reasoning state saved"}</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{locale === "zh-CN" ? "系统已在后台冻结并记录你当前的推理状态，用于后续研究分析；此过程不会向你展示任何摘要或卡片。" : "The system froze and recorded your current reasoning state in the background for later analysis. No summary or cards are shown here."}</p>
      </section> : <section data-tour="checkpoint-empty" className="rounded-2xl border bg-white px-8 py-16 text-center shadow-[0_12px_40px_rgba(35,43,70,.05)]">
        <div className="mx-auto grid size-12 place-items-center rounded-xl bg-secondary text-primary">{mode === "loading" ? <Brain size={25} /> : <WarningCircle size={25} />}</div>
        <h2 className="mt-5 text-lg font-semibold">{locale === "zh-CN" ? "没有可显示的 Problem State" : "No problem state to display"}</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{emptyMessage}</p>
        {mode !== "loading" && <Button variant="outline" className="mt-6" onClick={onBack}>{locale === "zh-CN" ? "返回工作区继续研究" : "Return to the workspace"}</Button>}
      </section>}

      <div data-tour="checkpoint-footer" className="mt-5 flex items-center justify-between rounded-2xl border bg-white p-4">
        <div className="flex items-center gap-3 text-sm"><Clock size={20} className="text-primary" /><div><p className="font-medium">{footerStatus}</p>{!testMode&&extractionReady&&remaining>0&&<div className="mt-2 flex items-center gap-3"><Progress value={((CHECKPOINT_DURATION_SECONDS-remaining)/CHECKPOINT_DURATION_SECONDS)*100} className="h-1.5 w-32" /><span className="text-xs text-muted-foreground">{formatClock(remaining)}</span></div>}</div></div>
        <div className="text-right">
          {!testMode&&earlyNotice && remaining > 0 && <p role="status" className="mb-2 text-xs text-amber-700">{t.early}</p>}
          <Button variant={preparationReady&&(testMode||remaining === 0) ? "default" : "secondary"} disabled={mode === "loading" || (!testMode&&!preparationReady)} className="h-11 px-6" onClick={() => {
            if (!preparationReady) {
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
            eventLog("checkpoint_completed", { taskId, condition, cards, relations, preparationSeconds: CHECKPOINT_DURATION_SECONDS }, { stage: "checkpoint" });
            onContinue({ cards, relations, capturedAt: new Date().toISOString() });
          }}>{!preparationReady&&testMode?(locale === "zh-CN"?"仅测试模式：跳过保存":"Test mode only: skip save"):t.saveAndBreak}<ArrowRight /></Button>
        </div>
      </div>
    </div>
  </div>;
}

const letterSequence = ["A", "C", "A", "B", "D", "B", "C", "D"];
// Blue / orange / purple: no red-green pair, so the task stays valid for
// participants with red-green color-vision deficiency (the most common type).
const colorTrials = [
  { word: "蓝", color: "orange", answer: "orange" },
  { word: "紫", color: "blue", answer: "blue" },
  { word: "橙", color: "purple", answer: "purple" },
  { word: "蓝", color: "blue", answer: "blue" },
  { word: "橙", color: "orange", answer: "orange" },
  { word: "紫", color: "purple", answer: "purple" },
] as const;
const colorCss = { orange: "text-orange-600", blue: "text-blue-600", purple: "text-purple-600" };
const colorWordEn: Record<string, string> = { 蓝: "BLUE", 橙: "ORANGE", 紫: "PURPLE" };

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
  const answerColor = (answer: "orange" | "blue" | "purple") => {
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
          {!colorComplete ? <><div className="my-14"><p className={`text-7xl font-bold ${colorCss[colorTrials[colorIndex].color]}`}>{locale === "zh-CN" ? colorTrials[colorIndex].word : colorWordEn[colorTrials[colorIndex].word]}</p></div><div className="grid grid-cols-3 gap-3">{(["orange", "blue", "purple"] as const).map((color) => <Button key={color} variant="outline" className="h-14 text-base" onClick={() => answerColor(color)}>{locale === "zh-CN" ? { orange: "橙色", blue: "蓝色", purple: "紫色" }[color] : color[0].toUpperCase() + color.slice(1)}</Button>)}</div></> : <div className="py-8"><ScoreResult score={colorCorrect} total={colorTrials.length} locale={locale} />{colorCorrect === colorTrials.length && letterPassed ? <Button className="mt-6 w-full" onClick={() => { eventLog("interruption_completed", { letterScore: correct, colorScore: colorCorrect, perfect: true }, { stage: "interruption" }); onComplete(); }}>{t.finish}<ArrowRight /></Button> : <Button className="mt-6 w-full" variant="outline" onClick={restartColor}>{t.retry}</Button>}</div>}
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
