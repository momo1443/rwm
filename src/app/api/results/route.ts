import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { createParticipant, findSession, readAllResults, resultStorageMode, saveResultEvents, updateParticipant } from "@/lib/result-store";
import { getParticipantSessionSecret } from "@/lib/results-server";
import { createSignedToken, verifySignedToken } from "@/lib/signed-token";
import { researchTaskIds } from "@/lib/research-task";

const participantCodeSchema = z.string().regex(/^RMW-[A-F0-9]{8}$/);
const sessionIdSchema = z.string().uuid();
const boundedJson = z.unknown().refine((value) => JSON.stringify(value).length <= 200000, "Structured result is too large");
const reasoningAnswersSchema = z.object({
  goal: z.string().trim().min(2).max(4000),
  position: z.string().trim().min(2).max(4000),
  constraint: z.string().trim().min(2).max(4000),
  rejectedPath: z.string().trim().min(2).max(4000),
  uncertainty: z.string().trim().min(2).max(4000),
  nextAction: z.string().trim().min(2).max(4000),
}).strict();
const recoveryProbeSchema = z.object({
  reasoning: reasoningAnswersSchema,
  submittedAt: z.string().datetime(),
}).strict();
const recoveryAssessmentSchema = z.object({
  version: z.literal("reasoning-recovery-v2"),
  taskId: z.enum(researchTaskIds),
  probes: z.object({ t1: recoveryProbeSchema.optional(), t2: recoveryProbeSchema.optional(), t3: recoveryProbeSchema.optional() }).strict(),
  participantNotes: z.string().trim().min(30).max(10000).optional(),
  readiness: z.object({
    supportRenderedAt: z.string().datetime(),
    readyAt: z.string().datetime(),
    latencyMs: z.number().int().nonnegative().max(60 * 60 * 1000),
    viewedSections: z.array(z.string().min(1).max(100)).max(20),
  }).strict().optional(),
  postSurvey: z.object({
    // Adapted NASA-TLX task load
    mentalDemand: z.number().int().min(1).max(7),
    temporalDemand: z.number().int().min(1).max(7),
    effort: z.number().int().min(1).max(7),
    frustration: z.number().int().min(1).max(7),
    performanceSatisfaction: z.number().int().min(1).max(7),
    // Perceived reasoning-position loss (subjective corroboration of T1-T2 loss)
    judgmentUncertain: z.number().int().min(1).max(7),
    rejectedPathBlurred: z.number().int().min(1).max(7),
    nextActionForgotten: z.number().int().min(1).max(7),
    // Metacognitive confidence
    distinguishCertainty: z.number().int().min(1).max(7),
    confidentInAnswer: z.number().int().min(1).max(7),
    // AI reliance
    reliedOnAI: z.number().int().min(1).max(7),
    mightMissAIErrors: z.number().int().min(1).max(7),
    // Agency
    memoOwnership: z.number().int().min(1).max(7),
    overallControl: z.number().int().min(1).max(7),
  }).strict().optional(),
}).strict();
const snapshotSchema = z.object({
  preSurvey: z.record(z.string(), z.number().int().min(1).max(5)).optional(),
  phaseOneMemo: z.string().max(20000).optional(),
  phaseOneChat: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(8000) })).max(60).optional(),
  phaseOneCapturedAt: z.string().datetime().optional(),
  memo: z.string().max(20000).optional(),
  chat: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(8000) })).max(60).optional(),
  problemState: boundedJson.optional(),
  recall: z.record(z.string(), z.string().max(8000)).optional(),
  recoveryState: boundedJson.optional(),
  taskAssessment: recoveryAssessmentSchema.optional(),
}).strict();
const eventSchema = z.object({
  id: z.string().uuid(),
  sessionId: sessionIdSchema,
  type: z.string().min(1).max(100),
  stage: z.string().min(1).max(100),
  targetType: z.string().max(100).optional(),
  targetId: z.string().max(200).optional(),
  sequenceNumber: z.number().int().positive(),
  payload: z.record(z.string(), z.unknown()).refine((value) => JSON.stringify(value).length <= 20000, "Event payload is too large"),
  at: z.string().datetime(),
});
const eventBatchSchema = z.array(eventSchema).min(1).max(1000).refine(
  (events) => JSON.stringify(events).length <= 900000,
  "Event batch is too large",
);
const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    sessionId: sessionIdSchema,
    participantCode: participantCodeSchema,
    locale: z.enum(["zh-CN", "en"]),
    condition: z.enum(["rmw"]),
    taskId: z.enum(researchTaskIds),
    assignmentMode: z.enum(["manual", "manual_condition"]),
    token: z.string().min(1).max(2000).optional(),
  }),
  z.object({ action: z.literal("event"), token: z.string().min(1).max(2000), event: eventSchema }),
  z.object({ action: z.literal("events"), token: z.string().min(1).max(2000), events: eventBatchSchema }),
  z.object({ action: z.literal("snapshot"), token: z.string().min(1).max(2000), data: snapshotSchema }),
  z.object({ action: z.literal("complete"), token: z.string().min(1).max(2000), data: snapshotSchema }),
]);

async function participantFromToken(token: string, secret: string) {
  const payload = await verifySignedToken(token, secret);
  if (payload?.scope !== "participant" || typeof payload.participantCode !== "string" || typeof payload.sessionId !== "string") return null;
  if (!participantCodeSchema.safeParse(payload.participantCode).success || !sessionIdSchema.safeParse(payload.sessionId).success) return null;
  return {
    participantCode: payload.participantCode,
    sessionId: payload.sessionId,
    assignmentMode: payload.assignmentMode === "manual_condition" ? "manual_condition" as const : "manual" as const,
  };
}

