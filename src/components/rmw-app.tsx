"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, BookOpenText, Brain, Check, CheckCircle, Clock,
  Globe, Question, LinkSimple,
  NotePencil, PaperPlaneTilt, PauseCircle, PushPin, Sparkle,
  SquaresFour, Target, Timer, WarningCircle, XCircle,
} from "@phosphor-icons/react";
import { Background, Controls, Handle, Position, ReactFlow, type Edge, type Node } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { beginStudySession, eventLog, getOrCreateParticipantId } from "@/lib/event-log";
import {
  completeRemoteStudy,
  saveRemoteStudySnapshot,
  startRemoteStudySession,
} from "@/lib/remote-results";
import {
  problemStateToContinuousSummary,
  readProblemStateSnapshot,
  saveProblemStateSnapshot,
  toCardRelations,
  toReasoningCards,
} from "@/lib/problem-state";
import {
  getTaskMaterials,
  getResearchTask,
  isResearchTaskId,
  type ResearchTaskId,
} from "@/lib/research-task";
import type { CardRelation, Condition, EpistemicStatus, Locale, ProblemStateSnapshot, ReasoningCard } from "@/lib/rmw-types";
import { InterruptionTask, RmwCheckpoint } from "@/components/rmw-checkpoint";
import { RecoveryProbePage } from "@/components/recovery-probe";
import { TimedButton } from "@/components/timed-button";
import {
  createRecoveryAssessment,
  recoveryAssessmentEventPayload,
  withRecoveryProbe,
  type RecoveryAssessment,
  type RecoveryPostSurvey,
  type RecoveryReadiness,
} from "@/lib/recovery-assessment";

type Screen = "landing" | "brief" | "survey" | "work" | "city_t1" | "checkpoint" | "interruption" | "city_t2" | "city_support" | "city_t3" | "workspace" | "post_survey" | "complete";
type ChatMessage = { role: "user" | "assistant"; text: string };
const WORK_PHASE_DURATION_SECONDS = 900;
const RECOVERY_PHASE_DURATION_SECONDS = 300;

const copy = {
  "zh-CN": {
    study: "思考与恢复研究", consent: "我已阅读并同意参与研究",
    anonymous: "本次研究编号", enter: "开始研究", language: "界面语言",
    pretitle: "开始前，先了解你的经验", next: "继续", back: "返回",
    materials: "材料", chat: "AI 助手", memo: "工作区", recovery: "推理恢复支持",
    day: "恢复阶段", saved: "已保存", help: "帮助", progress: "阅读进度",
    ask: "向 AI 助手提问…", disclaimer: "AI 可能出错，请结合材料与证据判断。",
    memoPlaceholder: "继续写下你的研究问题、发现与实验计划…", words: "字",
    resume: "恢复摘要", cards: "推理卡片", network: "知识网络", relations: "关系列表",
    currentGoal: "当前目标", position: "推理位置", uncertain: "仍未验证", ruled: "已排除", nextStep: "最小下一步",
    currentGoalHint: "接下来要完成的目标",
    positionHint: "前面做到了哪里，后面应该怎么去做",
    uncertainHint: "还没有做 / 尚未核实的事情",
    continue: "继续研究", endStudy: "结束研究", evidence: "查看证据", pin: "置顶", verify: "已核查", expire: "过期", restore: "恢复",
    allCards: "全部卡片", ready: "从这里继续", readFirst: "先花一分钟看恢复摘要，再检查存疑内容。",
    completed: "任务已完成", completeText: "感谢参与。你的回答已安全保存。",
    recoveryAcceptTitle: "恢复阶段 · 接受推理位置",
    recoveryAcceptSub: "请先确认恢复支持给出的关键点。可编辑后接受，再进入卡片与网络校准。",
    recoveryAcceptAction: "接受并继续",
    recoveryAcceptBlocked: "请完成三栏确认",
    desktop: "请使用桌面设备", desktopText: "为了保证实验条件一致，本研究需要至少 1100px 宽的桌面浏览器。",
  },
  en: {
    study: "Student Research Framing & Recovery Study", consent: "I have read the information and agree to participate",
    anonymous: "Research session ID", enter: "Start study", language: "Interface language",
    pretitle: "A few questions about your experience", next: "Continue", back: "Back",
    materials: "Materials", chat: "AI assistant", memo: "Workspace", recovery: "Reasoning recovery",
    day: "Resume", saved: "Saved", help: "Help", progress: "Reading progress",
    ask: "Ask the AI assistant…", disclaimer: "AI can make mistakes. Check important claims against the evidence.",
    memoPlaceholder: "Continue your research problem, findings, and study plan…", words: "words",
    resume: "Resume brief", cards: "Reasoning cards", network: "Knowledge network", relations: "Relation list",
    currentGoal: "Current goal", position: "Reasoning position", uncertain: "Still uncertain", ruled: "Ruled out", nextStep: "Next step",
    currentGoalHint: "The goal you still need to finish next",
    positionHint: "Where you left off, and what you should do next",
    uncertainHint: "What you have not yet done or verified",
    continue: "Continue research", endStudy: "End study", evidence: "View evidence", pin: "Pin", verify: "Verified", expire: "Expire", restore: "Restore",
    allCards: "All cards", ready: "Resume from here", readFirst: "Review the brief first, then inspect the uncertain claim.",
    completed: "Study complete", completeText: "Thank you. Your responses have been saved securely.",
    recoveryAcceptTitle: "Recovery · Accept reasoning position",
    recoveryAcceptSub: "Confirm the recovery-critical points first. Edit if needed, accept, then calibrate cards and the network.",
    recoveryAcceptAction: "Accept and continue",
    recoveryAcceptBlocked: "Complete all three fields",
    desktop: "Desktop device required", desktopText: "To keep experimental conditions consistent, use a desktop browser at least 1100px wide.",
  },
};

export function RmwApp() {
  const [locale, setLocale] = useState<Locale>("zh-CN");
  const [screen, setScreen] = useState<Screen>("landing");
  const [condition, setCondition] = useState<Condition>("rmw");
  const [taskId, setTaskId] = useState<ResearchTaskId>("city_policy");
  const [memo, setMemo] = useState(() => getResearchTask("city_policy").starterMemo["zh-CN"]);
  const [chat, setChat] = useState<ChatMessage[]>(() => [{ role: "assistant", text: getResearchTask("city_policy").assistantIntro["zh-CN"] }]);
  const [testMode, setTestMode] = useState(false);
  const [participantId, setParticipantId] = useState("");
  const [startError, setStartError] = useState("");
  const [problemState, setProblemState] = useState<ProblemStateSnapshot | null>(() => readProblemStateSnapshot());
  const [recoveryAssessment, setRecoveryAssessment] = useState<RecoveryAssessment>(() => createRecoveryAssessment("city_policy"));
  const [completionStatus, setCompletionStatus] = useState<"saving" | "saved" | "error">("saving");
  const startingRef = useRef(false);
  const t = copy[locale];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get("view");
    const c = params.get("condition") as Condition | null;
    const task = params.get("task");
    const lang = params.get("lang") as Locale | null;
    const frame = requestAnimationFrame(() => {
      setParticipantId(getOrCreateParticipantId());
      setTestMode(params.get("test") === "1");
      if (lang === "en" || lang === "zh-CN") setLocale(lang);
      if (c && ["rmw", "rmw_no_summary", "summary_only"].includes(c)) setCondition(c);
      if (isResearchTaskId(task)) {
        const selectedTask=getResearchTask(task);
        const selectedLocale=lang==="en"||lang==="zh-CN"?lang:"zh-CN";
        setTaskId(task);
        setMemo(selectedTask.starterMemo[selectedLocale]);
        setChat([{role:"assistant",text:selectedTask.assistantIntro[selectedLocale]}]);
      }
      if (view === "checkpoint") setScreen("checkpoint");
      if (view === "interruption") setScreen("interruption");
      if (view === "recovery") setScreen("workspace");
      if (view === "recall") setScreen("city_t2");
      if (view === "task") setScreen("brief");
      if (view === "work") setScreen("work");
      if (view === "city-t1") setScreen("city_t1");
      if (view === "city-t2") setScreen("city_t2");
      if (view === "city-support") setScreen("city_support");
      if (view === "city-t3") setScreen("city_t3");
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (screen !== "complete" || completionStatus !== "saving") return;
    let active = true;
    void completeRemoteStudy({ memo, chat, problemState, taskAssessment: recoveryAssessment }).then((saved) => {
      if (active) setCompletionStatus(saved ? "saved" : "error");
    });
    return () => { active = false; };
  }, [chat, completionStatus, memo, problemState, recoveryAssessment, screen]);

  return (
    <>
      <div className="desktop-required fixed inset-0 z-50 hidden items-center justify-center bg-[#f7f6f2] p-8 text-center">
        <div className="max-w-md"><SquaresFour size={42} className="mx-auto mb-5 text-primary" /><h1 className="text-2xl font-semibold">{t.desktop}</h1><p className="mt-3 text-muted-foreground">{t.desktopText}</p></div>
      </div>
      <main className="desktop-app min-h-screen">
        {screen === "landing" && <Landing locale={locale} setLocale={setLocale} participantId={participantId} startError={startError} onStart={async (chosenCondition) => {
          if (startingRef.current) return;
          startingRef.current = true;
          setStartError("");
          try {
            const sessionId = beginStudySession();
            const requestedCondition = testMode ? condition : chosenCondition;
            const assignmentMode = testMode ? "manual" : "manual_condition";
            const assignment = await startRemoteStudySession({ sessionId, participantCode: participantId, locale, condition: requestedCondition, taskId, assignmentMode });
            if (!assignment || !isResearchTaskId(assignment.taskId) || !["rmw", "rmw_no_summary", "summary_only"].includes(assignment.condition)) {
              setStartError(locale === "zh-CN" ? "无法创建本次运行，请检查网络后重试。" : "Could not create this study run. Check your connection and try again.");
              return;
            }
            const assignedCondition = assignment.condition as Condition;
            const assignedTaskId = assignment.taskId;
            const task = getResearchTask(assignedTaskId);
            setCondition(assignedCondition);
            setTaskId(assignedTaskId);
            eventLog("consent_submitted", { locale, access: "anonymous", participantId, condition: assignedCondition }, { stage: "consent" });
            setCompletionStatus("saving");
            setMemo(task.starterMemo[locale]);
            setChat([{ role: "assistant", text: task.assistantIntro[locale] }]);
            setProblemState(null);
            setRecoveryAssessment(createRecoveryAssessment(assignedTaskId));
            saveProblemStateSnapshot(null);
            eventLog("research_task_started", { taskId: assignedTaskId, assignment: assignmentMode === "manual" ? "manual_test" : "condition_chosen_task_balanced", participantId, condition: assignedCondition }, { stage: "task_setup" });
            setScreen("brief");
          } finally {
            startingRef.current = false;
          }
        }} t={t} />}
        {screen === "brief" && <TaskBrief locale={locale} taskId={taskId} setScreen={setScreen} />}
        {screen === "survey" && <Survey locale={locale} taskId={taskId} setScreen={setScreen} t={t} />}
        {screen === "work" && <Workspace key={`work-${taskId}-${locale}`} locale={locale} condition={condition} taskId={taskId} phase="work" problemState={problemState} memo={memo} setMemo={setMemo} chat={chat} setChat={setChat} setScreen={setScreen} testMode={testMode} onPhaseOneCapture={() => {
          const capturedAt = new Date().toISOString();
          saveRemoteStudySnapshot({ phaseOneMemo: memo, phaseOneChat: chat, phaseOneCapturedAt: capturedAt });
          eventLog("phase_one_snapshot_captured", { taskId, memoLength: memo.length, chatTurnCount: chat.length, capturedAt }, { stage: "research_work", targetType: "memo" });
        }} t={t} />}
        {screen === "city_t1" && <RecoveryProbePage locale={locale} stage="t1" onSubmit={(probe) => {
          const next = withRecoveryProbe(recoveryAssessment, "t1", probe);
          setRecoveryAssessment(next);
          saveRemoteStudySnapshot({ taskAssessment: next });
          eventLog("recovery_probe_submitted", recoveryAssessmentEventPayload("t1", probe), { stage: "pre_interruption_assessment", targetType: "recall_probe", targetId: `${taskId}_t1` });
          setScreen("checkpoint");
        }} />}
        {screen === "checkpoint" && <RmwCheckpoint locale={locale} condition={condition} taskId={taskId} memo={memo} messages={chat} testMode={testMode} onBack={() => setScreen("work")} onContinue={(snapshot, participantNotes) => {
          if (snapshot) { setProblemState(snapshot); saveProblemStateSnapshot(snapshot); }
          const next = participantNotes === undefined ? recoveryAssessment : { ...recoveryAssessment, participantNotes };
          setRecoveryAssessment(next);
          saveRemoteStudySnapshot({ memo, chat, ...(snapshot && { problemState: snapshot }), taskAssessment: next });
          setScreen("interruption");
        }} />}
        {screen === "interruption" && <InterruptionTask locale={locale} fastMode={testMode} onComplete={() => setScreen("city_t2")} />}
        {screen === "city_t2" && <RecoveryProbePage locale={locale} stage="t2" onSubmit={(probe) => {
          const next = withRecoveryProbe(recoveryAssessment, "t2", probe);
          setRecoveryAssessment(next);
          saveRemoteStudySnapshot({ taskAssessment: next, recall: probe.reasoning });
          eventLog("recovery_probe_submitted", recoveryAssessmentEventPayload("t2", probe), { stage: "unsupported_recovery_assessment", targetType: "recall_probe", targetId: `${taskId}_t2` });
          eventLog("recovery_support_revealed", { condition, taskId, purpose: "supported_t3" }, { stage: "recovery_assessment" });
          setScreen("city_support");
        }} />}
        {screen === "city_support" && <RecoverySupportPage locale={locale} condition={condition} taskId={taskId} problemState={problemState} participantNotes={recoveryAssessment.participantNotes || ""} testMode={testMode} onContinue={(readiness) => {
          const next = { ...recoveryAssessment, readiness };
          setRecoveryAssessment(next);
          saveRemoteStudySnapshot({ taskAssessment: next });
          setScreen("city_t3");
        }} />}
        {screen === "city_t3" && <RecoveryProbePage locale={locale} stage="t3" onSubmit={(probe) => {
          const next = withRecoveryProbe(recoveryAssessment, "t3", probe);
          setRecoveryAssessment(next);
          saveRemoteStudySnapshot({ taskAssessment: next });
          eventLog("recovery_probe_submitted", recoveryAssessmentEventPayload("t3", probe), { stage: "supported_recovery_assessment", targetType: "recall_probe", targetId: `${taskId}_t3` });
          eventLog("recovery_new_evidence_unlocked", { taskId, afterProbe: "t3" }, { stage: "recovery", targetType: "material", targetId: getResearchTask(taskId).recoveryMaterial.id });
          setScreen("workspace");
        }} />}
        {screen === "workspace" && <Workspace key={`recovery-${taskId}-${locale}`} locale={locale} condition={condition} taskId={taskId} phase="recovery" problemState={problemState} participantNotes={recoveryAssessment.participantNotes || ""} memo={memo} setMemo={setMemo} chat={chat} setChat={setChat} setScreen={setScreen} testMode={testMode} t={t} />}
        {screen === "post_survey" && <RecoveryPostSurveyPage locale={locale} onSubmit={(postSurvey) => {
          const next = { ...recoveryAssessment, postSurvey };
          setRecoveryAssessment(next);
          saveRemoteStudySnapshot({ taskAssessment: next });
          eventLog("recovery_post_survey_submitted", postSurvey, { stage: "post_recovery_survey", targetType: "survey", targetId: "recovery_experience_v1" });
          setScreen("complete");
        }} />}
        {screen === "complete" && <Complete locale={locale} status={completionStatus} retry={() => setCompletionStatus("saving")} setScreen={setScreen} t={t} />}
      </main>
    </>
  );
}

