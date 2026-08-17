import type { ProblemStateSnapshot } from "./rmw-types";

const TOKEN_KEY = "rmw-participant-session-token";
const TOKEN_SESSION_KEY = "rmw-participant-token-session-id";
const SESSION_KEY = "rmw-study-session-id";
const SNAPSHOT_OUTBOX_PREFIX = "rmw-result-snapshot-outbox";
const EVENT_OUTBOX_PREFIX = "rmw-result-event-outbox";

type ChatTurn = { role: "user" | "assistant"; text: string };
type Snapshot = {
  preSurvey?: Record<string, number>;
  phaseOneMemo?: string;
  phaseOneChat?: ChatTurn[];
  phaseOneCapturedAt?: string;
  memo?: string;
  chat?: ChatTurn[];
  problemState?: ProblemStateSnapshot | null;
  recall?: Record<string, string>;
  recoveryState?: unknown;
  taskAssessment?: unknown;
};

let flushQueue: Promise<boolean> = Promise.resolve(true);

function activeSessionId() {
  return typeof window === "undefined" ? "" : sessionStorage.getItem(SESSION_KEY) || "";
}

function storageKey(prefix: string, sessionId: string) {
  return `${prefix}:${sessionId}`;
}

function readObject<T extends object>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return parsed && typeof parsed === "object" ? parsed as T : fallback;
  } catch {
    return fallback;
  }
}

function writeObject(key: string, value: object) {
  if (typeof window !== "undefined") localStorage.setItem(key, JSON.stringify(value));
}

async function postResult(body: Record<string, unknown>) {
  try {
    const response = await fetch("/api/results", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    return await response.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function flushOutboxes(sessionId: string, completed = false): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!sessionId || sessionStorage.getItem(TOKEN_SESSION_KEY) !== sessionId) return false;
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) return false;

  const snapshotKey = storageKey(SNAPSHOT_OUTBOX_PREFIX, sessionId);
  const snapshot = readObject<Snapshot>(snapshotKey, {});
  let snapshotSaved = !completed;
  if (completed || Object.keys(snapshot).length) {
    const sentSnapshot = JSON.stringify(snapshot);
    const result = await postResult({ action: completed ? "complete" : "snapshot", token, data: snapshot });
    snapshotSaved = completed ? result?.mode === "completed" : result?.mode === "saved";
    if (snapshotSaved && localStorage.getItem(snapshotKey) === sentSnapshot) {
      localStorage.removeItem(snapshotKey);
    }
  }

  const eventKey = storageKey(EVENT_OUTBOX_PREFIX, sessionId);
  const events = readObject<Record<string, unknown>[]>(eventKey, []);
  let eventsSaved = true;
  for (const event of events) {
    const result = await postResult({ action: "event", token, event });
    if (!result) {
      eventsSaved = false;
      break;
    }
    const current = readObject<Record<string, unknown>[]>(eventKey, []);
    const remaining = current.filter((saved) => saved.id !== event.id);
    if (remaining.length) writeObject(eventKey, remaining);
    else localStorage.removeItem(eventKey);
  }
  return snapshotSaved && eventsSaved;
}

function queueFlush(sessionId: string, completed = false) {
  flushQueue = flushQueue.then(() => flushOutboxes(sessionId, completed)).catch(() => false);
  return flushQueue;
}

export async function startRemoteStudySession(input: { sessionId: string; participantCode: string; locale: string; condition: string; taskId: string; assignmentMode: "auto" | "manual" }) {
  const existingToken = typeof window === "undefined" || sessionStorage.getItem(TOKEN_SESSION_KEY) !== input.sessionId
    ? ""
    : sessionStorage.getItem(TOKEN_KEY) || "";
  const result = await postResult({ action: "start", ...input, token: existingToken || undefined });
  if (typeof result?.token !== "string" || result.sessionId !== input.sessionId || typeof result.condition !== "string" || typeof result.taskId !== "string") return null;
  sessionStorage.setItem(TOKEN_KEY, result.token);
  sessionStorage.setItem(TOKEN_SESSION_KEY, input.sessionId);
  await queueFlush(input.sessionId);
  return { condition: result.condition, taskId: result.taskId };
}

export function syncRemoteEvent(event: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const sessionId = typeof event.sessionId === "string" ? event.sessionId : "";
  if (!sessionId) return;
  const key = storageKey(EVENT_OUTBOX_PREFIX, sessionId);
  const events = readObject<Record<string, unknown>[]>(key, []);
  if (!events.some((saved) => saved.id === event.id)) writeObject(key, [...events, event].slice(-1000));
  void queueFlush(sessionId);
}

export function saveRemoteStudySnapshot(input: Snapshot) {
  if (typeof window === "undefined") return;
  const sessionId = activeSessionId();
  if (!sessionId) return;
  const key = storageKey(SNAPSHOT_OUTBOX_PREFIX, sessionId);
  writeObject(key, { ...readObject<Snapshot>(key, {}), ...input });
  void queueFlush(sessionId);
}

export async function completeRemoteStudy(input: Pick<Snapshot, "memo" | "chat" | "problemState" | "taskAssessment">) {
  if (typeof window === "undefined") return false;
  const sessionId = activeSessionId();
  if (!sessionId) return false;
  const key = storageKey(SNAPSHOT_OUTBOX_PREFIX, sessionId);
  writeObject(key, { ...readObject<Snapshot>(key, {}), ...input });
  return queueFlush(sessionId, true);
}
