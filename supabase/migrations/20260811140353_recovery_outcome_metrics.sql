alter table public.participant_results
  add column if not exists phase_one_memo text,
  add column if not exists phase_one_chat jsonb,
  add column if not exists phase_one_captured_at timestamptz,
  add column if not exists blind_review_scores jsonb,
  add column if not exists blind_review_note text,
  add column if not exists blind_reviewed_at timestamptz;

alter table public.participant_results
  drop constraint if exists participant_results_blind_review_scores_check;

alter table public.participant_results
  add constraint participant_results_blind_review_scores_check
  check (
    blind_review_scores is null
    or (
      jsonb_typeof(blind_review_scores) = 'object'
      and jsonb_typeof(blind_review_scores -> 'before') = 'object'
      and jsonb_typeof(blind_review_scores -> 'after') = 'object'
      and (blind_review_scores -> 'before') ?& array['goal_continuity', 'reasoning_position', 'evidence_integration', 'uncertainty_preservation', 'actionable_next_step']
      and (blind_review_scores -> 'after') ?& array['goal_continuity', 'reasoning_position', 'evidence_integration', 'uncertainty_preservation', 'actionable_next_step']
    )
  );

create or replace function public.preserve_phase_one_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.phase_one_captured_at is not null then
    new.phase_one_memo := old.phase_one_memo;
    new.phase_one_chat := old.phase_one_chat;
    new.phase_one_captured_at := old.phase_one_captured_at;
  end if;
  return new;
end;
$$;

revoke all on function public.preserve_phase_one_snapshot() from public, anon, authenticated;

drop trigger if exists preserve_phase_one_snapshot on public.participant_results;
create trigger preserve_phase_one_snapshot
before update of phase_one_memo, phase_one_chat, phase_one_captured_at
on public.participant_results
for each row execute function public.preserve_phase_one_snapshot();
