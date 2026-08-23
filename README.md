# RMW — Reasoning Memory Workspace

A bilingual research platform for the CHI 2027 Reasoning Trace Gap characterization study. Every formal participant completes the same municipal-waste decision task and the same timed interruption protocol.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Useful review routes:

- `/` — participant entry and full demo flow
- `/?task=city_policy` — the fixed multi-criteria city-policy task
- `/?view=task` — Phase 1 and final memo requirements
- `/?view=work` — Phase 1 workspace for the selected task
- `/?view=checkpoint` — T1 review route (the trace is frozen before this screen)
- `/?view=interruption` — two-game 2-back and color-interference block
- `/?view=recovery` — D6 continuation workspace
- `/?view=recall` — T2 unsupported-recall route
- `/admin` — password-protected researcher results console
- `/admin/blind-review` — identity-blinded memo and T1/T2 coding

The participant flow exposes neither a task chooser nor a recovery condition. The formal protocol is 15 minutes of work, an immutable trace freeze, T1, two interruption games, T2, D6, and a 10-minute continuation. Add `?test=1` only for local interface review; test runs are excluded automatically.

## DeepSeek

The server routes use DeepSeek's OpenAI-compatible Chat Completions API for the evidence-grounded tutor. Blind trace inference is an offline analysis branch from the frozen trace and is never shown to participants. Keep the key server-side:

```bash
DEEPSEEK_API_KEY=your_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
```

Create `.env.local` in this directory, add the values above, and restart `npm run dev`. Do not prefix the key with `NEXT_PUBLIC_`, paste it into a component, or commit `.env.local`.

The participant does not choose the model. The server uses `DEEPSEEK_MODEL`, falling back to `deepseek-v4-flash`. Without `DEEPSEEK_API_KEY`, the tutor reports that AI is unavailable. The platform never substitutes scripted replies for a failed model call. In Vercel, add the same values under Project Settings → Environment Variables and redeploy.

## Experimental-task controls

- Participant-facing code uses one fixed evidence pack (D1–D5); D6 is revealed only after T2.
- The English interface does not translate the validated Chinese stimulus paragraphs; an unpiloted translation must not become another task condition.
- The pre-task page measures AI use/evaluation, research-task self-efficacy, and prior topic familiarity with multiple 5-point items. These task-specific adaptations must be piloted and reported as adapted measures.

## Implemented study loop

1. Work with D1–D5, the AI tutor, and the memo editor for exactly 15 minutes.
2. Freeze the memo, conversation, material-exposure set, and event cutoff before any recall prompt appears.
3. Collect T1: six reasoning-position items plus six content items (counterbalanced Form A/B).
4. Complete two untimed interruption games: six letter 2-back trials followed by six color-interference trials. Each game requires a perfect score; a lower score restarts that game. Response time, attempts, and actual completion duration are retained as process measures.
5. Collect unsupported T2 using the parallel content form and the same six reasoning dimensions. No materials, transcript, memo, summary, cards, or other recovery aid are visible.
6. Reveal D6 and run a fixed 10-minute continuation before the post-task survey.

New records use `reasoning-trace-gap-v1`. Historical `reasoning-recovery-v2` records remain exportable but must not be pooled with the new cohort. The primary RQ1 analysis scores reasoning and content at T1/T2; RQ2/RQ3 use offline human trace coding and blind LLM inference against the frozen cutoff.

The DeepSeek tutor uses a conversational research-partner prompt: it responds to the participant's current intent, uses ordinary short paragraphs, structures only when useful, cites materials for consequential claims, and preserves uncertainty without forcing fixed labels or a repeated answer template. The extraction prompt separately produces the bounded reasoning-card set and relations for the knowledge network from the same trace.

## Protected research results

The participant client can only write through `/api/results`; it has no result-reading endpoint. Each write after consent requires a short-lived token signed by the server. `/api/research/results` requires a separate researcher session stored in an `HttpOnly`, `SameSite=Strict` cookie, and `/admin` is marked `noindex`. Database credentials and the researcher password never enter the participant bundle.

The system saves the pre-survey, immutable pre-interruption memo/chat snapshot, trace cutoff metadata, counterbalanced T1/T2 responses, final memo and conversation, interruption responses and reaction times, completion status, and the synchronized event stream. Browser outboxes retain unsent snapshots and events and retry them after a participant session becomes available.

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
