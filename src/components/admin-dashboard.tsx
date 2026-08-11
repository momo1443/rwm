"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Brain, CheckCircle, DownloadSimple, LockKey, SignOut,
  Trash, Users, WarningCircle,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { answerLabel, mean, scoredSubscales, subscaleScores, surveyItems, type SurveyAnswer } from "@/lib/pre-survey-admin";

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
  has_recall: boolean;
  has_problem_state: boolean;
  event_count: number;
  event_sequence_complete: boolean;
  initial_material_presented: boolean;
  material_completion_count: number;
  recovery_rendered: boolean;
  recovery_tabs: string[];
};
type ParticipantResult = Omit<ResultSummary, "memo_length" | "has_recall" | "has_problem_state" | "event_count" | "event_sequence_complete" | "initial_material_presented" | "material_completion_count" | "recovery_rendered" | "recovery_tabs"> & {
  memo: string | null;
  chat: Array<{ role: "user" | "assistant"; text: string }> | null;
  problem_state: unknown;
  recall: Record<string, string> | null;
  recovery_state: unknown;
};
type ResultEvent = { id: string; sequence_number: number; event_type: string; stage: string; client_timestamp: string };
type AccessState = "loading" | "login" | "ready" | "unavailable";
type DetailTab = "overview" | "survey" | "task" | "events" | "raw";

const statusLabels: Record<AnalysisStatus, string> = { included: "纳入分析", excluded: "排除分析", trashed: "回收站" };
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
  if (result.status !== "completed") flags.push("未完成");
  if (!result.pre_survey || Object.keys(result.pre_survey).length < surveyItems.length) flags.push("前测缺失");
  if (result.memo_length < 600) flags.push("Memo 较短");
  if (!result.has_recall) flags.push("无回忆数据");
  if (!result.has_problem_state && result.condition !== "control") flags.push("无 Problem State");
  if (!result.event_sequence_complete) flags.push("事件序列不完整");
  if (!result.initial_material_presented) flags.push("缺少 B1 首次呈现");
  if (result.material_completion_count < 5) flags.push(`材料暴露 ${result.material_completion_count}/5`);
  if (result.status === "completed" && !result.recovery_rendered) flags.push("缺少恢复渲染证据");
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
      <p className="mt-2 text-[11px] leading-5 text-muted-foreground">均为 1–5 分题项均值。AILS-CCS 四维度单列；研究自我效能和议题熟悉度属于研究基线，不并入 AILS 总分。</p>
    </section>
    <section>
      <h3 className="text-sm font-semibold">逐题答案</h3>
      <div className="mt-3 max-h-[520px] overflow-auto rounded-lg border"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-muted"><tr><th className="p-2">维度</th><th className="p-2">题目</th><th className="p-2">答案</th></tr></thead><tbody>{surveyItems.map((item) => <tr key={item.id} className="border-t"><td className="p-2 text-muted-foreground">{item.subscale || item.group}</td><td className="p-2">{item.label}</td><td className="p-2 font-medium">{answerLabel(item, answers[item.id])}</td></tr>)}</tbody></table></div>
    </section>
  </div>;
}

function CohortOverview({ results }: { results: ResultSummary[] }) {
  const analysisReady = results.filter((result) => result.analysis_status === "included" && result.status === "completed" && result.pre_survey);
  const conditions = [...new Set(results.map((result) => result.condition))];
  const aggregates = scoredSubscales.map((subscale) => {
    const values = analysisReady.map((result) => subscaleScores(result.pre_survey)[subscale]).filter((value): value is number => value != null);
    return { subscale, value: mean(values), n: values.length };
  });
  return <section className="mb-6 grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
    <article className="rounded-xl border bg-white p-5"><h2 className="font-semibold">样本分布</h2><p className="mt-1 text-xs text-muted-foreground">按当前全部记录统计</p><div className="mt-4 space-y-3">{conditions.map((condition) => { const count = results.filter((result) => result.condition === condition).length; return <div key={condition}><div className="mb-1 flex justify-between text-xs"><span>{condition}</span><span>{count}</span></div><div className="h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-slate-500" style={{ width: `${results.length ? count / results.length * 100 : 0}%` }}/></div></div>; })}</div></article>
    <article className="rounded-xl border bg-white p-5"><h2 className="font-semibold">前测维度概览</h2><p className="mt-1 text-xs text-muted-foreground">仅统计“纳入分析且已完成”的被试；不同维度不合并</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{aggregates.map(({ subscale, value, n }) => <ScoreBar key={subscale} label={subscale} value={value} n={n}/>)}</div></article>
  </section>;
}

