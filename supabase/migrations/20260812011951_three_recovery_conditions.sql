alter table public.participant_results
  drop constraint if exists participant_results_condition_check;

alter table public.participant_results
  add constraint participant_results_condition_check
  check (
    condition in ('rmw', 'rmw_no_summary', 'summary_only')
    or (
      condition in ('summary', 'notes', 'control')
      and created_at < timestamptz '2026-08-12 01:19:51+00'
    )
  )
  not valid;

comment on constraint participant_results_condition_check on public.participant_results is
  'New study runs use full RMW, RMW without AI summary, or AI summary only. The dated exception preserves earlier pilot rows during researcher review.';
