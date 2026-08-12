# RMW — Reasoning Memory Workspace

A bilingual-interface, interruption-resilient research workspace for the CHI 2027 RMW study. Participants complete one of three research tasks—multi-criteria policy choice, evidence synthesis about generative AI in university courses, or campus night-transport design—collaborate with an evidence-grounded AI tutor, draft a 600–900 Chinese-character memo, and recover their reasoning after interruption.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Useful review routes:

- `/` — participant entry and full demo flow
- `/?condition=rmw` — participant-facing Method 1; full RMW with recovery brief, reasoning cards, and network
- `/?condition=rmw_no_summary` — participant-facing Method 2; RMW cards and network without the AI recovery summary
- `/?condition=summary_only` — participant-facing Method 3; AI recovery summary only
- `/?task=city_policy` — multi-criteria city-policy decision
- `/?task=ai_course_policy` — evidence synthesis about generative AI in university courses
- `/?task=night_transit` — campus night-transport planning under constraints
- `/?view=task` — Phase 1 and final memo requirements
- `/?view=work` — Phase 1 workspace for the selected task
- `/?view=checkpoint` — one-minute RMW save window with an extracted problem state and knowledge network
- `/?view=interruption` — letter 2-back and color-recognition interruption tasks
- `/?view=recovery` — RMW recovery workspace
- `/?view=recovery&condition=summary_only&lang=en` — English AI-summary-only condition
- `/?view=recall` — unsupported recall gate
- `/admin` — password-protected researcher results console
- `/admin/blind-review` — condition-blinded pre/post memo rubric

The participant flow uses one fixed task and does not expose a topic chooser. The entry screen exposes condition selection for researcher testing; a formal study should assign the condition through a randomized study link rather than participant choice. Configure `.env.local` from `.env.example` to enable DeepSeek and result collection.

The current build starts in the **formal timed protocol**. Phase 1 and recovery each last 10 minutes; Phase 1's save window opens in the final three minutes, and formal recovery cannot end early. Add `?test=1` only for local interface review.

## DeepSeek

The server routes use DeepSeek's OpenAI-compatible Chat Completions API for evidence-grounded tutoring and pre-interruption reasoning-state extraction. Keep the key server-side:

```bash
DEEPSEEK_API_KEY=your_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
```

Create `.env.local` in this directory, add the values above, and restart `npm run dev`. Do not prefix the key with `NEXT_PUBLIC_`, paste it into a component, or commit `.env.local`.

The participant does not choose the model. The server uses `DEEPSEEK_MODEL`, falling back to `deepseek-v4-flash`. Without `DEEPSEEK_API_KEY`, the tutor reports that AI is unavailable and the checkpoint does not generate or display a Problem State. The platform never substitutes scripted replies or preset cards for a failed or unavailable model call. In Vercel, add the same values under Project Settings → Environment Variables and redeploy.

## Experimental-task controls

- Participant-facing code uses three task-specific evidence packs. A task-specific new source or constraint is revealed only after the interruption.
- The English interface does not translate the validated Chinese stimulus paragraphs; an unpiloted translation must not become another task condition.
- The pre-task page measures AI use/evaluation, research-task self-efficacy, and prior topic familiarity with multiple 5-point items. These task-specific adaptations must be piloted and reported as adapted measures.

## Implemented RMW study loop

The demo now follows one closed-loop interruption protocol:

1. On entering the save window, attempt to extract candidate problem state from participant-authored memo and chat content. The prefilled task template and assistant greeting do not count as participant reasoning.
2. In the formal timed protocol, run Phase 1 for 10 minutes and open the save window only in its last three minutes. Test mode bypasses this gate.
3. Present the extracted main goal, active and suspended subgoals, rejected path, concise candidate problem state, and a card-linked knowledge network. Participants can select cards and calibrate them with `Accept`, `Edit`, `Pin`, `Uncertain`, and `Expire`.
4. In the formal timed protocol, keep the save window visible for at least one minute before the participant can continue. Test mode bypasses this gate.
5. Run both a letter 2-back task and a color-recognition task. Each task requires a perfect score; otherwise it restarts.
6. Collect three unsupported-recall responses before revealing recovery support.
7. Resume with a minimal brief first, then reasoning cards, source backlinks, and the knowledge network.
8. Continue research with editable reasoning cards while the local interaction history supports the current browser session.

The three conditions share the same task, checkpoint, interruption, unsupported recall, and fixed recovery duration. Full `rmw` shows the recovery brief, reasoning cards, and network; `rmw_no_summary` shows the cards and network without the brief; `summary_only` shows only the AI-generated recovery summary.

For local review, append `?test=1` (or `&test=1` when a query already exists) to bypass timing gates. Without that explicit flag, the formal 10-minute Phase 1, one-minute checkpoint, and 10-minute recovery timing are enforced.

The DeepSeek tutor uses a conversational research-partner prompt: it responds to the participant's current intent, uses ordinary short paragraphs, structures only when useful, cites materials for consequential claims, and preserves uncertainty without forcing fixed labels or a repeated answer template. The extraction prompt separately produces the bounded reasoning-card set and relations for the knowledge network from the same trace.

## Protected research results

The participant client can only write through `/api/results`; it has no result-reading endpoint. Each write after consent requires a short-lived token signed by the server. `/api/research/results` requires a separate researcher session stored in an `HttpOnly`, `SameSite=Strict` cookie, and `/admin` is marked `noindex`. Database credentials and the researcher password never enter the participant bundle.

The system saves the pre-survey, an immutable pre-interruption memo/chat snapshot, final memo and AI conversation, calibrated Problem State, unsupported recall, recovery-state edits, completion status, and interaction events. Memo and AI events carry the actual `research_work` or `recovery` stage. Browser outboxes retain unsent snapshots and events and retry them after a participant session becomes available.

For local rehearsal, set these server-side values. Results are written to `.rmw-results/results.json`; this mode is for one trusted machine only.

```bash
RMW_LOCAL_RESULTS_DIR=.rmw-results
PARTICIPANT_SESSION_SECRET=replace-with-a-long-random-secret
RESEARCHER_ADMIN_PASSWORD=replace-with-a-strong-researcher-password
RESEARCHER_SESSION_SECRET=replace-with-a-different-long-random-secret
```

For a deployed website, apply all files in `supabase/migrations/` in timestamp order, including `20260812090000_city_policy_recovery_assessment.sql`, omit `RMW_LOCAL_RESULTS_DIR`, and configure:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-service-role-or-secret-key
PARTICIPANT_SESSION_SECRET=replace-with-a-long-random-secret
RESEARCHER_ADMIN_PASSWORD=replace-with-a-strong-researcher-password
RESEARCHER_SESSION_SECRET=replace-with-a-different-long-random-secret
```

Never prefix the Supabase secret, researcher password, or session secrets with `NEXT_PUBLIC_`. A deployment without Supabase does not silently fall back to an ephemeral production file; configure Supabase explicitly so results survive restarts and scaling.

Use `npm run sites:build` to produce the edge-deployable bundle in `dist/`.
