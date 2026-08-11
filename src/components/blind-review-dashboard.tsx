"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle, LockKey } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { blindReviewAnchors, blindReviewRubric, emptyBlindReviewScores, type BlindReviewScores, type BlindReviewScoreSet } from "@/lib/blind-review";

type BlindResult = {
  blind_id: string;
  locale: string;
  phase_one_memo: string;
  final_memo: string;
  blind_review_scores: BlindReviewScoreSet | null;
  blind_review_note: string | null;
  blind_reviewed_at: string | null;
};

type AccessState = "loading" | "login" | "ready" | "unavailable";

export function BlindReviewDashboard() {
  const [access, setAccess] = useState<AccessState>("loading");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState<BlindResult[]>([]);
  const [activeId, setActiveId] = useState("");
  const [beforeScores, setBeforeScores] = useState<BlindReviewScores>(emptyBlindReviewScores);
  const [afterScores, setAfterScores] = useState<BlindReviewScores>(emptyBlindReviewScores);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/research/results?view=blind", { cache: "no-store" });
    if (response.status === 401) { setAccess("login"); return; }
    if (response.status === 503) { setAccess("unavailable"); return; }
    if (!response.ok) throw new Error("无法读取盲评数据");
    const body = await response.json() as { results: BlindResult[] };
    setResults(body.results);
    const first = body.results[0];
    setActiveId((current) => current || first?.blind_id || "");
    if (first) {
      setBeforeScores(first.blind_review_scores?.before || emptyBlindReviewScores);
      setAfterScores(first.blind_review_scores?.after || emptyBlindReviewScores);
      setNote(first.blind_review_note || "");
    }
    setAccess("ready");
  }, []);

  useEffect(() => {
    let ignore = false;
    fetch("/api/research/results?view=blind", { cache: "no-store" })
      .then(async (response) => {
        if (ignore) return;
        if (response.status === 401) { setAccess("login"); return; }
        if (response.status === 503) { setAccess("unavailable"); return; }
        if (!response.ok) throw new Error("无法读取盲评数据");
        const body = await response.json() as { results: BlindResult[] };
        if (ignore) return;
        const first = body.results[0];
        setResults(body.results);
        setActiveId(first?.blind_id || "");
        setBeforeScores(first?.blind_review_scores?.before || emptyBlindReviewScores);
        setAfterScores(first?.blind_review_scores?.after || emptyBlindReviewScores);
        setNote(first?.blind_review_note || "");
        setAccess("ready");
      })
      .catch((reason) => {
        if (ignore) return;
        setError(reason instanceof Error ? reason.message : "无法读取盲评数据");
        setAccess("login");
      });
    return () => { ignore = true; };
  }, []);

  const active = useMemo(() => results.find((result) => result.blind_id === activeId) || null, [activeId, results]);

  function selectResult(result: BlindResult) {
    setActiveId(result.blind_id);
    setBeforeScores(result.blind_review_scores?.before || emptyBlindReviewScores);
    setAfterScores(result.blind_review_scores?.after || emptyBlindReviewScores);
    setNote(result.blind_review_note || "");
    setError("");
  }

  async function login(event: FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/research/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    if (!response.ok) { setError(response.status === 401 ? "密码错误" : "研究者登录未配置"); return; }
    setPassword("");
    await load();
  }

  async function save() {
    if (!active) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/research/results", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ blindId: active.blind_id, blindReviewScores: { before: beforeScores, after: afterScores }, blindReviewNote: note || null }),
      });
      if (!response.ok) throw new Error("保存盲评分数失败");
      const reviewedAt = new Date().toISOString();
      setResults((current) => current.map((result) => result.blind_id === active.blind_id ? { ...result, blind_review_scores: { before: beforeScores, after: afterScores }, blind_review_note: note || null, blind_reviewed_at: reviewedAt } : result));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存盲评分数失败");
    } finally {
      setSaving(false);
    }
  }

  if (access === "loading") return <main className="grid min-h-screen place-items-center bg-[#f7f6f2] text-sm text-muted-foreground">正在验证研究者权限…</main>;
  if (access === "unavailable") return <main className="grid min-h-screen place-items-center bg-[#f7f6f2] p-8"><p className="rounded-xl border bg-white p-6">研究数据或研究者登录尚未配置。</p></main>;
  if (access === "login") return <main className="grid min-h-screen place-items-center bg-[#f7f6f2] p-8"><form onSubmit={login} className="w-full max-w-sm rounded-2xl border bg-white p-7 shadow-sm"><LockKey size={30}/><h1 className="mt-4 text-xl font-semibold">结果盲评</h1><p className="mt-2 text-sm text-muted-foreground">使用研究者密码登录。评分界面不会显示实验条件或参与者编号。</p><label className="mt-5 block text-sm font-medium">研究者密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-11 w-full rounded-lg border px-3" autoComplete="current-password"/></label>{error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}<Button type="submit" className="mt-5 w-full">登录</Button></form></main>;

  return <main className="min-h-screen bg-[#f7f6f2] p-5 lg:p-8">
    <div className="mx-auto max-w-[1500px]"><header className="mb-5 flex items-end justify-between"><div><p className="text-xs uppercase tracking-widest text-muted-foreground">Recovery outcome rubric v1</p><h1 className="mt-1 text-2xl font-semibold">结果盲评</h1><p className="mt-2 text-sm text-muted-foreground">仅比较中断前快照与最终 memo；不显示条件、参与者编号或恢复支持内容。</p></div><p className="text-sm text-muted-foreground">已评 {results.filter((result) => result.blind_reviewed_at).length} / {results.length}</p></header>
      {results.length === 0 ? <div className="rounded-xl border bg-white p-8 text-center text-muted-foreground">暂无同时具有中断前快照和最终 memo 的已完成记录。</div> : <div className="grid gap-5 xl:grid-cols-[210px_1fr_360px]">
        <nav aria-label="盲评记录" className="max-h-[calc(100vh-150px)] overflow-auto rounded-xl border bg-white p-2">{results.map((result) => <button key={result.blind_id} onClick={() => selectResult(result)} className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${activeId === result.blind_id ? "bg-secondary font-medium" : "hover:bg-muted/60"}`}><span>{result.blind_id}</span>{result.blind_reviewed_at && <CheckCircle className="text-emerald-600" weight="fill"/>}</button>)}</nav>
        <section className="grid min-h-[680px] gap-4 lg:grid-cols-2"><MemoCard title="中断前 memo（冻结快照）" text={active?.phase_one_memo || ""}/><MemoCard title="最终 memo（恢复阶段结束）" text={active?.final_memo || ""}/></section>
        <aside className="rounded-xl border bg-white p-5"><h2 className="font-semibold">{active?.blind_id}</h2><p className="mt-1 text-xs text-muted-foreground">同一 rubric 分别评中断前与最终版本；主结果为最终分减中断前分。</p><div className="mt-5 space-y-5">{blindReviewRubric.map((item) => <fieldset key={item.key}><legend className="text-sm font-medium">{item.label}</legend><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p><div className="mt-2 grid grid-cols-2 gap-2"><ScoreSelect label={`${item.label}中断前评分`} value={beforeScores[item.key]} onChange={(value) => setBeforeScores((current) => ({ ...current, [item.key]: value }))}/><ScoreSelect label={`${item.label}最终评分`} value={afterScores[item.key]} onChange={(value) => setAfterScores((current) => ({ ...current, [item.key]: value }))}/></div><p className="mt-1 text-right text-[11px] text-muted-foreground">变化 {afterScores[item.key] - beforeScores[item.key] >= 0 ? "+" : ""}{afterScores[item.key] - beforeScores[item.key]}</p></fieldset>)}</div><div className="mt-5 border-t pt-4"><p className="text-sm font-medium">中断前 {scoreTotal(beforeScores)} / 20 · 最终 {scoreTotal(afterScores)} / 20</p><p className="mt-1 text-sm font-semibold text-primary">质量变化 {scoreTotal(afterScores) - scoreTotal(beforeScores) >= 0 ? "+" : ""}{scoreTotal(afterScores) - scoreTotal(beforeScores)}</p><label className="mt-4 block text-sm font-medium">评审备注<Textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} className="mt-2 min-h-24" placeholder="记录无法从 memo 判断的内容或评分理由"/></label>{error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}<Button onClick={save} disabled={saving || !active} className="mt-4 w-full">{saving ? "保存中…" : "保存盲评"}</Button></div></aside>
      </div>}
    </div>
  </main>;
}

function MemoCard({ title, text }: { title: string; text: string }) {
  return <article className="flex min-h-0 flex-col rounded-xl border bg-white"><h2 className="border-b px-5 py-4 text-sm font-semibold">{title}</h2><pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-5 font-sans text-sm leading-7">{text || "（空）"}</pre></article>;
}

function scoreTotal(scores: BlindReviewScores) {
  return Object.values(scores).reduce((sum, value) => sum + value, 0);
}

function ScoreSelect({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="text-[11px] text-muted-foreground">{label.includes("中断前") ? "中断前" : "最终"}<select aria-label={label} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-1 h-9 w-full rounded-lg border bg-white px-2 text-sm text-foreground">{blindReviewAnchors.map((anchor, score) => <option key={anchor} value={score}>{anchor}</option>)}</select></label>;
}
