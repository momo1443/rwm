alter table public.participant_results
  add column if not exists task_assessment jsonb;

comment on column public.participant_results.task_assessment is
  'Task-specific T1/T2/T3 assessment payload. City policy v1 stores option ranking, criterion ranking, rationale, uncertainty, confidence, and submission timestamps.';