function LanguageChoice({ locale, setLocale }: { locale: Locale; setLocale: (l: Locale) => void }) {
  return <div className="flex rounded-lg bg-muted p-1" role="group" aria-label="Language">
    {(["zh-CN", "en"] as Locale[]).map(l => <button key={l} onClick={() => setLocale(l)} className={`min-h-10 rounded-md px-4 text-sm font-medium transition ${locale === l ? "bg-white text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{l === "zh-CN" ? "中文" : "English"}</button>)}
  </div>;
}

function Landing({
  locale,
  setLocale,
  participantId,
  startError,
  onStart,
  t,
}: {
  locale: Locale;
  setLocale: (l: Locale) => void;
  participantId: string;
  startError: string;
  onStart: (condition: Condition) => Promise<void>;
  t: typeof copy[Locale];
}) {
  const [consent, setConsent] = useState(false);
  const [conditionChoice, setConditionChoice] = useState<Condition | null>(null);
  const [submitting, setSubmitting] = useState(false);
  return <div className="min-h-screen bg-[#f8f7f3]">
    <header className="mx-auto flex h-20 max-w-6xl items-center justify-between px-8"><Brand /><LanguageChoice locale={locale} setLocale={setLocale} /></header>
    <section className="mx-auto grid max-w-6xl grid-cols-[1.08fr_.92fr] items-center gap-16 px-8 py-20">
      <div><h1 className="max-w-xl text-[54px] font-semibold leading-[1.08] tracking-[-.04em]">{t.study}</h1></div>
      <div className="rounded-2xl border bg-white/90 p-8 shadow-[0_24px_70px_rgba(34,42,70,.10)] backdrop-blur">
        <label className="text-sm font-semibold" htmlFor="anonymous-id">{t.anonymous}</label>
        <div id="anonymous-id" className="mt-3 rounded-xl border bg-muted/35 px-4 py-3 font-mono text-base font-semibold tracking-wider text-primary">{participantId || (locale==="zh-CN"?"正在生成…":"Generating…")}</div>
        <p className="mt-2 text-xs text-muted-foreground">{locale==="zh-CN"?"编号由系统自动生成，无需填写。":"Generated automatically; no entry is required."}</p>
        <fieldset className="mt-7">
          <legend className="text-sm font-semibold">{locale==="zh-CN"?"选择实验方式":"Choose a condition"}</legend>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{locale==="zh-CN"?"研究任务由系统随机分配；这里选定的实验方式会直接生效。":"The research task is still assigned randomly; the condition you pick here is used as-is."}</p>
          <div className="mt-3 grid gap-2">
            {([
              {value:"rmw",zh:"方式一",en:"Method 1"},
              {value:"rmw_no_summary",zh:"方式二",en:"Method 2"},
              {value:"summary_only",zh:"方式三",en:"Method 3"},
            ] as const).map(option=><label key={option.value} className={`cursor-pointer rounded-xl border px-3 py-3 text-sm transition ${conditionChoice===option.value?"border-primary bg-secondary/65 text-primary":"bg-white hover:border-primary/45"}`}>
              <input type="radio" name="condition" value={option.value} checked={conditionChoice===option.value} onChange={()=>setConditionChoice(option.value)} className="mr-2 accent-[var(--primary)]"/>
              {locale==="zh-CN"?option.zh:option.en}
            </label>)}
          </div>
        </fieldset>
        <label className="mt-7 flex cursor-pointer items-start gap-3 text-sm leading-6"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} className="mt-1 size-4 accent-[var(--primary)]"/><span>{t.consent}</span></label>
        <TimedButton seconds={5} ready={consent&&Boolean(participantId)&&Boolean(conditionChoice)&&!submitting} locale={locale} label={t.enter} blockedLabel={submitting?(locale==="zh-CN"?"正在创建本次运行…":"Setting up your session…"):!conditionChoice?(locale==="zh-CN"?"请先选择实验方式":"Choose a condition first"):(locale==="zh-CN"?"请勾选同意":"Provide consent to continue")} onClick={()=>{if(!conditionChoice||submitting)return;setSubmitting(true);onStart(conditionChoice).finally(()=>setSubmitting(false));}} className="mt-7 h-12 w-full" />
        {startError && <p role="alert" className="mt-3 text-center text-xs text-destructive">{startError}</p>}
        <p className="mt-3 text-center text-[11px] text-muted-foreground">{locale==="zh-CN"?"按钮将在阅读时间结束且信息完整后开放。":"The button unlocks after the reading time and required fields are complete."}</p>
      </div>
    </section>
  </div>;
}

function TaskBrief({locale,taskId,setScreen}:{locale:Locale;taskId:ResearchTaskId;setScreen:(screen:Screen)=>void}) {
  const task=getResearchTask(taskId);
  return <CenteredShell title={locale==="zh-CN"?"研究任务说明":"Research task brief"}>
    <Badge variant="secondary" className="rounded-full text-primary">{task.label[locale]}</Badge>
    <p className="mt-5 text-lg font-semibold leading-8">{task.question[locale]}</p>
    <p className="mt-4 rounded-xl bg-secondary/55 p-4 text-sm leading-7 text-secondary-foreground">{task.overview[locale]}</p>
    <div className="mt-6">
      <h2 className="text-sm font-semibold">{locale==="zh-CN"?"第一阶段包含 3 个目标，每个目标有多个评价点：":"Phase 1 contains three goals, each with multiple evaluation criteria:"}</h2>
      <div className="mt-3 space-y-3">{task.phaseOneGoals.map((goal,index)=><section key={goal.id} className="rounded-xl border bg-white p-4">
        <div className="flex items-center gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-primary">{index+1}</span><h3 className="text-sm font-semibold">{goal.title[locale]}</h3></div>
        <ul className="ml-10 mt-3 space-y-2 text-xs leading-5 text-muted-foreground">{goal.criteria.map(criterion=><li key={criterion[locale]} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/55"/><span>{criterion[locale]}</span></li>)}</ul>
      </section>)}</div>
    </div>
    <div className="mt-8 grid grid-cols-[auto_1fr] gap-3">
      <Button variant="outline" onClick={()=>setScreen("landing")}>{locale==="zh-CN"?"返回":"Back"}</Button>
      <TimedButton seconds={8} locale={locale} label={locale==="zh-CN"?"确认并继续":"Confirm and continue"} className="h-11" onClick={()=>{eventLog("task_brief_confirmed",{taskId},{stage:"task_setup"});setScreen("survey")}} />
    </div>
  </CenteredShell>;
}

type SurveyItem = {
  id: string;
  text: string;
  anchors: string[];
  subscale?: string;
};

type SurveyGroup = {
  id: string;
  title: string;
  instruction: string;
  source: string;
  sourceUrl?: string;
  sourceLabel?: string;
  items: SurveyItem[];
};

function Survey({ locale, taskId, setScreen, t }: { locale:Locale;taskId:ResearchTaskId;setScreen:(s:Screen)=>void;t:typeof copy[Locale] }) {
  const task=getResearchTask(taskId);
  const agreementZh=["非常不同意","不同意","一般","同意","非常同意"];
  const confidenceZh=["完全没信心","较没信心","一般","较有信心","非常有信心"];
  const familiarityZh=["完全不符合","较不符合","一般","较符合","非常符合"];
  const exposureZh=["从未","很少","偶尔","多次","经常"];
  const agreementEn=["Strongly disagree","Disagree","Neutral","Agree","Strongly agree"];
  const confidenceEn=["No confidence","Low confidence","Moderate","High confidence","Complete confidence"];
  const familiarityEn=["Not at all","Slightly","Moderately","Very","Extremely"];
  const exposureEn=["Never","Rarely","Occasionally","Several times","Often"];

  const groups:SurveyGroup[] = locale === "zh-CN" ? [
    {
      id:"ai_use_experience",
      title:"第 1 部分",
      instruction:"请根据过去 3 个月的实际使用情况和参加本研究前的经历作答。",
      source:"AI 使用题参考 Abbas, Jam, & Khan (2024) 的 ChatGPT Usage Scale 情境化改编；议题接触经历为研究者自编单题。均为事实型协变量，不合成总分。",
      sourceUrl:"https://doi.org/10.1186/s41239-024-00444-7",
      sourceLabel:"DOI: 10.1186/s41239-024-00444-7",
      items:[
        {id:"ai_use_frequency",text:"过去 3 个月，你通常多频繁使用生成式 AI 工具（如 DeepSeek、ChatGPT或通义千问）？",anchors:["从未","少于每周 1 次","每周 1–2 次","每周 3–4 次","每周 5 天及以上"]},
        {id:"ai_task_breadth",text:"过去 3 个月，你使用过 AI 完成多少类学习或科研任务？任务类别包括：检索阅读、整理总结、写作修改、数据分析或编程。",anchors:["0 类","1 类","2 类","3 类","4 类及以上"]},
        {id:"ai_research_frequency",text:"过去 3 个月，你在课程论文、科研项目或研究写作中使用 AI 的频率如何？",anchors:["从未","很少","有时","经常","几乎每次任务"]},
        {id:"topic_exposure",text:`在参加本研究前，你阅读、讨论或接触"${task.familiarity[locale]}"相关案例或材料的频率如何？`,anchors:exposureZh},
      ],
    },
    {
      id:"ails_ccs",
      title:"第 2 部分",
      instruction:"请根据每句话与你实际情况的符合程度作答。",
      source:"来源：Ma, S., & Chen, Z. (2024), Artificial Intelligence Literacy Scale for Chinese College Students（AILS-CCS）, IEEE Access, 12, 146419–146429。保留原量表 15 题、四维度和 5 点结构；当前中文措辞为本研究工作译本，正式实验前仍需与作者版本核对并进行预测试。",
      sourceUrl:"https://doi.org/10.1109/ACCESS.2024.3468378",
      sourceLabel:"DOI: 10.1109/ACCESS.2024.3468378",
      items:[
        {id:"ails_awareness_1",subscale:"认知",text:"我理解人工智能的定义。",anchors:agreementZh},
        {id:"ails_awareness_2",subscale:"认知",text:"我熟悉人工智能的一些基本原理（如线性模型、决策树和机器学习）。",anchors:agreementZh},
        {id:"ails_awareness_3",subscale:"认知",text:"我理解人工智能如何感知外部世界（如视觉、听觉）以执行不同任务。",anchors:agreementZh},
        {id:"ails_awareness_4",subscale:"认知",text:"我能比较与人工智能有关的不同概念（如深度学习与机器学习的区别）。",anchors:agreementZh},
        {id:"ails_usage_1",subscale:"使用",text:"我能够熟练使用人工智能应用或产品。",anchors:agreementZh},
        {id:"ails_usage_2",subscale:"使用",text:"我能使用人工智能应用或产品帮助解决日常生活中的问题。",anchors:agreementZh},
        {id:"ails_usage_3",subscale:"使用",text:"我能使用人工智能应用或产品辅助学习。",anchors:agreementZh},
        {id:"ails_evaluation_1",subscale:"评价",text:"我能从人工智能提供的多种方案中选择适当的方案。",anchors:agreementZh},
        {id:"ails_evaluation_2",subscale:"评价",text:"我能评价不同人工智能应用或产品的局限性。",anchors:agreementZh},
        {id:"ails_evaluation_3",subscale:"评价",text:"我能识别人工智能生成内容中的偏见。",anchors:agreementZh},
        {id:"ails_evaluation_4",subscale:"评价",text:"我会对人工智能生成的内容保持怀疑或谨慎。",anchors:agreementZh},
        {id:"ails_ethics_1",subscale:"伦理",text:"使用人工智能应用或产品时，我始终遵守伦理原则。",anchors:agreementZh},
        {id:"ails_ethics_2",subscale:"伦理",text:"使用人工智能应用或产品时，我始终关注隐私与信息安全问题。",anchors:agreementZh},
        {id:"ails_ethics_3",subscale:"伦理",text:"我能批判性反思人工智能对个人与社会的影响。",anchors:agreementZh},
        {id:"ails_ethics_4",subscale:"伦理",text:"我始终警惕人工智能技术被滥用。",anchors:agreementZh},
      ],
    },
    {
      id:"research_self_efficacy",
      title:"第 3 部分 A",
      instruction:"请根据你目前的真实感受和已有经验作答。",
      source:"依据 RSES 的问题概念化维度进行任务化改编（Bieschke, Bishop, & Garcia, 1996），不按原量表总分计分。",
      sourceUrl:"https://doi.org/10.1177/106907279600400104",
      sourceLabel:"DOI: 10.1177/106907279600400104",
      items:[
        {id:"research_self_efficacy_1",subscale:"研究任务自我效能",text:"我有信心从相互冲突的材料中界定一个可研究的问题。",anchors:confidenceZh},
        {id:"research_self_efficacy_2",subscale:"研究任务自我效能",text:"我有信心比较至少两个不同的问题框架。",anchors:confidenceZh},
        {id:"research_self_efficacy_3",subscale:"研究任务自我效能",text:"我有信心提出可验证的假设，并指出仍不确定之处。",anchors:confidenceZh},
        {id:"research_self_efficacy_4",subscale:"研究任务自我效能",text:"我有信心在现实约束下设计可行的验证方案。",anchors:confidenceZh},
      ],
    },
    {
      id:"subjective_prior_knowledge",
      title:"第 3 部分 B",
      instruction:"请根据你目前的真实感受和已有经验作答。",
      source:"情境化改编自 Flynn & Goldsmith (1999) 的 Subjective Knowledge Scale（5 题单维度），已将目标领域替换为本研究议题；“曾阅读/讨论过相关案例”不计入本量表，已作为接触经历移至第 1 部分。",
      sourceUrl:"https://doi.org/10.1016/S0148-2963(98)00057-5",
      sourceLabel:"DOI: 10.1016/S0148-2963(98)00057-5",
      items:[
        {id:"subjective_prior_knowledge_1",subscale:"议题主观先验知识",text:`我对"${task.familiarity[locale]}"这一议题了解较多。`,anchors:familiarityZh},
        {id:"subjective_prior_knowledge_2",subscale:"议题主观先验知识",text:`总体而言，我认为自己比较了解"${task.familiarity[locale]}"这一议题。`,anchors:familiarityZh},
        {id:"subjective_prior_knowledge_3",subscale:"议题主观先验知识",text:"与一般大学生相比，我对这一议题了解得更多。",anchors:familiarityZh},
        {id:"subjective_prior_knowledge_4",subscale:"议题主观先验知识",text:"如果讨论这一议题，我认为自己能够较熟悉地参与讨论。",anchors:familiarityZh},
        {id:"subjective_prior_knowledge_5",subscale:"议题主观先验知识",text:"即使不查阅额外资料，我也能较清楚地说明这一议题的基本问题。",anchors:familiarityZh},
      ],
    },
  ] : [
    {
      id:"ai_use_experience",
      title:"Part 1",
      instruction:"Answer based on your actual use during the past three months and your experience before joining this study.",
      source:"AI-use items are a contextual adaptation of the ChatGPT Usage Scale (Abbas, Jam, & Khan, 2024); the topic-exposure item is a researcher-authored single item. All are factual covariates, not combined into a total score.",
      sourceUrl:"https://doi.org/10.1186/s41239-024-00444-7",
      sourceLabel:"DOI: 10.1186/s41239-024-00444-7",
      items:[
        {id:"ai_use_frequency",text:"During the past three months, how often did you typically use generative-AI tools such as DeepSeek, ChatGPT, or Qwen?",anchors:["Never","Less than weekly","1–2 times a week","3–4 times a week","5+ days a week"]},
        {id:"ai_task_breadth",text:"During the past three months, for how many types of learning or research tasks did you use AI? Categories include searching/reading, organizing/summarizing, writing/revising, and data analysis/coding.",anchors:["0 types","1 type","2 types","3 types","4+ types"]},
        {id:"ai_research_frequency",text:"During the past three months, how often did you use AI for course papers, research projects, or research writing?",anchors:["Never","Rarely","Sometimes","Often","Almost every task"]},
        {id:"topic_exposure",text:`Before joining this study, how often had you read, discussed, or otherwise encountered cases or materials about "${task.familiarity.en}"?`,anchors:exposureEn},
      ],
    },
    {
      id:"ails_ccs",
      title:"Part 2",
      instruction:"Answer according to how closely each statement matches your actual situation.",
      source:"Source: Ma, S., & Chen, Z. (2024), Artificial Intelligence Literacy Scale for Chinese College Students (AILS-CCS), IEEE Access, 12, 146419–146429. This page retains the 15-item, four-dimension, five-point structure.",
      sourceUrl:"https://doi.org/10.1109/ACCESS.2024.3468378",
      sourceLabel:"DOI: 10.1109/ACCESS.2024.3468378",
      items:[
        {id:"ails_awareness_1",subscale:"Awareness",text:"I understand the definition of artificial intelligence.",anchors:agreementEn},
        {id:"ails_awareness_2",subscale:"Awareness",text:"I am familiar with underlying principles of artificial intelligence, such as linear models, decision trees, and machine learning.",anchors:agreementEn},
        {id:"ails_awareness_3",subscale:"Awareness",text:"I understand how artificial intelligence perceives the world, such as through seeing and hearing, to perform tasks.",anchors:agreementEn},
        {id:"ails_awareness_4",subscale:"Awareness",text:"I can compare concepts related to artificial intelligence, such as deep learning and machine learning.",anchors:agreementEn},
        {id:"ails_usage_1",subscale:"Usage",text:"I am proficient in using artificial-intelligence applications or products.",anchors:agreementEn},
        {id:"ails_usage_2",subscale:"Usage",text:"I can use artificial-intelligence applications or products to help solve problems in daily life.",anchors:agreementEn},
        {id:"ails_usage_3",subscale:"Usage",text:"I can use artificial-intelligence applications or products to support my learning.",anchors:agreementEn},
        {id:"ails_evaluation_1",subscale:"Evaluation",text:"I can select an appropriate solution from options provided by artificial intelligence.",anchors:agreementEn},
        {id:"ails_evaluation_2",subscale:"Evaluation",text:"I can evaluate the limitations of different artificial-intelligence applications or products.",anchors:agreementEn},
        {id:"ails_evaluation_3",subscale:"Evaluation",text:"I can identify biases in content generated by artificial intelligence.",anchors:agreementEn},
        {id:"ails_evaluation_4",subscale:"Evaluation",text:"I remain skeptical or cautious about content generated by artificial intelligence.",anchors:agreementEn},
        {id:"ails_ethics_1",subscale:"Ethics",text:"I always adhere to ethical principles when using artificial-intelligence applications or products.",anchors:agreementEn},
        {id:"ails_ethics_2",subscale:"Ethics",text:"I am always alert to privacy and information-security issues when using artificial-intelligence applications or products.",anchors:agreementEn},
        {id:"ails_ethics_3",subscale:"Ethics",text:"I can critically reflect on the impact of artificial intelligence on individuals and society.",anchors:agreementEn},
        {id:"ails_ethics_4",subscale:"Ethics",text:"I am always alert to the misuse of artificial-intelligence technology.",anchors:agreementEn},
      ],
    },
    {
      id:"research_self_efficacy",
      title:"Part 3A",
      instruction:"Answer based on your current feelings and prior experience.",
      source:"Task-specific adaptation informed by the RSES conceptualization dimension (Bieschke, Bishop, & Garcia, 1996); not scored against the original scale's total.",
      sourceUrl:"https://doi.org/10.1177/106907279600400104",
      sourceLabel:"DOI: 10.1177/106907279600400104",
      items:[
        {id:"research_self_efficacy_1",subscale:"Research-task self-efficacy",text:"I am confident that I can define a researchable problem from conflicting materials.",anchors:confidenceEn},
        {id:"research_self_efficacy_2",subscale:"Research-task self-efficacy",text:"I am confident that I can compare at least two different problem framings.",anchors:confidenceEn},
        {id:"research_self_efficacy_3",subscale:"Research-task self-efficacy",text:"I am confident that I can form testable hypotheses and identify what remains uncertain.",anchors:confidenceEn},
        {id:"research_self_efficacy_4",subscale:"Research-task self-efficacy",text:"I am confident that I can design a feasible test under real-world constraints.",anchors:confidenceEn},
      ],
    },
    {
      id:"subjective_prior_knowledge",
      title:"Part 3B",
      instruction:"Answer based on your current feelings and prior experience.",
      source:"Contextual adaptation of the Subjective Knowledge Scale (Flynn & Goldsmith, 1999; 5 items, single dimension), with the target domain replaced by this study's topic. \"Have read or discussed related cases\" is not part of this scale — it has moved to Part 1 as a topic-exposure item.",
      sourceUrl:"https://doi.org/10.1016/S0148-2963(98)00057-5",
      sourceLabel:"DOI: 10.1016/S0148-2963(98)00057-5",
      items:[
        {id:"subjective_prior_knowledge_1",subscale:"Subjective prior topic knowledge",text:`I know a lot about "${task.familiarity.en}".`,anchors:familiarityEn},
        {id:"subjective_prior_knowledge_2",subscale:"Subjective prior topic knowledge",text:`Overall, I consider myself fairly knowledgeable about "${task.familiarity.en}".`,anchors:familiarityEn},
        {id:"subjective_prior_knowledge_3",subscale:"Subjective prior topic knowledge",text:"Compared with the average university student, I know more about this topic.",anchors:familiarityEn},
        {id:"subjective_prior_knowledge_4",subscale:"Subjective prior topic knowledge",text:"If this topic came up in discussion, I could take part with reasonable familiarity.",anchors:familiarityEn},
        {id:"subjective_prior_knowledge_5",subscale:"Subjective prior topic knowledge",text:"Even without consulting additional materials, I could clearly explain the basic issues of this topic.",anchors:familiarityEn},
      ],
    },
  ];
  const flatItems=groups.flatMap(group=>group.items.map(item=>({id:item.id,groupId:group.id,item})));
  const [responses,setResponses]=useState<Record<string,number>>({});
  const complete=flatItems.every(item=>responses[item.id]);
  return <CenteredShell title={t.pretitle}>
    <p className="mb-7 text-sm leading-6 text-muted-foreground">{locale==="zh-CN"?"本页共 28 道题。请根据真实情况作答，每题选择一个最符合你的选项。":"This page contains 28 questions. Answer based on your actual situation and select the option that fits you best."}</p>
    <div className="space-y-8">
      {groups.map(group=><section key={group.id} className="rounded-xl border bg-[#fcfcfd] p-5">
        <h2 className="font-semibold">{group.title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{group.instruction}</p>
        <div className="mt-5 space-y-6">
          {group.items.map((item,itemIndex)=>{
            return <fieldset key={item.id}>
              <legend className="text-sm font-medium leading-6">{itemIndex+1}. {item.text}</legend>
              <div className="mt-3 grid grid-cols-5 gap-2">
                {item.anchors.map((anchor,index)=>{
                  const value=index+1;
                  const selected=responses[item.id]===value;
                  return <button type="button" key={anchor} aria-pressed={selected} aria-label={`${value} - ${anchor}`} onClick={()=>{setResponses(current=>({...current,[item.id]:value}));eventLog("pre_survey_item_answered",{taskId,itemId:item.id,groupId:group.id,subscale:item.subscale,value},{stage:"pre_survey",targetType:"survey_item",targetId:item.id})}} className={`min-h-16 rounded-lg border px-2 py-2 text-center transition ${selected?"border-primary bg-primary text-white shadow-sm":"bg-white hover:border-primary/50 hover:bg-secondary/40"}`}><span className="block text-base font-semibold">{value}</span><span className={`mt-1 block text-[10px] leading-4 ${selected?"text-white/85":"text-muted-foreground"}`}>{anchor}</span></button>
                })}
              </div>
            </fieldset>;
          })}
        </div>
      </section>)}
    </div>
    <TimedButton seconds={8} ready={complete} locale={locale} label={t.next} blockedLabel={locale==="zh-CN"?"请完成全部题目":"Answer every question"} onClick={()=>{eventLog("pre_survey_completed",{taskId,responses,constructs:groups.map(group=>group.id),aiLiteracyScale:"AILS-CCS_15-item_5-point"},{stage:"pre_survey"});saveRemoteStudySnapshot({preSurvey:responses});setScreen("work")}} className="mt-10 h-12 w-full" />
  </CenteredShell>;
}

function CenteredShell({step,title,children}:{step?:string;title:string;children:React.ReactNode}) { return <div className="min-h-screen bg-[#f7f6f2]"><header className="mx-auto flex h-20 max-w-5xl items-center justify-between px-8"><Brand/>{step?<span className="font-mono text-xs text-muted-foreground">{step}</span>:null}</header><section className="mx-auto max-w-2xl px-8 py-16"><h1 className="mb-10 text-3xl font-semibold tracking-tight">{title}</h1><div className="rounded-2xl border bg-white p-8 shadow-[0_18px_60px_rgba(35,40,65,.07)]">{children}</div></section></div> }

function Brand(){return <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-primary text-white"><Brain size={23} weight="duotone"/></div><div><div className="font-semibold tracking-tight">RMW</div><div className="text-[10px] uppercase tracking-[.16em] text-muted-foreground">Reasoning Memory</div></div></div>}

function RecoverySupportPage({ locale, condition, taskId, problemState, participantNotes, testMode, onContinue }: { locale: Locale; condition: Condition; taskId: ResearchTaskId; problemState: ProblemStateSnapshot | null; participantNotes: string; testMode: boolean; onContinue: (readiness: RecoveryReadiness) => void }) {
  const cards = useMemo(() => problemState ? toReasoningCards(problemState, locale) : [], [locale, problemState]);
  const relations = useMemo(() => problemState ? toCardRelations(problemState) : [], [problemState]);
  const [activeTab, setActiveTab] = useState<"brief" | "cards" | "network">(() => condition === "rmw_no_summary" ? "cards" : "brief");
  const [selected, setSelected] = useState(() => cards[0]?.id || "");
  const renderedRef = useRef(false);
  const [renderedAt] = useState(() => { const value = new Date(); return { iso: value.toISOString(), milliseconds: value.getTime() }; });
  useEffect(() => {
    if (renderedRef.current) return;
    renderedRef.current = true;
    eventLog("recovery_assessment_support_rendered", { condition, taskId, cardCount: cards.length, relationCount: relations.length }, { stage: "recovery_assessment", targetType: "recovery_support", targetId: condition });
  }, [cards.length, condition, relations.length, taskId]);
  const summary = problemStateToContinuousSummary(problemState?.cards || [], locale);
  const viewedRef = useRef(new Set<string>([condition === "summary_only" ? "summary" : condition === "rmw_no_summary" ? "notes" : "brief"]));
  useEffect(() => {
    if (viewedRef.current.has(activeTab)) return;
    viewedRef.current.add(activeTab);
    eventLog("recovery_assessment_tab_viewed", { tab: activeTab }, { stage: "recovery_assessment", targetType: "recovery_tab", targetId: activeTab });
  }, [activeTab]);

  return <main className="flex min-h-screen flex-col bg-[#f7f6f2] p-6">
    <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-hidden rounded-2xl border bg-white shadow-[0_18px_60px_rgba(35,40,65,.08)]">
      <header className="flex items-start justify-between gap-4 border-b px-6 py-5"><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-primary">{locale === "zh-CN" ? "恢复支持 · 新证据尚未开放" : "Recovery support · New evidence remains hidden"}</p><h1 className="mt-2 text-xl font-semibold">{locale === "zh-CN" ? "请恢复中断前的推理位置" : "Recover the pre-interruption reasoning position"}</h1><p className="mt-1 text-xs leading-5 text-muted-foreground">{locale === "zh-CN" ? "当你认为已经恢复到可以继续推理的程度时点击下方按钮。系统会记录实际用时；此页面不会展示新增证据。" : "Click the button when you feel ready to continue reasoning. Actual readiness time is recorded; no new evidence is shown here."}</p></div><Brain size={30} className="text-primary" /></header>
      {!cards.length && condition === "rmw" ? <div className="m-6 flex-1 rounded-xl border bg-muted/30 p-5 text-sm text-muted-foreground">{locale === "zh-CN" ? "本次运行没有可用的恢复状态。请记录该运行用于数据质量审核。" : "No recovery state is available for this run. Flag it for data-quality review."}</div> : condition === "rmw_no_summary" ? <div className="m-6 flex-1 overflow-auto rounded-xl border bg-amber-50/50 p-6"><p className="text-xs font-semibold uppercase tracking-wider text-amber-900">{locale === "zh-CN" ? "你在中断前写下的笔记" : "Your pre-interruption notes"}</p><p className="mt-4 whitespace-pre-wrap text-sm leading-7">{participantNotes || (locale === "zh-CN" ? "未保存用户笔记；本次运行应标记为数据不完整。" : "No user notes were saved; flag this run as incomplete data.")}</p></div> : condition === "summary_only" ? <div className="m-6 flex-1 overflow-auto rounded-xl bg-muted/60 p-6"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">AI Summary</p><p className="mt-4 max-w-3xl whitespace-pre-wrap text-sm leading-8">{summary}</p></div> : <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "brief" | "cards" | "network")} className="flex min-h-0 flex-1 flex-col">
        <div className="border-b px-6 py-3"><TabsList>{condition === "rmw" && <TabsTrigger value="brief">{locale === "zh-CN" ? "恢复摘要" : "Resume brief"}</TabsTrigger>}<TabsTrigger value="cards">{locale === "zh-CN" ? "推理卡片" : "Reasoning cards"}</TabsTrigger><TabsTrigger value="network">{locale === "zh-CN" ? "知识网络" : "Knowledge network"}</TabsTrigger></TabsList></div>
        {condition === "rmw" && <TabsContent value="brief" className="m-0 min-h-0 flex-1 overflow-auto"><ResumeBrief locale={locale} cards={cards} t={copy[locale]} /></TabsContent>}
        <TabsContent value="cards" className="m-0 min-h-0 flex-1 overflow-auto p-5"><div className="mx-auto max-w-3xl"><GoalHierarchy cards={cards} locale={locale} selected={selected} setSelected={setSelected} /><div className="mt-4 space-y-2">{cards.filter((card) => card.cardType !== "goal").map((card) => <button type="button" key={card.id} onClick={() => { setSelected(card.id); eventLog("recovery_assessment_card_viewed", { cardId: card.id, cardType: card.cardType }, { stage: "recovery_assessment", targetType: "reasoning_card", targetId: card.id }); }} className={`w-full rounded-lg border p-3 text-left transition ${selected === card.id ? "border-indigo-300 bg-indigo-50/55 ring-2 ring-indigo-100" : "bg-white hover:bg-muted/30"}`}><div className="flex items-center gap-2"><Badge variant="outline" className="text-[9px]">{card.cardType}</Badge><Badge variant="secondary" className="text-[9px]">{card.status}</Badge></div><p className="mt-2 text-sm font-medium leading-5">{card.content[locale]}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{card.detail[locale]}</p>{card.sourceRefs.length > 0 && <p className="mt-2 text-[10px] text-primary">{locale === "zh-CN" ? "来源" : "Source"}：{card.sourceRefs.map((source) => source.label).join(" · ")}</p>}</button>)}</div></div></TabsContent>
        <TabsContent value="network" className="m-0 min-h-0 flex-1"><KnowledgeNetwork locale={locale} cards={cards} relations={relations} selected={selected} setSelected={setSelected} /></TabsContent>
      </Tabs>}
      <div className="shrink-0 border-t bg-white px-6 py-4"><TimedButton seconds={testMode ? 1 : 5} ready={condition === "rmw_no_summary" ? Boolean(participantNotes.trim()) : condition === "summary_only" ? Boolean(summary.trim()) : cards.length > 0} locale={locale} label={locale === "zh-CN" ? "我已恢复，可以开始支持后测评" : "I am ready for the supported assessment"} blockedLabel={locale === "zh-CN" ? "本次运行缺少对应恢复材料" : "Assigned recovery material is missing"} className="h-11 w-full" onClick={() => {
        const readyAt = new Date().toISOString();
        const readiness = { supportRenderedAt: renderedAt.iso, readyAt, latencyMs: Date.now() - renderedAt.milliseconds, viewedSections: [...viewedRef.current] };
        eventLog("recovery_ready", { condition, taskId, latencyMs: readiness.latencyMs, viewedSections: readiness.viewedSections }, { stage: "recovery_assessment", targetType: "recovery_support", targetId: condition });
        onContinue(readiness);
      }} /></div>
    </div>
  </main>;
}

function RecoveryAcceptFloat({
  locale,
  cards,
  t,
  onAccept,
}: {
  locale: Locale;
  cards: ReasoningCard[];
  t: typeof copy[Locale];
  onAccept: (values: { currentGoal: string; position: string; uncertain: string }) => void;
}) {
  const main = cards.find((card) => card.goalLevel === "main");
  const positionSeed = cards
    .filter((card) => card.goalLevel === "subgoal" && card.status !== "expired")
    .slice(0, 2)
    .map((card) => card.content[locale])
    .join(locale === "zh-CN" ? "；" : "; ");
  const uncertain = cards.find((card) => card.status === "uncertain")
    || cards.find((card) => card.id === "uncertain");
  const fields = [
    { key: "currentGoal", label: t.currentGoal, hint: t.currentGoalHint, seed: main?.content[locale] || "" },
    { key: "position", label: t.position, hint: t.positionHint, seed: positionSeed },
    { key: "uncertain", label: t.uncertain, hint: t.uncertainHint, seed: uncertain?.content[locale] || "" },
  ] as const;
  const [responses, setResponses] = useState(() => fields.map((field) => field.seed));
  const complete = responses.every((response) => response.trim());
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/45 p-6 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="recovery-accept-title">
    <div className="w-full max-w-xl rounded-2xl border bg-white p-7 shadow-[0_28px_90px_rgba(10,18,44,.28)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">{locale === "zh-CN" ? "恢复阶段 · 接受" : "Recovery · Accept"}</p>
          <h1 id="recovery-accept-title" className="mt-2 text-2xl font-semibold tracking-tight">{t.recoveryAcceptTitle}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t.recoveryAcceptSub}</p>
        </div>
        <Brand />
      </div>
      <div className="mt-6 space-y-4">
        {fields.map((field, index) => (
          <label key={field.key} className="block">
            <span className="mb-1 block text-sm font-medium">{index + 1}. {field.label}</span>
            <span className="mb-2 block text-xs leading-5 text-muted-foreground">{field.hint}</span>
            <Textarea
              rows={2}
              placeholder="…"
              value={responses[index]}
              onChange={(event) => setResponses((current) => current.map((value, i) => i === index ? event.target.value : value))}
            />
          </label>
        ))}
      </div>
      <TimedButton
        seconds={5}
        ready={complete}
        locale={locale}
        label={t.recoveryAcceptAction}
        blockedLabel={t.recoveryAcceptBlocked}
        className="mt-7 h-12 w-full"
        onClick={() => onAccept({
          currentGoal: responses[0].trim(),
          position: responses[1].trim(),
          uncertain: responses[2].trim(),
        })}
      />
    </div>
  </div>;
}

function WorkspaceTour({locale,condition,onComplete}:{locale:Locale;condition:Condition;onComplete:()=>void}) {
  const zhSteps:{target:string;title:string;body:string}[]=[
    {target:"materials",title:"先阅读实验材料",body:"这里是当前任务的证据与约束材料。点击不同材料查看全文，系统会记录阅读进度。"},
    {target:"memo",title:"在工作区记录思考",body:"中间的工作区用于写下候选框架、假设、不确定点和排除方向。内容会持续保存；拖动两侧的竖向分隔条可调整各列宽度。"},
    {target:"goals",title:"检查右上角目标",body:"右上角用于逐项核对第一阶段目标。目标内容可独立上下滚动。"},
  ];
  const enSteps:{target:string;title:string;body:string}[]=[
    {target:"materials",title:"Read the evidence first",body:"These sources describe the current task evidence and constraints. Open each one to read it; reading progress is recorded."},
    {target:"memo",title:"Record reasoning in the workspace",body:"Use the central workspace for candidate framings, hypotheses, uncertainties, and rejected directions. Its content is continuously saved; drag either vertical divider to resize the columns."},
    {target:"goals",title:"Check the upper-right goals",body:"Use the upper-right window to check Phase 1 requirements. Its content scrolls independently."},
  ];
  if(condition==="rmw_no_summary"){
    zhSteps.push({target:"chat",title:"本条件不提供 AI 助手",body:"你被分配到用户自主笔记条件：全程不能使用 AI 对话，请完全依靠自己在工作区中的记录来推进和恢复思路。"});
    enSteps.push({target:"chat",title:"No AI assistant in this condition",body:"You were assigned to the Self-Notes condition: no AI chat is available at any point. Rely entirely on your own notes in the workspace to reason and to resume later."});
  }else{
    zhSteps.push({target:"chat",title:"与 AI 比较问题框架",body:"三种恢复方式在第一阶段使用相同的 AI、材料和工作区。请要求 AI 引用材料编号，并区分证据、推断和仍需验证的假设。"});
    enSteps.push({target:"chat",title:"Compare framings with AI",body:"Every condition uses the same AI, materials, and workspace in Phase 1. Ask the AI to cite source IDs and distinguish evidence, inference, and unverified assumptions."});
  }
  const steps=locale==="zh-CN"?zhSteps:enSteps;
  const [index,setIndex]=useState(0);
  const [rect,setRect]=useState<DOMRect|null>(null);
  const step=steps[index];

  useEffect(()=>{
    const update=()=>{
      const element=document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      setRect(element?.getBoundingClientRect()||null);
    };
    update();
    window.addEventListener("resize",update);
    eventLog("workspace_tour_step_viewed",{step:index+1,target:step.target},{stage:"tutorial",targetType:"workspace_region",targetId:step.target});
    return()=>window.removeEventListener("resize",update);
  },[index,step.target]);

  if(!rect)return null;
  const panelWidth=340;
  const preferredLeft=rect.right+24;
  const panelLeft=preferredLeft+panelWidth<=window.innerWidth-24?preferredLeft:Math.max(24,rect.left-panelWidth-24);
  const panelTop=Math.max(86,Math.min(window.innerHeight-270,rect.top+24));
  return <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={locale==="zh-CN"?"工作区新手指引":"Workspace onboarding"}>
    <div className="absolute rounded-2xl border-2 border-white/95 transition-all duration-300" style={{left:Math.max(8,rect.left-6),top:Math.max(8,rect.top-6),width:rect.width+12,height:rect.height+12,boxShadow:"0 0 0 9999px rgba(15, 19, 32, .76)"}} />
    <div className="absolute w-[340px] rounded-2xl border border-white/20 bg-white p-6 shadow-2xl" style={{left:panelLeft,top:panelTop}}>
      <div className="flex items-center justify-between"><Badge variant="secondary">{index+1} / {steps.length}</Badge><span className="text-[10px] uppercase tracking-[.16em] text-muted-foreground">Workspace guide</span></div>
      <h2 className="mt-5 text-xl font-semibold">{step.title}</h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{step.body}</p>
      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" disabled={index===0} onClick={()=>setIndex(current=>current-1)}>{locale==="zh-CN"?"上一步":"Back"}</Button>
        <Button className="h-10 px-5" onClick={()=>{if(index<steps.length-1){setIndex(current=>current+1)}else{eventLog("workspace_tour_completed",{}, {stage:"tutorial"});onComplete()}}}>{index===steps.length-1?(locale==="zh-CN"?"开始研究":"Start research"):(locale==="zh-CN"?"下一步":"Next")}<ArrowRight/></Button>
      </div>
    </div>
  </div>;
}

function Workspace({
  locale,
  condition,
  taskId,
  phase,
  problemState,
  participantNotes = "",
  memo,
  setMemo,
  chat,
  setChat,
  setScreen,
  testMode,
  onPhaseOneCapture,
  t,
}: {
  locale: Locale;
  condition: Condition;
  taskId: ResearchTaskId;
  phase: "work" | "recovery";
  problemState: ProblemStateSnapshot | null;
  participantNotes?: string;
  memo: string;
  setMemo: (memo: string) => void;
  chat: ChatMessage[];
  setChat: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setScreen: (screen: Screen) => void;
  testMode: boolean;
  onPhaseOneCapture?: () => void;
  t: typeof copy[Locale];
}) {
  const task=getResearchTask(taskId);
  const chatDisabled=condition==="rmw_no_summary";
  const phaseDurationSeconds=phase==="work"?WORK_PHASE_DURATION_SECONDS:RECOVERY_PHASE_DURATION_SECONDS;
  const [cards,setCards]=useState<ReasoningCard[]>(()=>phase==="recovery"&&problemState?toReasoningCards(problemState,locale):[]);
  const recoveryRelations=useMemo<CardRelation[]>(()=>problemState?toCardRelations(problemState):[],[problemState]);
  const [selected,setSelected]=useState("uncertain");
  const [message,setMessage]=useState("");
  const [isLoading,setIsLoading]=useState(false);
  const [chatError,setChatError]=useState<string|null>(null);
  const [showTour,setShowTour]=useState(phase==="work");
  const [showRecoveryAccept,setShowRecoveryAccept]=useState(false);
  const [rightTopRatio,setRightTopRatio]=useState(48);
  const rightColumnRef=useRef<HTMLElement|null>(null);
  const workspaceGridRef=useRef<HTMLDivElement|null>(null);
  const [leftColumnRatio,setLeftColumnRatio]=useState(25);
  const [rightColumnRatio,setRightColumnRatio]=useState(30);
  const [remainingSeconds,setRemainingSeconds]=useState(phaseDurationSeconds);
  const countdownEndRef=useRef<number|null>(null);
  const timerExpiredLoggedRef=useRef(false);
  const onPhaseOneCaptureRef=useRef(onPhaseOneCapture);
  const centerColumnRatio=100-leftColumnRatio-rightColumnRatio;
  const timerText=`${String(Math.floor(remainingSeconds/60)).padStart(2,"0")}:${String(remainingSeconds%60).padStart(2,"0")}`;

  useEffect(()=>{
    onPhaseOneCaptureRef.current=onPhaseOneCapture;
  },[onPhaseOneCapture]);

  useEffect(()=>{
    const timeout=window.setTimeout(()=>saveRemoteStudySnapshot({memo,chat}),700);
    return()=>window.clearTimeout(timeout);
  },[chat,memo]);

  useEffect(()=>{
    if(phase!=="recovery")return;
    const timeout=window.setTimeout(()=>saveRemoteStudySnapshot({
      recoveryState:{cards,relations:recoveryRelations},
    }),700);
    return()=>window.clearTimeout(timeout);
  },[cards,phase,recoveryRelations]);

  useEffect(()=>{
    if(countdownEndRef.current===null)countdownEndRef.current=Date.now()+phaseDurationSeconds*1000;
    const updateTimer=()=>{
      const next=Math.max(0,Math.ceil(((countdownEndRef.current??Date.now())-Date.now())/1000));
      setRemainingSeconds(next);
      if(next===0&&!timerExpiredLoggedRef.current){
        timerExpiredLoggedRef.current=true;
        const stage=phase==="work"?"research_work":"recovery";
        eventLog("workspace_timer_expired",{taskId,phase,durationSeconds:phaseDurationSeconds},{stage});
        if(phase==="work"){
          onPhaseOneCaptureRef.current?.();
          eventLog("workspace_auto_advanced",{taskId,phase,nextScreen:"city_t1"},{stage});
          setScreen("city_t1");
        }
      }
    };
    updateTimer();
    const timer=window.setInterval(updateTimer,250);
    return()=>window.clearInterval(timer);
  },[condition,phase,phaseDurationSeconds,setScreen,taskId]);

  const resizeColumns=(divider:"left"|"right",clientX:number)=>{
    const bounds=workspaceGridRef.current?.getBoundingClientRect();
    if(!bounds)return;
    const pointerRatio=((clientX-bounds.left)/bounds.width)*100;
    if(divider==="left"){
      const maxLeft=100-rightColumnRatio-32;
      setLeftColumnRatio(Math.min(Math.min(36,maxLeft),Math.max(18,pointerRatio)));
    }else{
      const nextRight=100-pointerRatio;
      const maxRight=100-leftColumnRatio-32;
      setRightColumnRatio(Math.min(Math.min(42,maxRight),Math.max(24,nextRight)));
    }
  };
  const resizeRightPanels=(clientY:number)=>{
    const bounds=rightColumnRef.current?.getBoundingClientRect();
    if(!bounds)return;
    const next=((clientY-bounds.top)/bounds.height)*100;
    setRightTopRatio(Math.min(66,Math.max(34,next)));
  };
  const updateStatus=(id:string,status:EpistemicStatus)=>{setCards(cs=>cs.map(c=>c.id===id?{...c,status,revision:c.revision+1}:c));eventLog("card_status_changed",{status},{stage:"recovery",targetType:"reasoning_card",targetId:id})};
  const togglePin=(id:string)=>{setCards(cs=>cs.map(c=>c.id===id?{...c,priority:c.priority==="pinned"?"normal":"pinned",revision:c.revision+1}:c));eventLog("card_pin_toggled",{id},{stage:"recovery",targetType:"reasoning_card",targetId:id})};
  const updateContent=(id:string,value:string)=>{setCards(cs=>cs.map(c=>c.id===id?{...c,content:{...c.content,[locale]:value},revision:c.revision+1}:c));eventLog("card_content_edited",{locale},{stage:"recovery",targetType:"reasoning_card",targetId:id})};
  const acceptRecoveryFloat=(values:{currentGoal:string;position:string;uncertain:string})=>{
    const main=cards.find(card=>card.goalLevel==="main");
    const uncertainCard=cards.find(card=>card.status==="uncertain")||cards.find(card=>card.id==="uncertain");
    setCards(current=>current.map(card=>{
      if(main&&card.id===main.id){
        return {...card,content:{...card.content,[locale]:values.currentGoal},status:"active",priority:"pinned",revision:card.revision+1};
      }
      if(uncertainCard&&card.id===uncertainCard.id){
        return {...card,content:{...card.content,[locale]:values.uncertain},status:"uncertain",revision:card.revision+1};
      }
      return card;
    }));
    eventLog("recovery_accept_float_submitted",{
      locale,
      responses:values,
      writtenBack:{
        mainGoalId:main?.id||null,
        uncertainCardId:uncertainCard?.id||null,
        positionLoggedOnly:true,
      },
    },{stage:"recovery"});
    setShowRecoveryAccept(false);
  };
  const send=async()=>{
    const userText=message.trim();
    if(!userText||isLoading||chatDisabled)return;
    const history:ChatMessage[]=[...chat,{role:"user",text:userText}];
    setChat(history);
    setMessage("");
    setIsLoading(true);
    setChatError(null);
    const stage=phase==="work"?"research_work":"recovery";
    eventLog("chat_message_sent",{taskId,phase},{stage});
    try{
      const response=await fetch("/api/chat",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({
          locale,
          taskId,
          phase,
          messages:history.map(item=>({role:item.role,content:item.text})),
        }),
      });
      const result=await response.json() as {content?:string;mode?:string;error?:string};
      if(!response.ok||!result.content)throw new Error(result.error||"No model response");
      setChat(current=>[...current,{role:"assistant",text:result.content!}]);
      eventLog("chat_response_received",{taskId,phase,providerMode:result.mode||"unknown"},{stage});
    }catch(error){
      setChat(chat);
      setMessage(userText);
      setChatError(locale==="zh-CN"?"AI 本次响应失败，消息已放回输入框，请重试。":"The AI response failed. Your message was restored; please retry.");
      eventLog("chat_response_failed",{taskId,phase,reason:error instanceof Error?error.message:"unknown"},{stage});
    }finally{
      setIsLoading(false);
    }
  };
  return <div className="h-screen min-h-[720px] overflow-hidden bg-[#f8f7f3]">
    <header className="flex h-[68px] items-center justify-between border-b bg-white/90 px-5"><div className="flex items-center gap-4"><Brand/><Badge variant="secondary" className="rounded-full">{phase==="work"?(locale==="zh-CN"?"第一阶段 · 形成问题框架":"Phase 1 · Frame the problem"):t.day}</Badge><Badge variant="outline" className="rounded-full">{task.label[locale]}</Badge></div><div className="flex items-center gap-5 text-sm"><span className={`flex items-center gap-2 font-mono ${remainingSeconds<=60?"text-destructive":"text-primary"}`} aria-label={locale==="zh-CN"?`剩余时间 ${timerText}`:`Time remaining ${timerText}`}><Timer size={18}/>{timerText}</span><span className="flex items-center gap-2 text-[var(--active)]"><CheckCircle size={18}/>{t.saved}</span><span className="flex items-center gap-2 text-muted-foreground"><Globe size={18}/>{locale==="zh-CN"?"中文":"English"}</span><button onClick={()=>setShowTour(true)} aria-label={t.help} title={t.readFirst} className="grid size-10 place-items-center rounded-lg hover:bg-muted"><Question size={20}/></button></div></header>
    <div ref={workspaceGridRef} className="workspace-grid grid h-[calc(100vh-68px)] min-h-0 overflow-hidden" style={{gridTemplateColumns:`${leftColumnRatio}fr 10px ${centerColumnRatio}fr 10px ${rightColumnRatio}fr`}}>
      <MaterialsPanel locale={locale} taskId={taskId} phase={phase} t={t}/>
      <button
        type="button"
        aria-label={locale==="zh-CN"?"左右拖动，调整材料与工作区宽度":"Drag horizontally to resize materials and workspace"}
        title={locale==="zh-CN"?"左右拖动调整窗口宽度":"Drag to resize panels"}
        className="group grid cursor-col-resize touch-none place-items-center border-x bg-[#f8f7f3] hover:bg-secondary focus-visible:z-20"
        onPointerDown={event=>event.currentTarget.setPointerCapture(event.pointerId)}
        onPointerMove={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))resizeColumns("left",event.clientX)}}
        onPointerUp={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)}}
        onPointerCancel={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)}}
        onKeyDown={event=>{
          if(event.key==="ArrowLeft"){event.preventDefault();setLeftColumnRatio(current=>Math.max(18,current-2))}
          if(event.key==="ArrowRight"){event.preventDefault();setLeftColumnRatio(current=>Math.min(Math.min(36,100-rightColumnRatio-32),current+2))}
        }}
      >
        <span className="h-12 w-1 rounded-full bg-border transition group-hover:bg-primary/45"/>
      </button>
      <MemoPanel locale={locale} taskId={taskId} phase={phase} memo={memo} setMemo={setMemo} t={t}/>
      <button
        type="button"
        aria-label={locale==="zh-CN"?"左右拖动，调整工作区与右侧窗口宽度":"Drag horizontally to resize workspace and right-hand panels"}
        title={locale==="zh-CN"?"左右拖动调整窗口宽度":"Drag to resize panels"}
        className="group grid cursor-col-resize touch-none place-items-center border-x bg-[#f8f7f3] hover:bg-secondary focus-visible:z-20"
        onPointerDown={event=>event.currentTarget.setPointerCapture(event.pointerId)}
        onPointerMove={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))resizeColumns("right",event.clientX)}}
        onPointerUp={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)}}
        onPointerCancel={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)}}
        onKeyDown={event=>{
          if(event.key==="ArrowLeft"){event.preventDefault();setRightColumnRatio(current=>Math.min(Math.min(42,100-leftColumnRatio-32),current+2))}
          if(event.key==="ArrowRight"){event.preventDefault();setRightColumnRatio(current=>Math.max(24,current-2))}
        }}
      >
        <span className="h-12 w-1 rounded-full bg-border transition group-hover:bg-primary/45"/>
      </button>
      <section ref={rightColumnRef} className="grid min-h-0 min-w-0 overflow-hidden bg-white" style={{gridTemplateRows:`${rightTopRatio}fr 10px ${100-rightTopRatio}fr`}}>
        {phase==="work"
          ?<PhaseOnePanel locale={locale} condition={condition} taskId={taskId} memo={memo} remaining={remainingSeconds} testMode={testMode} onPhaseOneCapture={onPhaseOneCapture} setScreen={setScreen}/>
          :<RecoveryPanel locale={locale} condition={condition} participantNotes={participantNotes} supportSummary={problemStateToContinuousSummary(problemState?.cards || [], locale)} cards={cards} relations={recoveryRelations} selected={selected} setSelected={setSelected} updateStatus={updateStatus} togglePin={togglePin} updateContent={updateContent} remaining={remainingSeconds} testMode={testMode} setScreen={setScreen} t={t}/>}
        <button
          type="button"
          aria-label={locale==="zh-CN"?"上下拖动，调整目标与 AI 助手窗口高度":"Drag vertically to resize the goals and AI-assistant windows"}
          title={locale==="zh-CN"?"上下拖动调整窗口高度":"Drag to resize panels"}
          className="group grid cursor-row-resize touch-none place-items-center border-y bg-[#f8f7f3] hover:bg-secondary focus-visible:z-20"
          onPointerDown={event=>event.currentTarget.setPointerCapture(event.pointerId)}
          onPointerMove={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))resizeRightPanels(event.clientY)}}
          onPointerUp={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)}}
          onPointerCancel={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)}}
          onKeyDown={event=>{
            if(event.key==="ArrowUp"){event.preventDefault();setRightTopRatio(current=>Math.max(34,current-4))}
            if(event.key==="ArrowDown"){event.preventDefault();setRightTopRatio(current=>Math.min(66,current+4))}
          }}
        >
          <span className="h-1 w-12 rounded-full bg-border transition group-hover:bg-primary/45"/>
        </button>
        <ChatPanel locale={locale} chat={chat} message={message} setMessage={setMessage} send={send} isLoading={isLoading} error={chatError} disabled={chatDisabled} t={t}/>
      </section>
    </div>
    {showTour&&<WorkspaceTour locale={locale} condition={condition} onComplete={()=>setShowTour(false)}/>}
    {showRecoveryAccept&&<RecoveryAcceptFloat locale={locale} cards={cards} t={t} onAccept={acceptRecoveryFloat}/>}
  </div>
}

function MaterialsPanel({locale,taskId,phase,t}:{locale:Locale;taskId:ResearchTaskId;phase:"work"|"recovery";t:typeof copy[Locale]}) {
  const task=getResearchTask(taskId);
  const materials=useMemo(()=>getTaskMaterials(taskId,phase),[phase,taskId]);
  const [active,setActive]=useState(()=>phase==="recovery"?task.recoveryMaterial.id:materials[0].id);
  const [read,setRead]=useState<Set<string>>(()=>new Set());
  const [readingSeconds,setReadingSeconds]=useState(5);
  const presentedRef=useRef(new Set<string>());
  const completedRef=useRef(new Set<string>());
  const stage=phase==="work"?"research_work":"recovery";
  useEffect(()=>{
    if(!presentedRef.current.has(active)){
      presentedRef.current.add(active);
      eventLog("material_presented",{taskId,phase,initial:active===materials[0].id},{stage,targetType:"material",targetId:active});
    }
    const startedAt=Date.now();
    const progressTimer=window.setInterval(()=>{
      setReadingSeconds(Math.max(1,Math.ceil((5_000-(Date.now()-startedAt))/1_000)));
    },250);
    const timer=window.setTimeout(()=>{
      if(completedRef.current.has(active)){setReadingSeconds(0);return}
      completedRef.current.add(active);
      setRead(current=>new Set([...current,active]));
      setReadingSeconds(0);
      eventLog("material_exposure_completed",{taskId,phase,durationMs:Date.now()-startedAt,completionRule:"active_for_5_seconds"},{stage,targetType:"material",targetId:active});
    },5_000);
    return()=>{window.clearInterval(progressTimer);window.clearTimeout(timer)};
  },[active,materials,phase,stage,taskId]);
  const openMaterial=(id:string)=>{
    if(id===active)return;
    setActive(id);
    setReadingSeconds(completedRef.current.has(id)?0:5);
    eventLog("material_opened",{id,taskId,phase},{stage,targetType:"material",targetId:id});
  };
  return <aside data-tour="materials" className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#fbfaf7]">
    <div className="flex h-14 shrink-0 items-center justify-between border-b px-5"><h2 className="flex items-center gap-2 font-semibold"><BookOpenText size={20}/>{t.materials}</h2><Badge variant="outline" className="text-[10px]">{materials.length} {locale==="zh-CN"?"份材料":"sources"}</Badge></div>
    <div className="shrink-0 px-5 py-4"><div className="mb-2 flex justify-between text-xs text-muted-foreground"><span>{t.progress}</span><span>{read.size} / {materials.length}</span></div><Progress value={(read.size/materials.length)*100} className="h-1.5"/></div>
    <div className="panel-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-4">{materials.map(material=><button key={material.id} onClick={()=>openMaterial(material.id)} className={`mb-2 w-full rounded-xl px-3 py-4 text-left transition ${material.recoveryOnly?"border border-amber-200 bg-amber-50/55":""} ${active===material.id?"bg-white shadow-[0_5px_18px_rgba(35,43,70,.07)] ring-1 ring-primary/15":"hover:bg-white/80"}`}><div className="mb-2 flex items-center justify-between"><span className="grid size-6 place-items-center rounded-md bg-secondary text-xs font-semibold text-primary">{material.n}</span>{read.has(material.id)?<span className="flex items-center gap-1 text-[10px] text-[var(--active)]"><Check size={12}/>{locale==="zh-CN"?"已阅读":"Read"}</span>:active===material.id?<span className="text-[10px] text-primary">{locale==="zh-CN"?`阅读中 · ${readingSeconds} 秒`:`Reading · ${readingSeconds}s`}</span>:material.recoveryOnly?<Badge className="bg-amber-600 text-[9px]">{locale==="zh-CN"?"中断后新增":"NEW"}</Badge>:null}</div><h3 className="text-sm font-semibold leading-5">{material.title[locale]}</h3><p className={`mt-2 whitespace-pre-line text-xs leading-5 text-muted-foreground ${active===material.id?"":"line-clamp-3"}`}>{material.excerpt[locale]}</p><p className="mt-3 text-[10px] text-primary">{material.meta[locale]}</p></button>)}</div>
  </aside>;
}

function ChatPanel({locale,chat,message,setMessage,send,isLoading,error,disabled,t}:{locale:Locale;chat:ChatMessage[];message:string;setMessage:(s:string)=>void;send:()=>void;isLoading:boolean;error:string|null;disabled?:boolean;t:typeof copy[Locale]}) {
  if(disabled){
    return <section data-tour="chat" className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-white">
      <div className="flex h-14 shrink-0 items-center justify-between border-b px-5"><h2 className="flex items-center gap-2 font-semibold"><Sparkle size={19} className="text-muted-foreground" weight="fill"/>{t.chat}</h2><Badge variant="outline" className="text-[10px]">{locale==="zh-CN"?"本条件不可用":"Unavailable"}</Badge></div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-8 text-center">
        <p className="text-sm leading-6 text-muted-foreground">{locale==="zh-CN"?"你被分配到用户自主笔记条件：本条件全程不提供 AI 对话，请依靠自己在工作区中的记录来推进和恢复思路。":"You are in the Self-Notes condition: no AI chat is available at any point. Rely on your own notes in the workspace to reason and to resume later."}</p>
      </div>
    </section>;
  }
  return <section data-tour="chat" className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-white">
    <div className="flex h-14 shrink-0 items-center justify-between border-b px-5"><h2 className="flex items-center gap-2 font-semibold"><Sparkle size={19} className="text-primary" weight="fill"/>{t.chat}</h2><Badge variant="outline" className="text-[10px]">DeepSeek</Badge></div>
    <div className="panel-scroll min-h-0 flex-1 overflow-y-auto px-5 py-5">
      <div className="mb-5 flex items-center gap-3 text-[10px] uppercase tracking-wider text-muted-foreground"><div className="h-px flex-1 bg-border"/>Research session<div className="h-px flex-1 bg-border"/></div>
      {chat.map((item,index)=><div key={`${item.role}-${index}`} className={`mb-4 flex ${item.role==="user"?"justify-end":"justify-start"}`}><div className={`max-w-[88%] whitespace-pre-wrap rounded-xl px-4 py-3 text-sm leading-6 ${item.role==="user"?"bg-secondary text-secondary-foreground":"bg-[#f5f6f8]"}`}>{item.text}</div></div>)}
      {isLoading&&<div className="mb-4 flex justify-start"><div className="rounded-xl bg-[#f5f6f8] px-4 py-3 text-xs text-muted-foreground"><Sparkle size={14} className="mr-2 inline animate-pulse text-primary"/>{locale==="zh-CN"?"DeepSeek 正在对照材料…":"DeepSeek is comparing the evidence…"}</div></div>}
    </div>
    <div className="shrink-0 p-3 pt-0">{error&&<p role="alert" className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">{error}</p>}<div className="flex items-end gap-2 rounded-xl border bg-white px-3 py-2 shadow-[0_8px_30px_rgba(35,43,70,.06)]"><Textarea value={message} disabled={isLoading} onChange={event=>setMessage(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();send()}}} rows={1} className="min-h-9 max-h-16 resize-none overflow-y-auto border-0 bg-transparent px-0 py-2 shadow-none focus-visible:ring-0" placeholder={t.ask}/><Button size="icon" className="mb-0.5" onClick={send} disabled={isLoading||!message.trim()} aria-label="Send"><PaperPlaneTilt size={18} weight="fill"/></Button></div><p className="mt-1.5 text-center text-[9px] leading-4 text-muted-foreground">{t.disclaimer}</p></div>
  </section>;
}

function MemoPanel({locale,taskId,phase,memo,setMemo,t}:{locale:Locale;taskId:ResearchTaskId;phase:"work"|"recovery";memo:string;setMemo:(s:string)=>void;t:typeof copy[Locale]}) {
  const starterMemo=getResearchTask(taskId).starterMemo[locale];
  const wordCount=(text:string)=>locale==="zh-CN"?text.replace(/\s/g,"").length:(text.trim()?text.trim().split(/\s+/).length:0);
  const count=Math.max(0,wordCount(memo)-wordCount(starterMemo));
  return <section data-tour="memo" className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-white">
    <div className="flex h-14 shrink-0 items-center justify-between border-b px-5"><h2 className="flex items-center gap-2 font-semibold"><NotePencil size={20}/>{t.memo}</h2><span className="flex items-center gap-2 text-xs text-muted-foreground"><Check size={15}/>{t.saved} · {locale==="zh-CN"?"目标 600–900 字":"Target 600–900 words"}</span></div>
    <div className="relative min-h-0 flex-1 px-6 py-5"><Textarea value={memo} onChange={event=>{const next=event.target.value;const nextCount=locale==="zh-CN"?next.replace(/\s/g,"").length:(next.trim()?next.trim().split(/\s+/).length:0);setMemo(next);eventLog("memo_edited",{count:nextCount,phase},{stage:phase==="work"?"research_work":"recovery",targetType:"memo"})}} className="panel-scroll h-full resize-none overflow-y-auto border-0 p-0 pb-8 text-[15px] leading-7 shadow-none focus-visible:ring-0" placeholder={t.memoPlaceholder}/><div className="pointer-events-none absolute bottom-4 right-6 rounded-md bg-white/90 px-2 py-1 text-right font-mono text-[10px] text-muted-foreground">{count} {t.words} · 600–900</div></div>
  </section>;
}

function PhaseOnePanel({locale,condition,taskId,memo,remaining,testMode,onPhaseOneCapture,setScreen}:{locale:Locale;condition:Condition;taskId:ResearchTaskId;memo:string;remaining:number;testMode:boolean;onPhaseOneCapture?:()=>void;setScreen:(screen:Screen)=>void}) {
  const task=getResearchTask(taskId);
  const phaseOneGoals=task.phaseOneGoals;
  const [completed,setCompleted]=useState<Set<string>>(()=>new Set());
  const criterionId=(goalId:string,index:number)=>`${goalId}:${index}`;
  const toggleCriterion=(goalId:string,index:number)=>setCompleted(current=>{
    const id=criterionId(goalId,index);
    const next=new Set(current);
    if(next.has(id))next.delete(id);else next.add(id);
    eventLog("phase_criterion_toggled",{taskId,goalId,criterionIndex:index,completed:!current.has(id)},{stage:"research_work"});
    return next;
  });
  const completedGoalCount=phaseOneGoals.filter(goal=>goal.criteria.every((_,index)=>completed.has(criterionId(goal.id,index)))).length;
  const totalCriteria=phaseOneGoals.reduce((total,goal)=>total+goal.criteria.length,0);
  const wordCount=(text:string)=>locale==="zh-CN"?text.replace(/\s/g,"").length:(text.trim()?text.trim().split(/\s+/).length:0);
  const memoCount=Math.max(0,wordCount(memo)-wordCount(task.starterMemo[locale]));
  const checkpointReady=testMode||remaining<=0;
  return <section data-tour="goals" className="flex min-h-0 flex-col bg-[#fbfcfe]">
    <div className="flex h-14 shrink-0 items-center justify-between border-b px-5"><h2 className="flex items-center gap-2 font-semibold"><Target size={20} className="text-primary"/>{locale==="zh-CN"?"第一阶段目标":"Phase 1 goals"}</h2><Badge variant="outline" className="bg-white text-[10px]">{completedGoalCount} / {phaseOneGoals.length} {locale==="zh-CN"?"个目标":"goals"}</Badge></div>
    <div className="panel-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-700">{task.label[locale]} · Research question</p><p className="mt-2 text-sm font-semibold leading-6 text-indigo-950">{task.question[locale]}</p></div>
      <div className="mt-4 space-y-3">{phaseOneGoals.map((goal,index)=><section key={goal.id} className={`rounded-xl border p-3 transition ${goal.criteria.every((_,criterionIndex)=>completed.has(criterionId(goal.id,criterionIndex)))?"border-emerald-200 bg-emerald-50/45":"bg-white"}`}>
        <div className="flex items-center gap-2"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-semibold text-primary">{index+1}</span><h3 className="text-xs font-semibold">{goal.title[locale]}</h3></div>
        <div className="ml-8 mt-2 space-y-1.5">{goal.criteria.map((criterion,criterionIndex)=>{
          const id=criterionId(goal.id,criterionIndex);
          return <label key={id} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-[11px] leading-4 hover:bg-muted/50"><input type="checkbox" checked={completed.has(id)} onChange={()=>toggleCriterion(goal.id,criterionIndex)} className="mt-0.5 size-3.5 accent-[var(--active)]"/><span>{criterion[locale]}</span></label>;
        })}</div>
      </section>)}</div>
    </div>
    <div className="shrink-0 border-t bg-white px-5 py-3"><div className="mb-2 flex justify-between text-[10px] text-muted-foreground"><span>{checkpointReady?(locale==="zh-CN"?"保存窗口已开放":"Save window open"):(locale==="zh-CN"?"请先完整思考 15 分钟，之后开放下一步":"Next step opens after the full 15-minute thinking period")}</span><span>{memoCount} {locale==="zh-CN"?"字":"words"} · {completed.size}/{totalCriteria} {locale==="zh-CN"?"评价点":"criteria"}</span></div><TimedButton seconds={10} ready={checkpointReady} locale={locale} label={locale==="zh-CN"?"保存推理位置并完成中断前测评":"Save reasoning state and complete the pre-interruption assessment"} blockedLabel={locale==="zh-CN"?"下一步尚未开放":"Next step is not open yet"} className="h-11 w-full text-sm" onClick={()=>{const nextScreen:Screen="city_t1";onPhaseOneCapture?.();eventLog("phase_one_checkpoint_requested",{taskId,condition,completedGoals:completedGoalCount,completedCriteria:completed.size,totalCriteria,memoCount,remaining,nextScreen},{stage:"research_work"});setScreen(nextScreen)}} /></div>
  </section>;
}

function RecoveryPanel({locale,condition,participantNotes,supportSummary,cards,relations,selected,setSelected,updateStatus,togglePin,updateContent,remaining,testMode,setScreen,t}:{locale:Locale;condition:Condition;participantNotes:string;supportSummary:string;cards:ReasoningCard[];relations:CardRelation[];selected:string;setSelected:(s:string)=>void;updateStatus:(id:string,s:EpistemicStatus)=>void;togglePin:(id:string)=>void;updateContent:(id:string,value:string)=>void;remaining:number;testMode:boolean;setScreen:(s:Screen)=>void;t:typeof copy[Locale]}) {
  const [activeTab,setActiveTab]=useState<"brief"|"cards"|"network">(()=>condition==="rmw_no_summary"?"cards":"brief");
  const renderedRef=useRef(false);
  const viewedTabsRef=useRef(new Set<string>());
  useEffect(()=>{
    if(renderedRef.current)return;
    renderedRef.current=true;
    eventLog("recovery_support_rendered",{
      condition,
      supportType:condition,
      cardCount:cards.length,
      cardIds:cards.map(card=>card.id),
      relationCount:relations.length,
    },{stage:"recovery",targetType:"recovery_support",targetId:condition});
  },[cards,condition,relations.length]);
  useEffect(()=>{
    if(condition==="summary_only"||!cards.length||viewedTabsRef.current.has(activeTab))return;
    viewedTabsRef.current.add(activeTab);
    eventLog("recovery_tab_viewed",{tab:activeTab,cardCount:cards.length},{stage:"recovery",targetType:"recovery_tab",targetId:activeTab});
  },[activeTab,cards.length,condition]);
  if(condition==="rmw_no_summary") return <RecoveryShell t={t}><div className="mx-6 mt-4 min-h-0 flex-1 overflow-auto rounded-xl bg-amber-50/60 p-5"><p className="text-xs font-semibold uppercase tracking-wider text-amber-900">{locale==="zh-CN"?"中断前用户笔记":"Pre-interruption self-notes"}</p><p className="mt-3 whitespace-pre-wrap text-sm leading-7">{participantNotes|| (locale==="zh-CN"?"未保存用户笔记":"No user notes were saved")}</p></div><PrimaryContinue locale={locale} remaining={remaining} testMode={testMode} setScreen={setScreen} t={t}/></RecoveryShell>;
  if(!cards.length && condition==="rmw")return <RecoveryShell t={t}><div className="m-6 rounded-xl border bg-white p-5 text-sm leading-6 text-muted-foreground">{locale==="zh-CN"?"本次没有保存经过参与者校准的 Problem State，因此不会显示演示卡片。":"No participant-calibrated problem state was saved, so no demo cards are shown."}</div><PrimaryContinue locale={locale} remaining={remaining} testMode={testMode} setScreen={setScreen} t={t}/></RecoveryShell>;
  if(condition==="summary_only") return <RecoveryShell t={t}><div className="mx-6 mt-4 min-h-0 flex-1 overflow-auto rounded-xl bg-muted/60 p-5"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">AI Summary</p><p className="mt-3 whitespace-pre-wrap text-sm leading-7">{supportSummary}</p></div><PrimaryContinue locale={locale} remaining={remaining} testMode={testMode} setScreen={setScreen} t={t}/></RecoveryShell>;
  return <RecoveryShell t={t}><Tabs value={activeTab} onValueChange={(value)=>setActiveTab(value as "brief"|"cards"|"network")} className="flex min-h-0 flex-1 flex-col"><div className="flex items-center justify-between border-b px-5 py-2.5"><TabsList className="inline-flex h-9 items-center justify-center rounded-lg bg-secondary/80 p-1 text-muted-foreground">{condition==="rmw"&&<TabsTrigger className="inline-flex h-7 items-center justify-center rounded-md px-3.5 text-xs font-medium transition-all data-active:bg-white data-active:text-foreground data-active:shadow-sm" value="brief">{t.resume}</TabsTrigger>}<TabsTrigger className="inline-flex h-7 items-center justify-center rounded-md px-3.5 text-xs font-medium transition-all data-active:bg-white data-active:text-foreground data-active:shadow-sm" value="cards">{t.cards}</TabsTrigger><TabsTrigger className="inline-flex h-7 items-center justify-center rounded-md px-3.5 text-xs font-medium transition-all data-active:bg-white data-active:text-foreground data-active:shadow-sm" value="network">{t.network}</TabsTrigger></TabsList><span className="text-[10px] font-medium text-muted-foreground">{cards.length} {t.allCards}</span></div>
    {condition==="rmw"&&<TabsContent value="brief" className="m-0 min-h-0 flex-1 overflow-auto"><ResumeBrief locale={locale} cards={cards} t={t}/></TabsContent>}
    <TabsContent value="cards" className="m-0 grid min-h-0 flex-1 grid-cols-[1.18fr_.82fr]"><div className="hide-scrollbar min-h-0 overflow-y-auto border-r px-4 py-3"><div className="mb-3 rounded-lg bg-secondary/70 p-3 text-xs leading-5 text-secondary-foreground"><strong>{t.ready}：</strong>{t.readFirst}</div><GoalHierarchy cards={cards} locale={locale} selected={selected} setSelected={setSelected}/><p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Problem state cards</p>{cards.filter(card=>card.cardType!=="goal").map(card=><ReasoningCardView key={card.id} card={card} locale={locale} selected={selected===card.id} onSelect={()=>{setSelected(card.id);eventLog("card_selected",{id:card.id},{stage:"recovery",targetType:"reasoning_card",targetId:card.id})}} updateStatus={updateStatus} t={t}/>)}</div><CardInspector key={`${selected}-${locale}`} card={cards.find(card=>card.id===selected) || cards[0]} locale={locale} updateStatus={updateStatus} togglePin={togglePin} updateContent={updateContent} t={t}/></TabsContent>
    <TabsContent value="network" className="m-0 min-h-0 flex-1"><KnowledgeNetwork locale={locale} cards={cards} relations={relations} selected={selected} setSelected={setSelected}/></TabsContent>
  </Tabs><PrimaryContinue locale={locale} remaining={remaining} testMode={testMode} setScreen={setScreen} t={t}/></RecoveryShell>;
}

function RecoveryShell({children,t}:{children:React.ReactNode;t:typeof copy[Locale]}) { return <div className="flex min-h-0 flex-col bg-[#fbfcfe]"><div className="flex h-14 shrink-0 items-center border-b px-5"><h2 className="flex items-center gap-2 font-semibold"><Brain size={20} className="text-primary"/>{t.recovery}</h2></div>{children}</div> }

function ResumeBrief({locale,cards,t}:{locale:Locale;cards:ReasoningCard[];t:typeof copy[Locale]}) {
  const main=cards.find(card=>card.goalLevel==="main");
  const subgoals=cards.filter(card=>card.goalLevel==="subgoal"&&card.status!=="expired").slice(0,2);
  const uncertain=cards.find(card=>card.status==="uncertain");
  const ruled=cards.find(card=>card.cardType==="path"&&card.status==="expired");
  const next=cards.find(card=>card.cardType==="next_action");
  const rows=[
    [Target,t.currentGoal,main?.content[locale]||"—"],
    [Brain,t.position,subgoals.map(card=>card.content[locale]).join(" · ")],
    [WarningCircle,t.uncertain,uncertain?.content[locale]||"—"],
    [XCircle,t.ruled,ruled?.content[locale]||"—"],
    [ArrowRight,t.nextStep,next?.content[locale]||main?.nextAction?.[locale]||"—"],
  ];
  return <div className="mx-auto max-w-2xl px-6 py-5"><div className="mb-3 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 text-xs leading-5 text-indigo-900">{locale==="zh-CN"?"以下仅显示中断前已保存的恢复关键点；存疑内容不会被压平为结论。":"Only the calibrated recovery-critical state is shown; uncertain content is not flattened into a conclusion."}</div><div className="divide-y rounded-xl border bg-white">{rows.map(([I,label,value],i)=>{const Icon=I as typeof Target;return <div key={String(label)} className={`grid grid-cols-[32px_120px_1fr] items-start gap-2 px-4 py-3 ${i===4?"bg-[var(--active-soft)]":""}`}><Icon size={18} className={i===2?"text-[var(--uncertain)]":i===4?"text-[var(--active)]":"text-primary"}/><span className="text-xs font-medium text-muted-foreground">{String(label)}</span><span className="text-sm leading-5">{String(value)}</span></div>})}</div></div>
}

function GoalHierarchy({cards,locale,selected,setSelected}:{cards:ReasoningCard[];locale:Locale;selected:string;setSelected:(id:string)=>void}) {
  const main=cards.find(card=>card.goalLevel==="main");
  const active=cards.filter(card=>card.goalLevel==="subgoal").slice(0,4);
  const suspended=cards.filter(card=>card.goalLevel==="suspended").slice(0,3);
  const tile=(card:ReasoningCard)=> {
    const tone=card.status==="uncertain"?"border-amber-200 bg-amber-50/70":card.status==="expired"?"border-slate-200 bg-slate-50 text-slate-500":"border-emerald-200 bg-emerald-50/55";
    return <button key={card.id} onClick={()=>{setSelected(card.id);eventLog("goal_selected",{goalLevel:card.goalLevel},{stage:"recovery",targetType:"reasoning_card",targetId:card.id})}} className={`w-full rounded-lg border p-2.5 text-left ${tone} ${selected===card.id?"ring-2 ring-primary/25":""}`}><div className="flex items-center justify-between"><span className="text-[9px] font-semibold uppercase tracking-wider">{card.status}</span>{card.priority==="pinned"&&<PushPin size={12} weight="fill" className="text-primary"/>}</div><p className="mt-1.5 text-[11px] font-semibold leading-4 text-foreground">{card.content[locale]}</p>{card.nextAction&&<p className="mt-1 line-clamp-1 text-[9px] text-muted-foreground">→ {card.nextAction[locale]}</p>}</button>
  };
  return <div className="rounded-xl border bg-white p-3"><div className="mb-2 flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{locale==="zh-CN"?"目标层级":"Goal hierarchy"}</p><Badge variant="outline" className="text-[9px]">{active.length}/4 active</Badge></div>{main&&tile(main)}<div className="mt-2 grid grid-cols-[1.25fr_.75fr] gap-2"><div><p className="mb-1.5 text-[9px] font-medium text-muted-foreground">{locale==="zh-CN"?"活跃子目标":"Active subgoals"}</p><div className="grid grid-cols-2 gap-2">{active.map(tile)}</div></div><details open className="rounded-lg bg-muted/40 p-2"><summary className="cursor-pointer text-[9px] font-medium text-muted-foreground">{locale==="zh-CN"?"挂起目标":"Suspended goals"} · {suspended.length}</summary><div className="mt-2 space-y-2">{suspended.map(tile)}</div></details></div></div>
}

function CardInspector({card,locale,updateStatus,togglePin,updateContent,t}:{card:ReasoningCard;locale:Locale;updateStatus:(id:string,s:EpistemicStatus)=>void;togglePin:(id:string)=>void;updateContent:(id:string,value:string)=>void;t:typeof copy[Locale]}) {
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState(card.content[locale]);
  return <aside className="min-h-0 overflow-y-auto bg-[#fcfcfd] p-4"><div className="flex items-start justify-between"><div><Badge variant="outline" className="text-[9px]">{card.goalLevel||card.cardType}</Badge><h3 className="mt-3 text-sm font-semibold leading-5">{card.content[locale]}</h3></div>{card.priority==="pinned"&&<PushPin size={16} weight="fill" className="text-primary"/>}</div>{editing?<div className="mt-4"><Textarea value={draft} onChange={e=>setDraft(e.target.value)} className="min-h-24 text-xs leading-5"/><div className="mt-2 flex gap-2"><Button size="sm" onClick={()=>{updateContent(card.id,draft);setEditing(false)}}><Check/>{t.verify}</Button><Button size="sm" variant="ghost" onClick={()=>setEditing(false)}>Cancel</Button></div></div>:<p className="mt-3 text-xs leading-5 text-muted-foreground">{card.detail[locale]}</p>}<div className="mt-4 rounded-lg border bg-white p-3"><div className="flex gap-2"><LinkSimple size={14} className="mt-0.5 shrink-0 text-primary"/><div><p className="text-[10px] font-semibold">{locale==="zh-CN"?"来源与回链":"Source backlink"}</p><p className="mt-1 text-[10px] leading-4 text-muted-foreground">{card.sourceRefs.map(source=>source.label).join(" · ")||"No source"}</p></div></div>{card.riskTags.length>0&&<div className="mt-3 flex flex-wrap gap-1">{card.riskTags.map(tag=><Badge key={tag} variant="secondary" className="text-[8px]">{tag}</Badge>)}</div>}</div>{typeof card.confidence==="number"&&<div className="mt-4"><div className="mb-1 flex justify-between text-[10px]"><span>{locale==="zh-CN"?"提取置信度":"Extraction confidence"}</span><span>{card.confidence}%</span></div><Progress value={card.confidence} className="h-1.5"/></div>}<div className="mt-5 grid grid-cols-2 gap-2"><Button size="sm" variant={card.status==="active"?"secondary":"outline"} onClick={()=>updateStatus(card.id,"active")}><CheckCircle/>{t.verify}</Button><Button size="sm" variant="outline" onClick={()=>setEditing(true)}><NotePencil/>{locale==="zh-CN"?"编辑":"Edit"}</Button><Button size="sm" variant="outline" onClick={()=>togglePin(card.id)}><PushPin/>{t.pin}</Button><Button size="sm" variant="outline" onClick={()=>updateStatus(card.id,"uncertain")}><WarningCircle/>{locale==="zh-CN"?"存疑":"Uncertain"}</Button><Button size="sm" variant="ghost" className="col-span-2" onClick={()=>updateStatus(card.id,"expired")}><PauseCircle/>{t.expire}</Button></div><p className="mt-4 text-[9px] leading-4 text-muted-foreground">{locale==="zh-CN"?"接受、编辑、置顶、存疑和过期都会被作为独立事件记录。":"Accept, edit, pin, uncertainty, and expiry are logged as separate events."}</p></aside>
}

function ReasoningCardView({card,locale,selected,onSelect,updateStatus,t}:{card:ReasoningCard;locale:Locale;selected:boolean;onSelect:()=>void;updateStatus:(id:string,s:EpistemicStatus)=>void;t:typeof copy[Locale]}) { const status={active:{label:"Active",icon:CheckCircle,cls:"border-l-[var(--active)] bg-[var(--active-soft)]/55 text-[var(--active)]"},uncertain:{label:"Uncertain",icon:WarningCircle,cls:"border-l-[var(--uncertain)] bg-[var(--uncertain-soft)]/60 text-[var(--uncertain)]"},expired:{label:"Expired",icon:PauseCircle,cls:"border-l-[var(--expired)] bg-muted/50 text-[var(--expired)]"},draft:{label:"Draft",icon:Clock,cls:"border-l-primary bg-secondary/40 text-primary"}}[card.status]; const Icon=status.icon; return <article onClick={onSelect} className={`mb-2 cursor-pointer rounded-lg border border-l-[3px] bg-white p-3 transition ${status.cls} ${selected?"ring-2 ring-primary/20 shadow-sm":"hover:shadow-sm"}`}><div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-[10px] font-semibold"><Icon size={14}/>{status.label}{card.priority==="pinned"&&<PushPin size={13} weight="fill"/>}</span><span className="text-[9px] text-muted-foreground">v{card.revision}</span></div><h3 className="mt-2 text-[13px] font-semibold leading-5 text-foreground">{card.content[locale]}</h3><p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{card.detail[locale]}</p><div className="mt-2 flex items-center justify-between border-t pt-2"><button onClick={e=>{e.stopPropagation();eventLog("evidence_opened",{card:card.id})}} className="flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"><LinkSimple size={12}/>{t.evidence} · {card.sourceRefs[0]?.label}</button>{card.status==="uncertain"?<button onClick={e=>{e.stopPropagation();updateStatus(card.id,"active")}} className="text-[10px] font-medium text-[var(--active)] hover:underline">{t.verify}</button>:card.status==="expired"?<button onClick={e=>{e.stopPropagation();updateStatus(card.id,"active")}} className="text-[10px] hover:underline">{t.restore}</button>:<button onClick={e=>{e.stopPropagation();updateStatus(card.id,"expired")}} className="text-[10px] text-muted-foreground hover:underline">{t.expire}</button>}</div></article> }

type FlowData={ label:string; status:EpistemicStatus; selected:boolean };
function FlowNode({data}:{data:FlowData}) { const colors=data.status==="active"?"border-emerald-400 bg-emerald-50":data.status==="uncertain"?"border-amber-400 bg-amber-50":"border-slate-300 bg-slate-50"; return <div className={`w-[118px] rounded-lg border-2 px-3 py-2 text-center text-[10px] font-medium leading-4 shadow-sm ${colors} ${data.selected?"ring-4 ring-indigo-100":""}`}><Handle type="target" position={Position.Left}/>{data.label}<Handle type="source" position={Position.Right}/></div> }
const nodeTypes={reason:FlowNode};
function computeFlowPositions(cards: ReasoningCard[]): Record<string, { x: number; y: number }> {
  const result: Record<string, { x: number; y: number }> = {};
  const groups = [
    cards.filter((c) => c.goalLevel === "main"),
    cards.filter((c) => c.goalLevel === "subgoal"),
    cards.filter((c) => c.goalLevel === "suspended"),
    cards.filter((c) => !c.goalLevel),
  ];
  groups.forEach((group, row) => group.forEach((card, col) => {
    result[card.id] = { x: 60 + col * 190, y: 20 + row * 105 };
  }));
  return result;
}
function KnowledgeNetwork({locale,cards,relations,selected,setSelected,compact=false}:{locale:Locale;cards:ReasoningCard[];relations:CardRelation[];selected:string;setSelected:(s:string)=>void;compact?:boolean}) {
  const positions=useMemo(()=>computeFlowPositions(cards),[cards]);
  const nodes=useMemo<Node<FlowData>[]>(()=>cards.map(c=>({id:c.id,type:"reason",position:positions[c.id]||{x:0,y:0},data:{label:c.content[locale],status:c.status,selected:c.id===selected}})),[cards,locale,positions,selected]);
  const edges=useMemo<Edge[]>(()=>relations.map(r=>({id:r.id,source:r.sourceCardId,target:r.targetCardId,label:compact?undefined:r.relationType,animated:r.relationType==="leads_to",style:{stroke:r.relationType==="challenges"?"#c58a2c":"#8a93a5"},labelStyle:{fontSize:9,fill:"#6b7280"}})),[compact,relations]);
  // KnowledgeNetwork mounts inside a Base UI Tabs panel, which animates in on
  // a transition. ReactFlow's fitView runs once at mount against whatever
  // size the container has at that instant, which can be a mid-transition
  // size -- leaving the graph zoomed/panned out of view. Re-fit once the
  // panel has actually settled.
  const refit=(instance:{fitView:(options?:{padding?:number})=>void})=>{
    requestAnimationFrame(()=>requestAnimationFrame(()=>instance.fitView({padding:.2})));
    window.setTimeout(()=>instance.fitView({padding:.2}),200);
  };
  return <div className="h-full min-h-0 bg-[#fcfcfd]"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView minZoom={.45} maxZoom={1.4} onInit={refit} onNodeClick={(_,n)=>{setSelected(n.id);eventLog("network_node_clicked",{id:n.id})}}><Background gap={22} size={1} color="#e8eaf0"/>{!compact&&<Controls position="bottom-right" showInteractive={false}/>}</ReactFlow></div>;
}

function PrimaryContinue({locale,remaining,testMode,setScreen,t}:{locale:Locale;remaining:number;testMode:boolean;setScreen:(s:Screen)=>void;t:typeof copy[Locale]}) {
  if(!testMode)return <div className="shrink-0 border-t bg-white px-5 py-3"><TimedButton seconds={10} ready={remaining<=0} locale={locale} label={locale==="zh-CN"?"完成恢复阶段并继续":"Finish the recovery period and continue"} blockedLabel={locale==="zh-CN"?`固定恢复阶段进行中 · 剩余 ${Math.ceil(remaining/60)} 分钟`:`Fixed recovery period · ${Math.ceil(remaining/60)} min remaining`} className="h-11 w-full text-sm" onClick={()=>{eventLog("recovery_period_completed",{remaining},{stage:"recovery"});setScreen("post_survey")}} /></div>;
  return <div className="shrink-0 border-t bg-white px-5 py-3"><TimedButton seconds={5} locale={locale} label={t.endStudy} className="h-11 w-full text-sm" onClick={()=>{eventLog("end_study_clicked",{testMode:true,remaining},{stage:"recovery"});setScreen("post_survey")}} /></div>;
}

function RecoveryPostSurveyPage({ locale, onSubmit }: { locale: Locale; onSubmit: (answers: RecoveryPostSurvey) => void }) {
  const items: Array<{ key: keyof RecoveryPostSurvey; zh: string; en: string; lowZh: string; highZh: string; lowEn: string; highEn: string }> = [
    { key: "continuity", zh: "恢复支持帮助我迅速重新找到中断前的思路。", en: "The recovery support helped me quickly regain my pre-interruption train of thought.", lowZh: "完全不同意", highZh: "完全同意", lowEn: "Strongly disagree", highEn: "Strongly agree" },
    { key: "mentalDemand", zh: "恢复中断前的推理位置需要很高的脑力投入。", en: "Recovering my pre-interruption reasoning position required high mental effort.", lowZh: "完全不同意", highZh: "完全同意", lowEn: "Strongly disagree", highEn: "Strongly agree" },
    { key: "confidence", zh: "我有信心自己准确恢复了中断前的判断状态。", en: "I am confident that I accurately recovered my pre-interruption judgment state.", lowZh: "完全不同意", highZh: "完全同意", lowEn: "Strongly disagree", highEn: "Strongly agree" },
    { key: "agency", zh: "恢复后继续推进任务时，我仍然感觉由自己掌控判断。", en: "I still felt in control of the judgment when continuing after recovery.", lowZh: "完全不同意", highZh: "完全同意", lowEn: "Strongly disagree", highEn: "Strongly agree" },
    { key: "supportSufficiency", zh: "恢复支持提供了足够的信息，让我可以继续任务。", en: "The recovery support provided enough information for me to continue the task.", lowZh: "完全不同意", highZh: "完全同意", lowEn: "Strongly disagree", highEn: "Strongly agree" },
  ];
  const [answers, setAnswers] = useState<Partial<RecoveryPostSurvey>>({});
  const complete = items.every((item) => answers[item.key] !== undefined);
  return <main className="min-h-screen bg-[#f7f6f2] px-6 py-10"><div className="mx-auto max-w-3xl rounded-2xl border bg-white p-7 shadow-[0_18px_60px_rgba(35,40,65,.08)]"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-primary">{locale === "zh-CN" ? "恢复后问卷" : "Post-recovery survey"}</p><h1 className="mt-2 text-2xl font-semibold">{locale === "zh-CN" ? "刚才的恢复体验" : "Your recovery experience"}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{locale === "zh-CN" ? "请根据刚刚完成的任务作答。1 表示完全不同意，7 表示完全同意。" : "Answer based on the task you just completed. 1 means strongly disagree and 7 means strongly agree."}</p><div className="mt-6 space-y-4">{items.map((item, index) => <fieldset key={item.key} className="rounded-xl border p-4"><legend className="px-1 text-sm font-medium">{index + 1}. {locale === "zh-CN" ? item.zh : item.en}</legend><div className="mt-3 grid grid-cols-7 gap-2">{[1,2,3,4,5,6,7].map((value) => <label key={value} className={`cursor-pointer rounded-lg border p-2 text-center text-sm ${answers[item.key] === value ? "border-primary bg-secondary text-primary" : "bg-white"}`}><input className="sr-only" type="radio" name={item.key} value={value} checked={answers[item.key] === value} onChange={() => setAnswers((current) => ({ ...current, [item.key]: value }))}/>{value}</label>)}</div><div className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>{locale === "zh-CN" ? item.lowZh : item.lowEn}</span><span>{locale === "zh-CN" ? item.highZh : item.highEn}</span></div></fieldset>)}</div><TimedButton seconds={5} ready={complete} locale={locale} label={locale === "zh-CN" ? "提交并结束研究" : "Submit and finish"} blockedLabel={locale === "zh-CN" ? "请完成全部题目" : "Answer every item"} className="mt-7 h-12 w-full" onClick={() => onSubmit(answers as RecoveryPostSurvey)}/></div></main>;
}

function Complete({locale,status,retry,setScreen,t}:{locale:Locale;status:"saving"|"saved"|"error";retry:()=>void;setScreen:(s:Screen)=>void;t:typeof copy[Locale]}) {
  if(status==="saving") return <div className="grid min-h-screen place-items-center bg-[#f7f6f2] p-8"><div className="max-w-lg text-center"><div className="mx-auto grid size-16 animate-pulse place-items-center rounded-2xl bg-[var(--active-soft)] text-[var(--active)]"><Clock size={34}/></div><h1 className="mt-6 text-3xl font-semibold">{locale==="zh-CN"?"正在安全保存":"Saving securely"}</h1><p className="mt-3 text-muted-foreground">{locale==="zh-CN"?"请保持页面开启，正在确认结果已写入研究数据库。":"Keep this page open while we confirm that your results reached the research database."}</p></div></div>;
  if(status==="error") return <div className="grid min-h-screen place-items-center bg-[#f7f6f2] p-8"><div className="max-w-lg text-center"><div className="mx-auto grid size-16 place-items-center rounded-2xl bg-red-50 text-red-600"><WarningCircle size={36} weight="fill"/></div><h1 className="mt-6 text-3xl font-semibold">{locale==="zh-CN"?"保存尚未完成":"Save not confirmed"}</h1><p role="alert" className="mt-3 text-muted-foreground">{locale==="zh-CN"?"网络或服务器暂时无法确认保存。你的回答仍保留在本设备中，请重试且不要关闭页面。":"The network or server could not confirm the save. Your answers remain on this device; retry without closing the page."}</p><Button className="mt-8" onClick={retry}>{locale==="zh-CN"?"重试保存":"Retry save"}</Button></div></div>;
  return <div className="grid min-h-screen place-items-center bg-[#f7f6f2] p-8"><div className="max-w-lg text-center"><div className="mx-auto grid size-16 place-items-center rounded-2xl bg-[var(--active-soft)] text-[var(--active)]"><CheckCircle size={36} weight="fill"/></div><h1 className="mt-6 text-3xl font-semibold">{t.completed}</h1><p className="mt-3 text-muted-foreground">{t.completeText}</p><Button variant="outline" className="mt-8" onClick={()=>setScreen("landing")}>{t.back}</Button></div></div>;
}