export function AdminDashboard() {
  const [access, setAccess] = useState<AccessState>("loading");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [storageMode, setStorageMode] = useState("");
  const [results, setResults] = useState<ResultSummary[]>([]);
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<ParticipantResult | null>(null);
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
      .then(async (response) => { if (!response.ok) throw new Error("detail_failed"); return await response.json() as { result: ParticipantResult; events: ResultEvent[] }; })
      .then((body) => { setDetail({ ...body.result, analysis_status: body.result.analysis_status || "included" }); setEvents(body.events); setReviewNote(body.result.review_note || ""); setDeleteConfirmation(""); })
      .catch((requestError: unknown) => { if (requestError instanceof DOMException && requestError.name === "AbortError") return; setError("无法读取该被试的详细结果。"); });
    return () => controller.abort();
  }, [access, selected]);

  const filteredResults = useMemo(() => results.filter((result) => {
    const matchesFilter = filter === "all" || result.analysis_status === filter;
    const normalized = query.trim().toLowerCase();
    return matchesFilter && (!normalized || `${result.participant_code} ${result.session_id} ${result.condition}`.toLowerCase().includes(normalized));
  }), [filter, query, results]);

  const login = async (event: FormEvent) => { event.preventDefault(); setError(""); const response = await fetch("/api/research/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) }); if (!response.ok) { setError(response.status === 503 ? "研究者后台尚未配置。" : "密码错误。"); return; } setPassword(""); await loadResults(); };
  const logout = async () => { await fetch("/api/research/login", { method: "DELETE" }); setResults([]); setSelected(""); setDetail(null); setAccess("login"); };

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
  const tabs: Array<[DetailTab, string]> = [["overview", "概览"], ["survey", "前测"], ["task", "任务内容"], ["events", "事件"], ["raw", "原始 JSON"]];

  return <div className="min-h-screen bg-[#f7f6f2] text-foreground">
    <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b bg-white px-7 py-3"><div className="flex items-center gap-4"><div className="grid size-9 place-items-center rounded-lg bg-primary text-white"><Brain size={20}/></div><div><p className="font-semibold">RMW 研究者后台</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Protected participant results · {storageMode}</p></div></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void loadResults()}>刷新</Button><Button variant="outline" onClick={() => void exportResults("analysis")}><DownloadSimple/>导出分析样本</Button><Button variant="outline" onClick={() => void exportResults("1")}><DownloadSimple/>导出全部原始数据</Button><Button variant="ghost" onClick={logout}><SignOut/>退出</Button></div></header>
    <main className="mx-auto max-w-[1580px] p-7">
      {error && <div className="mb-5 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><WarningCircle/>{error}<button className="ml-auto" onClick={() => setError("")} aria-label="关闭提示">×</button></div>}
      <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5"><article className="rounded-xl border bg-white p-5"><Users className="text-primary"/><p className="mt-3 text-3xl font-semibold">{results.length}</p><p className="mt-1 text-sm text-muted-foreground">全部记录</p></article><article className="rounded-xl border bg-white p-5"><CheckCircle className="text-emerald-600"/><p className="mt-3 text-3xl font-semibold">{completed}</p><p className="mt-1 text-sm text-muted-foreground">已完成</p></article><article className="rounded-xl border bg-white p-5"><Brain className="text-primary"/><p className="mt-3 text-3xl font-semibold">{included}</p><p className="mt-1 text-sm text-muted-foreground">纳入分析</p></article><article className="rounded-xl border bg-white p-5"><WarningCircle className="text-amber-600"/><p className="mt-3 text-3xl font-semibold">{excluded}</p><p className="mt-1 text-sm text-muted-foreground">排除分析</p></article><article className="rounded-xl border bg-white p-5"><Trash className="text-slate-500"/><p className="mt-3 text-3xl font-semibold">{trashed}</p><p className="mt-1 text-sm text-muted-foreground">回收站</p></article></section>
      <CohortOverview results={results}/>
      <div className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
        <section className="overflow-hidden rounded-xl border bg-white"><div className="border-b p-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-semibold">被试结果</h2><p className="mt-1 text-xs text-muted-foreground">质量提示只用于人工复核，不会自动排除样本。</p></div><div className="flex gap-2"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索编号或条件" aria-label="搜索被试" className="h-9 rounded-md border px-3 text-xs outline-none focus:ring-2 focus:ring-primary/20"/><select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} aria-label="分析状态筛选" className="h-9 rounded-md border bg-white px-2 text-xs"><option value="all">全部状态</option><option value="included">纳入分析</option><option value="excluded">排除分析</option><option value="trashed">回收站</option></select></div></div></div>
          {filteredResults.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">没有符合条件的被试结果。</div> : <div className="max-h-[760px] overflow-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 border-b bg-muted text-xs"><tr><th className="p-3">参与者 / 运行</th><th className="p-3">完成</th><th className="p-3">分析状态</th><th className="p-3">时长</th><th className="p-3">数据质量</th></tr></thead><tbody>{filteredResults.map((result) => { const rowFlags = qualityFlags(result); return <tr key={result.session_id} onClick={() => { setDetail(null); setSelected(result.session_id); setTab("overview"); }} className={`cursor-pointer border-b last:border-0 ${selected === result.session_id ? "bg-secondary/55" : "hover:bg-muted/25"}`}><td className="p-3"><p className="font-mono text-xs">{result.participant_code}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground">运行 {result.session_id.slice(0,8)} · {result.condition} · {result.locale}</p></td><td className="p-3"><Badge variant={result.status === "completed" ? "default" : "secondary"}>{result.status === "completed" ? "已完成" : "进行中"}</Badge></td><td className="p-3"><Badge variant="outline">{statusLabels[result.analysis_status]}</Badge></td><td className="p-3 text-xs">{formatDuration(result)}</td><td className="p-3">{rowFlags.length ? <div className="flex max-w-44 flex-wrap gap-1">{rowFlags.map((flag) => <span key={flag} className="rounded bg-amber-50 px-1.5 py-1 text-[10px] text-amber-800">{flag}</span>)}</div> : <span className="text-xs text-emerald-700">未见明显缺失</span>}</td></tr>; })}</tbody></table></div>}
        </section>
        <aside className="min-h-[720px] rounded-xl border bg-white p-5">{!detail ? <div className="grid h-full min-h-96 place-items-center text-sm text-muted-foreground">选择一个被试查看详细记录</div> : <div>
          <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-sm font-semibold">{detail.participant_code}</p><p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">运行 ID：{detail.session_id}</p><p className="mt-1 text-xs text-muted-foreground">{detail.condition} · {detail.locale} · {events.length} 个事件</p></div><div className="flex flex-col items-end gap-1"><Badge>{detail.status === "completed" ? "已完成" : "进行中"}</Badge><Badge variant="outline">{statusLabels[detail.analysis_status]}</Badge></div></div>
          <nav className="mt-5 flex overflow-x-auto border-b" aria-label="被试详情">{tabs.map(([value, label]) => <button key={value} onClick={() => setTab(value)} className={`shrink-0 border-b-2 px-3 py-2 text-xs ${tab === value ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground"}`}>{label}</button>)}</nav>
          <div className="mt-5">{tab === "overview" && <div className="space-y-5"><section><h3 className="text-sm font-semibold">记录概览</h3><dl className="mt-3 grid grid-cols-2 gap-3 text-xs"><div className="rounded-lg bg-muted/40 p-3"><dt className="text-muted-foreground">开始</dt><dd className="mt-1">{formatTime(detail.consented_at)}</dd></div><div className="rounded-lg bg-muted/40 p-3"><dt className="text-muted-foreground">完成</dt><dd className="mt-1">{formatTime(detail.completed_at)}</dd></div><div className="rounded-lg bg-muted/40 p-3"><dt className="text-muted-foreground">实验时长</dt><dd className="mt-1">{formatDuration(detail)}</dd></div><div className="rounded-lg bg-muted/40 p-3"><dt className="text-muted-foreground">任务</dt><dd className="mt-1">{detail.task_id}</dd></div></dl></section><section><h3 className="text-sm font-semibold">行为证据完整性</h3><dl className="mt-3 grid grid-cols-2 gap-3 text-xs"><div className="rounded-lg border p-3"><dt className="text-muted-foreground">事件序列</dt><dd className="mt-1 font-medium">{selectedSummary?.event_sequence_complete?"从 1 连续":"缺失或不连续"}</dd></div><div className="rounded-lg border p-3"><dt className="text-muted-foreground">B1 首次呈现</dt><dd className="mt-1 font-medium">{selectedSummary?.initial_material_presented?"已记录":"未记录"}</dd></div><div className="rounded-lg border p-3"><dt className="text-muted-foreground">材料最低暴露完成</dt><dd className="mt-1 font-medium">{selectedSummary?.material_completion_count??0} / 5</dd></div><div className="rounded-lg border p-3"><dt className="text-muted-foreground">恢复支持实际渲染</dt><dd className="mt-1 font-medium">{selectedSummary?.recovery_rendered?"已记录":"未记录"}</dd></div><div className="col-span-2 rounded-lg border p-3"><dt className="text-muted-foreground">查看过的恢复页签</dt><dd className="mt-1 font-medium">{selectedSummary?.recovery_tabs.length?selectedSummary.recovery_tabs.join("、"):"无记录"}</dd></div></dl><p className="mt-2 text-[11px] leading-5 text-muted-foreground">“材料完成”表示该材料连续处于激活状态至少 5 秒，是最低暴露证据，不等同于证明被试认真阅读或理解。</p></section><section><h3 className="text-sm font-semibold">质量提示</h3><div className="mt-2 flex flex-wrap gap-2">{flags.length ? flags.map((flag) => <span key={flag} className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">{flag}</span>) : <span className="text-xs text-emerald-700">未见明显缺失</span>}</div></section><section className="rounded-xl border p-4"><h3 className="text-sm font-semibold">人工审核</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">排除不会删除原始数据；请记录可审计的理由。质量提示不会自动改变样本状态。</p><label className="mt-4 block text-xs font-medium" htmlFor="exclusion-reason">排除或移入回收站理由</label><select id="exclusion-reason" value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-xs">{exclusionReasons.map((item) => <option key={item}>{item}</option>)}</select><label className="mt-3 block text-xs font-medium" htmlFor="review-note">审核备注</label><textarea id="review-note" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} rows={3} className="mt-1 w-full rounded-md border p-2 text-xs outline-none focus:ring-2 focus:ring-primary/20" placeholder="可选：记录具体判断依据"/><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={() => void updateReview("included")}>纳入分析</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void updateReview("excluded")}>排除分析</Button><Button size="sm" variant="outline" className="text-destructive" disabled={busy} onClick={() => void updateReview("trashed")}><Trash/>移入回收站</Button></div>{detail.exclusion_reason && <p className="mt-3 text-xs text-muted-foreground">当前理由：{detail.exclusion_reason}</p>}{detail.analysis_status === "trashed" && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3"><p className="text-xs font-semibold text-red-800">永久删除不可恢复，并会删除本次运行的全部事件。</p><label className="mt-2 block text-xs text-red-800" htmlFor="delete-confirmation">输入完整运行 ID 确认：{detail.session_id}</label><input id="delete-confirmation" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-red-200 bg-white px-2 font-mono text-xs"/><Button size="sm" className="mt-2 bg-red-700 hover:bg-red-800" disabled={busy || deleteConfirmation !== detail.session_id} onClick={() => void permanentlyDelete()}>永久删除本次运行</Button></div>}</section></div>}
            {tab === "survey" && <IndividualSurvey answers={detail.pre_survey}/>} {tab === "task" && <div className="space-y-5"><section><h3 className="mb-2 text-sm font-semibold">最终 Memo</h3><div className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/45 p-3 text-xs leading-6">{detail.memo || "尚未保存"}</div></section><section><h3 className="mb-2 text-sm font-semibold">无辅助回忆</h3><JsonBlock value={detail.recall}/></section><section><h3 className="mb-2 text-sm font-semibold">Problem State</h3><JsonBlock value={detail.problem_state}/></section></div>}
            {tab === "events" && <div><h3 className="mb-2 text-sm font-semibold">事件日志（{events.length}）</h3><JsonBlock value={events}/></div>}
            {tab === "raw" && <div className="space-y-4"><section><h3 className="mb-2 text-sm font-semibold">被试结果</h3><JsonBlock value={detail}/></section><section><h3 className="mb-2 text-sm font-semibold">AI 对话</h3><JsonBlock value={detail.chat}/></section><section><h3 className="mb-2 text-sm font-semibold">恢复阶段状态</h3><JsonBlock value={detail.recovery_state}/></section></div>}</div>
        </div>}</aside>
      </div>
    </main>
  </div>;
}
