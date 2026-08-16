import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deleteParticipant, readAllResults, resultStorageMode, reviewBlindOutcome, reviewParticipant } from "@/lib/result-store";
import { chatCounts, interruptionMetrics, taskMilestones } from "@/lib/admin-result-metrics";
import { ADMIN_COOKIE, getResearcherAuthConfig } from "@/lib/results-server";
import { verifySignedToken } from "@/lib/signed-token";
import { getResearchTask, isResearchTaskId, researchTaskMetadata } from "@/lib/research-task";
import { cityPolicyRecoveryMetrics, type CityPolicyAssessment } from "@/lib/city-policy-assessment";
import type { RecoveryAssessment } from "@/lib/recovery-assessment";

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
const rubricScoresSchema = z.object({
  goal_continuity: z.number().int().min(0).max(4),
  reasoning_position: z.number().int().min(0).max(4),
  evidence_integration: z.number().int().min(0).max(4),
  uncertainty_preservation: z.number().int().min(0).max(4),
  actionable_next_step: z.number().int().min(0).max(4),
}).strict();
const blindReviewSchema = z.object({
  blindId: z.string().regex(/^B-[A-F0-9]{12}$/),
  blindReviewScores: z.object({ before: rubricScoresSchema, after: rubricScoresSchema }).strict(),
  blindReviewNote: z.string().trim().max(2000).nullable().optional(),
});
const deleteSchema = z.object({ sessionId: sessionIdSchema, confirmation: z.string() });

