import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deleteParticipant, readAllResults, resultStorageMode, reviewParticipant } from "@/lib/result-store";
import { ADMIN_COOKIE, getResearcherAuthConfig } from "@/lib/results-server";
import { verifySignedToken } from "@/lib/signed-token";

async function isAuthorized(request: NextRequest) {
  const config = getResearcherAuthConfig();
  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  if (!config || !token) return false;
  const payload = await verifySignedToken(token, config.sessionSecret);
  return payload?.scope === "researcher";
}

const sessionIdSchema = z.string().uuid();
const reviewSchema = z.object({
  sessionId: sessionIdSchema,
  analysisStatus: z.enum(["included", "excluded", "trashed"]),
  exclusionReason: z.string().trim().max(120).nullable().optional(),
  reviewNote: z.string().trim().max(1000).nullable().optional(),
});
const deleteSchema = z.object({ sessionId: sessionIdSchema, confirmation: z.string() });

function unavailable() {
  return !getResearcherAuthConfig() || !resultStorageMode();
}

export async function GET(request: NextRequest) {
  if (unavailable()) {
    return NextResponse.json({ mode: "unavailable", error: "Research result storage is not configured" }, { status: 503 });
  }
  if (!await isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const database = await readAllResults();
    const exportMode = request.nextUrl.searchParams.get("export");
    if (exportMode === "1" || exportMode === "analysis") {
      const results = exportMode === "analysis"
        ? database.results.filter((result) => (result.analysis_status || "included") === "included" && result.status === "completed")
        : database.results;
      const sessionIds = new Set(results.map((result) => result.session_id));
      return NextResponse.json({
        schemaVersion: "rmw-research-results-v4",
        storageMode: resultStorageMode(),
        exportedAt: new Date().toISOString(),
        exportMode: exportMode === "analysis" ? "analysis-ready" : "all-raw",
        results,
        events: database.events.filter((event) => sessionIds.has(event.session_id)),
      });
    }

    const sessionId = request.nextUrl.searchParams.get("sessionId");
    if (sessionId) {
      if (!sessionIdSchema.safeParse(sessionId).success) return NextResponse.json({ error: "Invalid session ID" }, { status: 400 });
      const result = database.results.find((candidate) => candidate.session_id === sessionId);
      if (!result) return NextResponse.json({ error: "Participant not found" }, { status: 404 });
      const events = database.events
        .filter((event) => event.session_id === sessionId)
        .sort((left, right) => left.sequence_number - right.sequence_number);
      return NextResponse.json({ mode: resultStorageMode(), result, events });
    }

    const eventsBySession = new Map<string, typeof database.events>();
    for (const event of database.events) {
      const current = eventsBySession.get(event.session_id) || [];
      current.push(event);
      eventsBySession.set(event.session_id, current);
    }
    const results = database.results
      .map((result) => {
        const sessionEvents = (eventsBySession.get(result.session_id) || []).toSorted((left, right) => left.sequence_number - right.sequence_number);
        const materialCompletionIds = new Set(sessionEvents.filter((event) => event.event_type === "material_exposure_completed").map((event) => event.target_id).filter(Boolean));
        const recoveryTabs = [...new Set(sessionEvents.filter((event) => event.event_type === "recovery_tab_viewed").map((event) => event.target_id).filter((value): value is string => Boolean(value)))];
        return {
        session_id: result.session_id,
        participant_code: result.participant_code,
        locale: result.locale,
        condition: result.condition,
        task_id: result.task_id,
        status: result.status,
        consented_at: result.consented_at,
        completed_at: result.completed_at,
        created_at: result.created_at,
        updated_at: result.updated_at,
        analysis_status: result.analysis_status || "included",
        exclusion_reason: result.exclusion_reason || null,
        review_note: result.review_note || null,
        reviewed_at: result.reviewed_at || null,
        pre_survey: result.pre_survey,
        memo_length: result.memo?.trim().length || 0,
        has_recall: Boolean(result.recall && Object.values(result.recall).some((value) => value.trim())),
        has_problem_state: Boolean(result.problem_state),
        event_count: sessionEvents.length,
        event_sequence_complete: sessionEvents.length > 0 && sessionEvents.every((event, index) => event.sequence_number === index + 1),
        initial_material_presented: sessionEvents.some((event) => event.event_type === "material_presented" && event.target_id === "b1"),
        material_completion_count: materialCompletionIds.size,
        recovery_rendered: sessionEvents.some((event) => event.event_type === "recovery_support_rendered"),
        recovery_tabs: recoveryTabs,
      };})
      .sort((left, right) => right.created_at.localeCompare(left.created_at));
    return NextResponse.json({ mode: resultStorageMode(), results });
  } catch (error) {
    console.error("Research result read failed", { storageMode: resultStorageMode(), error });
    return NextResponse.json({ error: "Could not load research results" }, { status: 502 });
  }
}

export async function PATCH(request: NextRequest) {
  if (unavailable()) return NextResponse.json({ error: "Research result storage is not configured" }, { status: 503 });
  if (!await isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid review update" }, { status: 400 });
  if (parsed.data.analysisStatus !== "included" && !parsed.data.exclusionReason) {
    return NextResponse.json({ error: "An exclusion reason is required" }, { status: 400 });
  }
  try {
    await reviewParticipant(parsed.data.sessionId, {
      analysisStatus: parsed.data.analysisStatus,
      exclusionReason: parsed.data.exclusionReason || null,
      reviewNote: parsed.data.reviewNote || null,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Research result review failed", { storageMode: resultStorageMode(), error });
    return NextResponse.json({ error: "Could not update participant review" }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest) {
  if (unavailable()) return NextResponse.json({ error: "Research result storage is not configured" }, { status: 503 });
  if (!await isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.confirmation !== parsed.data.sessionId) {
    return NextResponse.json({ error: "Session ID confirmation does not match" }, { status: 400 });
  }
  try {
    const database = await readAllResults();
    const result = database.results.find((candidate) => candidate.session_id === parsed.data.sessionId);
    if (!result) return NextResponse.json({ error: "Participant not found" }, { status: 404 });
    if ((result.analysis_status || "included") !== "trashed") {
      return NextResponse.json({ error: "Participant must be moved to trash first" }, { status: 409 });
    }
    await deleteParticipant(parsed.data.sessionId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Research result deletion failed", { storageMode: resultStorageMode(), error });
    return NextResponse.json({ error: "Could not delete participant result" }, { status: 502 });
  }
}