// Single-protocol study: only one task exists, so this trivially always
// returns it. Kept (rather than hardcoded) so the balancing logic still
// works unchanged if a second task is ever reintroduced.
async function balancedTaskAssignment(condition: "rmw") {
  const database = await readAllResults();
  const activeCutoff = Date.now() - 12 * 60 * 60 * 1000;
  const activeRows = database.results.filter((result) => {
    if (result.analysis_status === "trashed" || result.condition !== condition) return false;
    const isCurrentCompletedCohort = result.status === "completed"
      && result.task_assessment
      && typeof result.task_assessment === "object"
      && "version" in result.task_assessment
      && result.task_assessment.version === "reasoning-recovery-v2";
    const isCurrentActiveRun = result.status === "started" && new Date(result.created_at).getTime() >= activeCutoff;
    return Boolean(isCurrentCompletedCohort || isCurrentActiveRun);
  });
  const counts = researchTaskIds.map((taskId) => ({
    taskId,
    count: activeRows.filter((row) => row.task_id === taskId).length,
  }));
  const minimum = Math.min(...counts.map((cell) => cell.count));
  const leastFilled = counts.filter((cell) => cell.count === minimum);
  return leastFilled[randomInt(leastFilled.length)].taskId;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 1_000_000) return NextResponse.json({ error: "Result payload is too large" }, { status: 413 });
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid result payload" }, { status: 400 });
  const storageMode = resultStorageMode();
  const sessionSecret = getParticipantSessionSecret();
  if (!storageMode || !sessionSecret) {
    return NextResponse.json({ mode: "unavailable", error: "Result storage is not configured" }, { status: 503 });
  }

  try {
    if (parsed.data.action === "start") {
      const { sessionId, participantCode, locale, token: resumeToken } = parsed.data;
      const existing = await findSession(sessionId);
      let condition = parsed.data.condition;
      let taskId = parsed.data.taskId;
      let assignmentMode = parsed.data.assignmentMode;
      if (existing) {
        const resumedSession = resumeToken ? await participantFromToken(resumeToken, sessionSecret) : null;
        if (resumedSession?.sessionId !== sessionId || resumedSession.participantCode !== participantCode) {
          return NextResponse.json({ error: "Study session is already in use" }, { status: 409 });
        }
        condition = existing.condition as typeof condition;
        taskId = existing.task_id as typeof taskId;
        assignmentMode = resumedSession.assignmentMode;
      } else {
        if (assignmentMode === "manual_condition") {
          taskId = await balancedTaskAssignment(condition);
        }
        await createParticipant({ sessionId, participantCode, locale, condition, taskId });
      }
      const token = await createSignedToken({
        scope: "participant",
        participantCode,
        sessionId,
        assignmentMode,
        exp: Date.now() + 12 * 60 * 60 * 1000,
      }, sessionSecret);
      return NextResponse.json({ mode: storageMode, token, sessionId, condition, taskId, assignmentMode });
    }

    const session = await participantFromToken(parsed.data.token, sessionSecret);
    if (!session) return NextResponse.json({ error: "Invalid participant session" }, { status: 401 });

    if (parsed.data.action === "event" || parsed.data.action === "events") {
      const events = parsed.data.action === "event" ? [parsed.data.event] : parsed.data.events;
      if (events.some((event) => event.sessionId !== session.sessionId)) {
        return NextResponse.json({ error: "Event session does not match token" }, { status: 403 });
      }
      await saveResultEvents(session.sessionId, session.participantCode, events.map((event) => ({
        id: event.id,
        sequence_number: event.sequenceNumber,
        event_type: event.type,
        stage: event.stage,
        target_type: event.targetType || null,
        target_id: event.targetId || null,
        payload: event.payload,
        client_timestamp: event.at,
      })));
      return NextResponse.json({ mode: "saved", count: events.length });
    }

    const data = parsed.data.data;
    await updateParticipant(session.sessionId, {
      ...(data.preSurvey !== undefined && { pre_survey: data.preSurvey }),
      ...(data.phaseOneMemo !== undefined && { phase_one_memo: data.phaseOneMemo }),
      ...(data.phaseOneChat !== undefined && { phase_one_chat: data.phaseOneChat }),
      ...(data.phaseOneCapturedAt !== undefined && { phase_one_captured_at: data.phaseOneCapturedAt }),
      ...(data.memo !== undefined && { memo: data.memo }),
      ...(data.chat !== undefined && { chat: data.chat }),
      ...(data.problemState !== undefined && { problem_state: data.problemState }),
      ...(data.recall !== undefined && { recall: data.recall }),
      ...(data.recoveryState !== undefined && { recovery_state: data.recoveryState }),
      ...(data.taskAssessment !== undefined && { task_assessment: data.taskAssessment }),
    }, parsed.data.action === "complete", parsed.data.action === "complete" && session.assignmentMode === "manual"
      ? { analysisStatus: "excluded", exclusionReason: "研究者测试" }
      : undefined);
    return NextResponse.json({ mode: parsed.data.action === "complete" ? "completed" : "saved" });
  } catch (error) {
    console.error("Result storage request failed", { action: parsed.data.action, storageMode, error });
    return NextResponse.json({ error: "Could not save research result" }, { status: 502 });
  }
}
