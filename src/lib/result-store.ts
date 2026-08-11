import path from "node:path";
import { getResultStorageConfig } from "./results-server";

export type ParticipantResultRow = {
  session_id: string;
  participant_code: string;
  locale: string;
  condition: string;
  task_id: string;
  status: "started" | "completed";
  consented_at: string;
  completed_at: string | null;
  pre_survey: Record<string, number> | null;
  memo: string | null;
  chat: unknown;
  problem_state: unknown;
  recall: Record<string, string> | null;
  recovery_state: unknown;
  analysis_status: AnalysisStatus;
  exclusion_reason: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AnalysisStatus = "included" | "excluded" | "trashed";

export type ResultEventRow = {
  id: string;
  session_id: string;
  participant_code: string;
  sequence_number: number;
  event_type: string;
  stage: string;
  target_type: string | null;
  target_id: string | null;
  payload: Record<string, unknown>;
  client_timestamp: string;
  server_timestamp: string;
};

export type ResultDatabase = { results: ParticipantResultRow[]; events: ResultEventRow[] };
export type ResultEventInput = Omit<ResultEventRow, "session_id" | "participant_code" | "server_timestamp">;
export type ResultUpdate = Partial<Pick<ParticipantResultRow, "pre_survey" | "memo" | "chat" | "problem_state" | "recall" | "recovery_state">>;
export type ReviewUpdate = {
  analysisStatus: AnalysisStatus;
  exclusionReason: string | null;
  reviewNote: string | null;
};

const EMPTY_DATABASE: ResultDatabase = { results: [], events: [] };
let localWriteQueue = Promise.resolve();

async function fileApi() {
  return await import("node:fs/promises");
}

function localDatabasePath(directory: string) {
  return path.join(path.resolve(process.cwd(), directory), "results.json");
}

function legacySessionId(participantCode: string) {
  const suffix = participantCode.replace(/^RMW-/, "").toLowerCase().padEnd(12, "0");
  return `00000000-0000-4000-8000-${suffix}`;
}

async function readLocalDatabase(directory: string): Promise<ResultDatabase> {
  const { readFile } = await fileApi();
  try {
    const parsed = JSON.parse(await readFile(localDatabasePath(directory), "utf8")) as Partial<ResultDatabase>;
    const results = Array.isArray(parsed.results)
      ? parsed.results.map((result) => ({ ...result, session_id: result.session_id || legacySessionId(result.participant_code) }))
      : [];
    const sessionByParticipant = new Map(results.map((result) => [result.participant_code, result.session_id]));
    const events = Array.isArray(parsed.events)
      ? parsed.events.map((event) => ({ ...event, session_id: event.session_id || sessionByParticipant.get(event.participant_code) || legacySessionId(event.participant_code) }))
      : [];
    return { results, events };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(EMPTY_DATABASE);
    throw error;
  }
}

async function updateLocalDatabase(directory: string, update: (database: ResultDatabase) => void) {
  const operation = localWriteQueue.then(async () => {
    const database = await readLocalDatabase(directory);
    update(database);
    const target = localDatabasePath(directory);
    const { mkdir, rename, writeFile } = await fileApi();
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    const temporary = `${target}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(database, null, 2), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, target);
  });
  localWriteQueue = operation.catch(() => undefined);
  await operation;
}

async function supabaseRequest<T>(pathName: string, init: RequestInit = {}) {
  const config = getResultStorageConfig();
  if (!config || config.mode !== "supabase") throw new Error("Supabase is not configured");
  const response = await fetch(`${config.url}/rest/v1/${pathName}`, {
    ...init,
    headers: {
      apikey: config.secret,
      authorization: `Bearer ${config.secret}`,
      "content-type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Supabase request failed (${response.status})`);
  if (response.status === 204 || response.headers.get("content-length") === "0") return null as T;
  return await response.json() as T;
}

export function resultStorageMode() {
  return getResultStorageConfig()?.mode || null;
}

export async function findSession(sessionId: string) {
  const config = getResultStorageConfig();
  if (!config) return null;
  if (config.mode === "local") {
    return (await readLocalDatabase(config.directory)).results.find((result) => result.session_id === sessionId) || null;
  }
  const rows = await supabaseRequest<ParticipantResultRow[]>(`participant_results?session_id=eq.${encodeURIComponent(sessionId)}&limit=1`);
  return rows[0] || null;
}

export async function createParticipant(input: { sessionId: string; participantCode: string; locale: string; condition: string; taskId: string }) {
  const config = getResultStorageConfig();
  if (!config) throw new Error("Result storage is not configured");
  const now = new Date().toISOString();
  const row: ParticipantResultRow = {
    session_id: input.sessionId,
    participant_code: input.participantCode,
    locale: input.locale,
    condition: input.condition,
    task_id: input.taskId,
    status: "started",
    consented_at: now,
    completed_at: null,
    pre_survey: null,
    memo: null,
    chat: null,
    problem_state: null,
    recall: null,
    recovery_state: null,
    analysis_status: "included",
    exclusion_reason: null,
    review_note: null,
    reviewed_at: null,
    created_at: now,
    updated_at: now,
  };
  if (config.mode === "local") {
    await updateLocalDatabase(config.directory, (database) => {
      if (database.results.some((result) => result.session_id === input.sessionId)) return;
      database.results.push(row);
    });
    return;
  }
  const supabaseRow: Partial<ParticipantResultRow> = { ...row };
  delete supabaseRow.analysis_status;
  delete supabaseRow.exclusion_reason;
  delete supabaseRow.review_note;
  delete supabaseRow.reviewed_at;
  await supabaseRequest("participant_results", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify(supabaseRow) });
}

export async function saveResultEvent(sessionId: string, participantCode: string, event: ResultEventInput) {
  const config = getResultStorageConfig();
  if (!config) throw new Error("Result storage is not configured");
  const row: ResultEventRow = { ...event, session_id: sessionId, participant_code: participantCode, server_timestamp: new Date().toISOString() };
  if (config.mode === "local") {
    await updateLocalDatabase(config.directory, (database) => {
      if (database.events.some((saved) => saved.id === row.id || (saved.session_id === sessionId && saved.sequence_number === row.sequence_number))) return;
      database.events.push(row);
    });
    return;
  }
  await supabaseRequest("participant_result_events?on_conflict=id", {
    method: "POST",
    headers: { prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify(row),
  });
}

export async function updateParticipant(sessionId: string, update: ResultUpdate, completed: boolean) {
  const config = getResultStorageConfig();
  if (!config) throw new Error("Result storage is not configured");
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { ...update, updated_at: now };
  if (completed) Object.assign(patch, { status: "completed", completed_at: now });
  if (config.mode === "local") {
    await updateLocalDatabase(config.directory, (database) => {
      const result = database.results.find((candidate) => candidate.session_id === sessionId);
      if (!result) throw new Error("Participant not found");
      Object.assign(result, patch);
    });
    return;
  }
  await supabaseRequest(`participant_results?session_id=eq.${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
}

export async function readAllResults(): Promise<ResultDatabase> {
  const config = getResultStorageConfig();
  if (!config) return structuredClone(EMPTY_DATABASE);
  if (config.mode === "local") return readLocalDatabase(config.directory);
  const [results, events] = await Promise.all([
    supabaseRequest<ParticipantResultRow[]>("participant_results?select=*&order=created_at.asc"),
    supabaseRequest<ResultEventRow[]>("participant_result_events?select=*&order=server_timestamp.asc"),
  ]);
  return { results, events };
}

export async function reviewParticipant(sessionId: string, update: ReviewUpdate) {
  const config = getResultStorageConfig();
  if (!config) throw new Error("Result storage is not configured");
  const patch = {
    analysis_status: update.analysisStatus,
    exclusion_reason: update.analysisStatus === "included" ? null : update.exclusionReason,
    review_note: update.reviewNote,
    reviewed_at: new Date().toISOString(),
  };
  if (config.mode === "local") {
    await updateLocalDatabase(config.directory, (database) => {
      const result = database.results.find((candidate) => candidate.session_id === sessionId);
      if (!result) throw new Error("Participant not found");
      Object.assign(result, patch);
    });
    return;
  }
  await supabaseRequest(`participant_results?session_id=eq.${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
}

export async function deleteParticipant(sessionId: string) {
  const config = getResultStorageConfig();
  if (!config) throw new Error("Result storage is not configured");
  if (config.mode === "local") {
    await updateLocalDatabase(config.directory, (database) => {
      const index = database.results.findIndex((candidate) => candidate.session_id === sessionId);
      if (index < 0) throw new Error("Participant not found");
      database.results.splice(index, 1);
      database.events = database.events.filter((event) => event.session_id !== sessionId);
    });
    return;
  }
  await supabaseRequest(`participant_results?session_id=eq.${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
    headers: { prefer: "return=minimal" },
  });
}
