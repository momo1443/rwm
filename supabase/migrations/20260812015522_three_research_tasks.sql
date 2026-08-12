alter table public.participant_results
  drop constraint if exists participant_results_task_id_check;

alter table public.participant_results
  add constraint participant_results_task_id_check
  check (
    task_id in ('city_policy', 'ai_course_policy', 'night_transit')
    or (
      task_id = 'waste'
      and created_at < timestamptz '2026-08-12 03:00:00+00'
    )
  )
  not valid;

comment on constraint participant_results_task_id_check on public.participant_results is
  'New study runs use one of three research tasks. The dated exception preserves earlier waste-task pilot rows during researcher review.';
