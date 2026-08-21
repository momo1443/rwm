import { syncRemoteEvent } from "./remote-results";

export interface StudyEvent {
  id: string;
  sessionId: string;
  type: string;
  stage: string;
  targetType?: string;
  targetId?: string;
  sequenceNumber: number;
  payload: Record<string, unknown>;
  at: string;
}

export interface ProblemStateAction {
  type: string;
  stage: string;
  targetType?: string;
  targetId?: string;
  sequenceNumber: number;
  payload: Record<string, unknown>;
  at: string;
}

const STORAGE_KEY = "rmw-demo-events";
const PARTICIPANT_KEY = "rmw-participant-id";
const SESSION_KEY = "rmw-study-session-id";
const TOKEN_SESSION_KEY = "rmw-participant-token-session-id";

export function getOrCreateParticipantId() {
  if (typeof window === "undefined") return "";
  const existing = sessionStorage.getItem(PARTICIPANT_KEY);
  if (existing) return existing;
  const generated = `RMW-${crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
  sessionStorage.setItem(PARTICIPANT_KEY, generated);
  return generated;
}

export function beginStudySession() {
  if (typeof window === "undefined") return "";
  const existing = sessionStorage.getItem(SESSION_KEY);
  const confirmed = sessionStorage.getItem(TOKEN_SESSION_KEY);
  if (existing && existing === confirmed) return existing;
  const sessionId = crypto.randomUUID();
  sessionStorage.setItem(SESSION_KEY, sessionId);
  return sessionId;
}

export function getActiveSessionId() {
  return typeof window === "undefined" ? "" : sessionStorage.getItem(SESSION_KEY) || "";
}

function eventStorageKey(sessionId = getActiveSessionId()) {
  return sessionId ? `${STORAGE_KEY}:${sessionId}` : STORAGE_KEY;
}

export function readStudyEvents(): StudyEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(eventStorageKey()) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const PROBLEM_STATE_ACTIONS = new Set([
  "material_presented",
  "material_opened",
  "material_exposure_completed",
  "phase_criterion_toggled",
  "memo_edited",
  "chat_message_sent",
  "chat_response_received",
  "phase_one_checkpoint_requested",
  "workspace_timer_expired",
]);

export function readProblemStateActions(): ProblemStateAction[] {
  const anonymousCode = getOrCreateParticipantId();
  const sessionId = getActiveSessionId();
  if (!sessionId) return [];
  const allEvents = readStudyEvents();
  const relevant = allEvents.filter((event) =>
    event.sessionId === sessionId
    && event.payload.anonymousCode === anonymousCode
    && event.stage === "research_work"
    && PROBLEM_STATE_ACTIONS.has(event.type));
  const lastMemoEdit = relevant.findLastIndex((event) => event.type === "memo_edited");

  return relevant
    .filter((event, index) => event.type !== "memo_edited" || index === lastMemoEdit)
    .slice(-80)
    .map((event) => {
      const safePayload = { ...event.payload };
      delete safePayload.anonymousCode;
      return {
        type: event.type,
        stage: event.stage,
        targetType: event.targetType,
        targetId: event.targetId,
        sequenceNumber: event.sequenceNumber,
        payload: safePayload,
        at: event.at,
      };
    });
}

export function eventLog(
  type: string,
  payload: Record<string, unknown> = {},
  context: { stage?: string; targetType?: string; targetId?: string } = {},
) {
  if (typeof window === "undefined") return;
  const sessionId = getActiveSessionId();
  if (!sessionId) return;
  const current = readStudyEvents();
  const anonymousCode = getOrCreateParticipantId();
  const item: StudyEvent = {
    id: crypto.randomUUID(),
    sessionId,
    type,
    stage: context.stage || "unknown",
    targetType: context.targetType,
    targetId: context.targetId,
    sequenceNumber: (current.at(-1)?.sequenceNumber || 0) + 1,
    payload: { anonymousCode, ...payload },
    at: new Date().toISOString(),
  };
  localStorage.setItem(eventStorageKey(sessionId), JSON.stringify([...current, item].slice(-1000)));
  syncRemoteEvent(item as unknown as Record<string, unknown>);
}