function blindIdFor(sessionId: string) {
  return `B-${createHash("sha256").update(sessionId).digest("hex").slice(0, 12).toUpperCase()}`;
}

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
    if (request.nextUrl.searchParams.get("view") === "blind") {
      const eligible = database.results
        .filter((result) => result.status === "completed" && (result.analysis_status || "included") === "included" && result.phase_one_captured_at && result.phase_one_memo !== null && result.memo !== null)
        .map((result) => ({
          blind_id: blindIdFor(result.session_id),
          locale: result.locale,
          task_id: result.task_id,
          task_label: researchTaskMetadata(result.task_id).label,
          task_question: isResearchTaskId(result.task_id) ? getResearchTask(result.task_id).question[result.locale === "en" ? "en" : "zh-CN"] : "旧版垃圾分类研究任务",
          phase_one_memo: result.phase_one_memo,
          final_memo: result.memo,
          blind_review_scores: result.blind_review_scores,
          blind_review_note: result.blind_review_note,
          blind_reviewed_at: result.blind_reviewed_at,
        }))
        .sort((left, right) => left.blind_id.localeCompare(right.blind_id));
      return NextResponse.json({ mode: resultStorageMode(), rubricVersion: "recovery-outcome-v2-task-context", results: eligible });
    }
    const exportMode = request.nextUrl.searchParams.get("export");
    if (exportMode === "1" || exportMode === "analysis") {
      const results = exportMode === "analysis"
        ? database.results.filter((result) => (result.analysis_status || "included") === "included" && result.status === "completed")
        : database.results;
      const sessionIds = new Set(results.map((result) => result.session_id));
      return NextResponse.json({
        schemaVersion: "rmw-research-results-v10-reasoning-recovery",
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
      .filter((result) => result.status === "completed")
      .map((result) => {
        const sessionEvents = (eventsBySession.get(result.session_id) || []).toSorted((left, right) => left.sequence_number - right.sequence_number);
        const interruption = interruptionMetrics(sessionEvents);
        const conversation = chatCounts(Array.isArray(result.chat) ? result.chat as Array<{ role: "user" | "assistant"; text: string }> : null);
        const milestones = taskMilestones(sessionEvents, result.status);
        const taskMetadata = researchTaskMetadata(result.task_id);
        const assessmentVersion = result.task_assessment && typeof result.task_assessment === "object" && "version" in result.task_assessment
          ? String(result.task_assessment.version)
          : null;
        const cityMetrics = result.task_id === "city_policy" && assessmentVersion === "city-policy-recovery-v1"
          ? cityPolicyRecoveryMetrics(result.task_assessment as CityPolicyAssessment)
          : null;
        const recoveryAssessment = assessmentVersion === "reasoning-recovery-v2" ? result.task_assessment as RecoveryAssessment : null;
        const probeCount = recoveryAssessment ? ["t1", "t2", "t3"].filter((stage) => Boolean(recoveryAssessment.probes[stage as keyof typeof recoveryAssessment.probes])).length : 0;
        const phaseOneMaterialCompletionIds = new Set(sessionEvents.filter((event) => event.event_type === "material_exposure_completed" && event.stage === "research_work").map((event) => event.target_id).filter(Boolean));
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
        chat_turn_count: conversation.total,
        user_chat_turn_count: conversation.user,
        assistant_chat_turn_count: conversation.assistant,
        has_recall: Boolean(result.recall && Object.values(result.recall).some((value) => value.trim())),
        recall_answer_count: result.recall ? Object.values(result.recall).filter((value) => value.trim()).length : 0,
        has_problem_state: Boolean(result.problem_state),
        task_steps_complete: milestones.filter((milestone) => milestone.complete).length,
        task_steps_total: milestones.length,
        interruption_completed: interruption.completed,
        letter_accuracy: interruption.letter.accuracy,
        letter_attempts: interruption.letter.attempts,
        color_accuracy: interruption.color.accuracy,
        color_attempts: interruption.color.attempts,
        event_count: sessionEvents.length,
        event_sequence_complete: sessionEvents.length > 0 && sessionEvents.every((event, index) => event.sequence_number === index + 1),
        initial_material_presented: sessionEvents.some((event) => event.event_type === "material_presented" && event.stage === "research_work" && event.target_id === taskMetadata.firstMaterialId),
        initial_material_id: taskMetadata.firstMaterialId,
        expected_material_count: taskMetadata.initialMaterialCount,
        material_completion_count: phaseOneMaterialCompletionIds.size,
        recovery_new_material_exposed: taskMetadata.recoveryMaterialId === null ? null : sessionEvents.some((event) => event.event_type === "material_exposure_completed" && event.stage === "recovery" && event.target_id === taskMetadata.recoveryMaterialId),
        recovery_rendered: sessionEvents.some((event) => event.event_type === "recovery_support_rendered"),
        recovery_tabs: recoveryTabs,
        assessment_version: assessmentVersion,
        recovery_probe_count: probeCount,
        recovery_probe_complete: probeCount === 3,
        content_probe_complete: Boolean(recoveryAssessment?.probes.t1?.content.length === 6 && recoveryAssessment?.probes.t2?.content.length === 6),
        recovery_readiness_seconds: recoveryAssessment?.readiness ? recoveryAssessment.readiness.latencyMs / 1000 : null,
        participant_notes_present: Boolean(recoveryAssessment?.participantNotes),
        post_survey_complete: Boolean(recoveryAssessment?.postSurvey && Object.values(recoveryAssessment.postSurvey).length === 5),
        city_policy_t2_accuracy: cityMetrics?.t2StateAccuracy ?? null,
        city_policy_t3_accuracy: cityMetrics?.t3StateAccuracy ?? null,
        city_policy_recovery_gain: cityMetrics?.recoveryGain ?? null,
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
  const body = await request.json().catch(() => null);
  const blindParsed = blindReviewSchema.safeParse(body);
  if (blindParsed.success) {
    try {
      const database = await readAllResults();
      const result = database.results.find((candidate) => blindIdFor(candidate.session_id) === blindParsed.data.blindId);
      if (!result) return NextResponse.json({ error: "Blind review item not found" }, { status: 404 });
      if (result.status !== "completed" || (result.analysis_status || "included") !== "included" || !result.phase_one_captured_at) {
        return NextResponse.json({ error: "Result is not eligible for blind review" }, { status: 409 });
      }
      await reviewBlindOutcome(result.session_id, {
        scores: blindParsed.data.blindReviewScores,
        note: blindParsed.data.blindReviewNote || null,
      });
      return NextResponse.json({ ok: true });
    } catch (error) {
      console.error("Blind result review failed", { storageMode: resultStorageMode(), error });
      return NextResponse.json({ error: "Could not save blind review" }, { status: 502 });
    }
  }
  const parsed = reviewSchema.safeParse(body);
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
