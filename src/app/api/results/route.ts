import { NextResponse } from "next/server";
import { z } from "zod";
import { createParticipant, findSession, resultStorageMode, saveResultEvent, updateParticipant } from "@/lib/result-store";
import { getParticipantSessionSecret } from "@/lib/results-server";
import { createSignedToken, verifySignedToken } from "@/lib/signed-token";

const participantCodeSchema = z.string().regex(/^RMW-[A-F0-9]{8}$/);
const sessionIdSchema = z.string().uuid();
const boundedJson = z.unknown().refine((value) => JSON.stringify(value).length <= 200000, "Structured result is too large");
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
const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    sessionId: sessionIdSchema,
    participantCode: participantCodeSchema,
    locale: z.enum(["zh-CN", "en"]),
    condition: z.enum(["rmw", "rmw_no_summary", "summary_only"]),
    taskId: z.literal("waste"),
    token: z.string().min(1).max(2000).optional(),
  }),
  z.object({ action: z.literal("event"), token: z.string().min(1).max(2000), event: eventSchema }),
  z.object({ action: z.literal("snapshot"), token: z.string().min(1).max(2000), data: snapshotSchema }),
  z.object({ action: z.literal("complete"), token: z.string().min(1).max(2000), data: snapshotSchema }),
]);

async function participantFromToken(token: string, secret: string) {
  const payload = await verifySignedToken(token, secret);
  if (payload?.scope !== "participant" || typeof payload.participantCode !== "string" || typeof payload.sessionId !== "string") return null;
  if (!participantCodeSchema.safeParse(payload.participantCode).success || !sessionIdSchema.safeParse(payload.sessionId).success) return null;
  return { participantCode: payload.participantCode, sessionId: payload.sessionId };
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
      const { sessionId, participantCode, locale, condition, taskId, token: resumeToken } = parsed.data;
      const existing = await findSession(sessionId);
      if (existing) {
        const resumedSession = resumeToken ? await participantFromToken(resumeToken, sessionSecret) : null;
        if (resumedSession?.sessionId !== sessionId || resumedSession.participantCode !== participantCode) {
          return NextResponse.json({ error: "Study session is already in use" }, { status: 409 });
        }
      } else {
        await createParticipant({ sessionId, participantCode, locale, condition, taskId });
      }
      const token = await createSignedToken({
        scope: "participant",
        participantCode,
        sessionId,
        exp: Date.now() + 12 * 60 * 60 * 1000,
      }, sessionSecret);
      return NextResponse.json({ mode: storageMode, token, sessionId });
    }

    const session = await participantFromToken(parsed.data.token, sessionSecret);
    if (!session) return NextResponse.json({ error: "Invalid participant session" }, { status: 401 });

    if (parsed.data.action === "event") {
      const event = parsed.data.event;
      if (event.sessionId !== session.sessionId) return NextResponse.json({ error: "Event session does not match token" }, { status: 403 });
      await saveResultEvent(session.sessionId, session.participantCode, {
        id: event.id,
        sequence_number: event.sequenceNumber,
        event_type: event.type,
        stage: event.stage,
        target_type: event.targetType || null,
        target_id: event.targetId || null,
        payload: event.payload,
        client_timestamp: event.at,
      });
      return NextResponse.json({ mode: "saved" });
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
    }, parsed.data.action === "complete");
    return NextResponse.json({ mode: parsed.data.action === "complete" ? "completed" : "saved" });
  } catch (error) {
    console.error("Result storage request failed", { action: parsed.data.action, storageMode, error });
    return NextResponse.json({ error: "Could not save research result" }, { status: 502 });
  }
}
